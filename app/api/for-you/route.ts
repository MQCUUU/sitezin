import { getUserProviderFilter, MY_SERVICES_SENTINEL } from "@/lib/streaming-services-server";
import { relevantBrProviders } from "@/lib/streaming/providers-br";
import { getDb } from "@/lib/db/neon";
import { NextRequest, NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { todayIn } from "@/lib/calendar/dates";
import { genreFilterLabels, genreKeyFromParam, GENRE_LABEL, idsForKey, type GenreKey } from "@/lib/for-you/genres";
import { anchorOrder, anchorsPerPage, buildProfile, topGenres, type MediaType, type Profile, type TitleSignal, type WeightedTitle } from "@/lib/for-you/profile";
import { anchorWord, assemble, balanceTypes, isEligible, typeCounts, scoreCandidate, sortScored, type Candidate, type Scored, type SortMode } from "@/lib/for-you/rank";

/*
 * V2.8 — "Para você".
 *
 * TMDB gera candidatos; o perfil do usuário (lib/for-you/profile.ts) decide a
 * ordem, a escolha, o motivo e a mistura (lib/for-you/rank.ts). Ordem de
 * montagem = prioridade do motivo (o mais específico fica com o título):
 *   1. "Porque você gostou de X"  (títulos-âncora do dia, 0–3 conforme os dados)
 *   2. "{Gênero} para você"
 *   3. Bem avaliados no seu estilo
 *   4. Joias escondidas no seu estilo
 *   5. Lançamentos no seu estilo
 *   6. Em alta no seu estilo
 * Sem dados suficientes (cold start) as prateleiras não fingem personalização.
 * `exclude` (títulos já mostrados) garante que "Mais recomendações" não repete.
 * user_id SEMPRE da sessão.
 */
const TMDB_BASE = "https://api.themoviedb.org/3";
const LIMIT = 10;
const MIN_GENERIC = 5;
const MIN_ANCHOR = 4;
const MAX_PAGES = 8;

type ShelfKind = "because" | "genre" | "top_rated" | "gems" | "releases" | "popular";
type Shelf = {
  id: string;
  kind: ShelfKind;
  title: string;
  subtitle?: string;
  icon: "sparkles" | "star" | "film" | "tv" | "gem" | "trending" | "calendar";
  results: Record<string, unknown>[];
};

const num = (value: string | null, fallback: number) => {
  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
};

const SIGNALS_SQL = `
  WITH lib AS (
    SELECT li.id::text AS library_id, li.media_id, m.media_type, m.tmdb_id, m.title, m.original_title, m.genres, li.status,
           li.favorite, li.personal_rating::float AS rating,
           (li.status IN ('rewatched', 'rewatching') OR coalesce(li.rewatch_count, 0) > 0) AS rewatched,
           li.updated_at
    FROM public.library_items li
    JOIN public.media m ON m.id = li.media_id
    WHERE li.user_id = $1
  ),
  hist AS (
    SELECT media_id,
           bool_or(event_type IN ('series_completed', 'watch_logged', 'rewatch_started', 'season_completed')
                   OR (event_type = 'status_changed' AND metadata->>'to' IN ('watched', 'rewatched', 'rewatching'))
                   OR (event_type = 'library_added' AND metadata->>'status' IN ('watched', 'rewatched', 'rewatching'))) AS watched,
           bool_or(event_type = 'rewatch_started') AS rewatched,
           max(occurred_at) AS at
    FROM public.activity_events
    WHERE user_id = $1 AND media_id IS NOT NULL
    GROUP BY media_id
  ),
  last_status AS (
    SELECT DISTINCT ON (media_id) media_id, metadata->>'to' AS status
    FROM public.activity_events
    WHERE user_id = $1 AND media_id IS NOT NULL AND event_type = 'status_changed'
    ORDER BY media_id, occurred_at DESC
  ),
  we AS (
    SELECT media_id, (array_agg(rating ORDER BY watched_at DESC) FILTER (WHERE rating IS NOT NULL))[1]::float AS rating,
           bool_or(is_rewatch) AS rewatched, max(coalesce(watched_at, created_at)) AS at
    FROM public.watch_entries
    WHERE user_id = $1 AND media_id IS NOT NULL
    GROUP BY media_id
  ),
  ep AS (
    SELECT media_id, count(*) FILTER (WHERE watched)::int AS n, bool_or(is_rewatch) AS rewatched, max(watched_at) AS at
    FROM public.episodes_progress
    WHERE user_id = $1 AND media_id IS NOT NULL
    GROUP BY media_id
  ),
  outside AS (
    SELECT media_id FROM hist UNION SELECT media_id FROM we UNION SELECT media_id FROM ep
    EXCEPT SELECT media_id FROM lib
  )
  SELECT lib.library_id, lib.media_type, lib.tmdb_id, lib.title, lib.genres, lib.status, lib.favorite, lib.rating,
         (lib.rewatched OR coalesce(we.rewatched, false) OR coalesce(ep.rewatched, false)) AS rewatched,
         false AS watched_history, coalesce(ep.n, 0) AS episodes_watched, true AS in_library, lib.updated_at,
         lib.original_title
  FROM lib
  LEFT JOIN we ON we.media_id = lib.media_id
  LEFT JOIN ep ON ep.media_id = lib.media_id
  UNION ALL
  SELECT NULL, m.media_type, m.tmdb_id, m.title, m.genres,
         CASE WHEN ls.status = 'dropped' THEN 'dropped' END,
         false, we.rating,
         (coalesce(hist.rewatched, false) OR coalesce(we.rewatched, false) OR coalesce(ep.rewatched, false)),
         (coalesce(hist.watched, false) OR we.media_id IS NOT NULL OR coalesce(ep.n, 0) > 0) AND coalesce(ls.status, '') <> 'dropped',
         coalesce(ep.n, 0), false,
         greatest(hist.at, we.at, ep.at),
         m.original_title
  FROM outside o
  JOIN public.media m ON m.id = o.media_id
  LEFT JOIN hist ON hist.media_id = o.media_id
  LEFT JOIN last_status ls ON ls.media_id = o.media_id
  LEFT JOIN we ON we.media_id = o.media_id
  LEFT JOIN ep ON ep.media_id = o.media_id
  ORDER BY 13 DESC NULLS LAST
  LIMIT 800
`;

export async function GET(req: NextRequest) {
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;

  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const params = url.searchParams;
  const page = Math.min(MAX_PAGES, Math.max(1, Math.floor(num(params.get("page"), 1))));
  const rawType = params.get("type");
  const type: "all" | MediaType = rawType === "movie" || rawType === "tv" ? rawType : "all";
  const genreParam = (params.get("genre") || "").trim();
  const isTeenGenre = genreParam.toLowerCase() === "teen";
  const genreFilter: GenreKey | null = isTeenGenre ? null : genreKeyFromParam(genreParam);
  const provider = (params.get("provider") || "").trim();
  const rawSort = (params.get("sort") || "recommended").trim();
  const sort: SortMode = (["recommended", "rating", "popular", "newest", "hidden"] as const).includes(rawSort as SortMode)
    ? (rawSort as SortMode)
    : "recommended";
  const minRating = Math.max(0, Math.min(10, num(params.get("min_rating"), 0)));
  const year = Math.max(0, Math.floor(num(params.get("year"), 0)));
  const hideWatched = params.get("hide_watched") === "1";
  const onlyNew = params.get("only_new") === "1";
  // títulos já mostrados neste feed (carregar mais não repete)
  const exclude = new Set(
    (params.get("exclude") || "")
      .split(",")
      .slice(0, 600)
      .map((k) => /^(m|t)(\d{1,9})$/.exec(k.trim()))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => `${m[1] === "m" ? "movie" : "tv"}-${m[2]}`)
  );

  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) return NextResponse.json({ error: "TMDB_API_KEY não configurada" }, { status: 500 });

  const language = process.env.TMDB_LANGUAGE || "pt-BR";
  const userId: string = user.id;
  const sql = getDb();

  /* ---------- perfil (sessão) ---------- */
  let signals: (TitleSignal & { library_id: string | null })[] = [];
  let hiddenRows: { media_type: string; tmdb_id: number }[] = [];

  try {
    [signals, hiddenRows] = (await Promise.all([
      sql.query(SIGNALS_SQL, [userId]),
      sql.query(`SELECT media_type, tmdb_id FROM public.user_hidden_titles WHERE user_id = $1`, [userId]).catch((error: unknown) => {
        // Sem a lista de ocultos o Para você ainda funciona; só registra.
        console.warn("[for-you] ocultos indisponíveis:", error instanceof Error ? error.message : String(error));
        return [];
      }),
    ])) as [typeof signals, typeof hiddenRows];
  } catch (error) {
    return respostaDeErro(error, "GET /api/for-you");
  }

  signals = signals.filter((s) => s.tmdb_id && (s.media_type === "movie" || s.media_type === "tv"));

  const profile: Profile = buildProfile(signals);
  const libraryByKey = new Map(signals.filter((s) => s.in_library).map((s) => [`${s.media_type}-${s.tmdb_id}`, s]));
  const hidden = new Set(hiddenRows.map((r) => `${r.media_type}-${r.tmdb_id}`));
  const cold = profile.level === "cold";
  const liked = topGenres(profile, 6);

  /* ---------- TMDB ---------- */
  async function tmdb(path: string, query: Record<string, string> = {}) {
    const search = new URLSearchParams({ api_key: apiKey ?? "", language, ...query });

    try {
      const response = await fetch(`${TMDB_BASE}${path}?${search.toString()}`, { next: { revalidate: 21600 } });

      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }

  const providerFilter = provider === MY_SERVICES_SENTINEL ? await getUserProviderFilter(userId) : provider;
  const needsStreamingSetup = provider === MY_SERVICES_SENTINEL && providerFilter === "";
  const types: MediaType[] = type === "all" ? ["movie", "tv"] : [type];

  async function teenKeywords() {
    if (!isTeenGenre) return [];

    const groups = await Promise.all(
      ["teenager", "high school", "coming of age", "teenage romance"].map(async (term) => {
        const data = await tmdb("/search/keyword", { query: term });

        return Array.isArray(data?.results) ? data.results.slice(0, 3).map((k: { id: number }) => String(k.id)) : [];
      })
    );

    return Array.from(new Set(groups.flat()));
  }

  /* filtros do usuário comuns a todo discover */
  function discoverParams(mediaType: MediaType, base: Record<string, string>, genres: GenreKey[] | null, teen: string[]) {
    const out: Record<string, string> = { include_adult: "false", page: String(page), ...base };
    const genreKeys = genreFilter ? [genreFilter] : genres;

    if (genreKeys?.length) {
      const ids = Array.from(new Set(genreKeys.flatMap((g) => idsForKey(mediaType, g))));

      if (!ids.length) return null; // gênero sem equivalente neste tipo (ex.: Terror em séries)
      out.with_genres = ids.join(genreFilter ? "," : "|");
    }

    if (teen.length) out.with_keywords = teen.join("|");
    if (providerFilter) {
      out.watch_region = "BR";
      out.with_watch_providers = providerFilter;
      if (provider === MY_SERVICES_SENTINEL) out.with_watch_monetization_types = "flatrate|free|ads";
    }
    if (year) out[mediaType === "movie" ? "primary_release_year" : "first_air_date_year"] = String(year);
    if (minRating) out["vote_average.gte"] = String(Math.max(minRating, Number(out["vote_average.gte"] || 0)));

    return out;
  }

  async function discover(mediaType: MediaType, base: Record<string, string>, genres: GenreKey[] | null, teen: string[]) {
    if (needsStreamingSetup) return [];

    const query = discoverParams(mediaType, base, genres, teen);

    if (!query) return [];

    const data = await tmdb(`/discover/${mediaType}`, query);

    return (Array.isArray(data?.results) ? data.results : []).map((c: Candidate) => ({ ...c, media_type: mediaType }));
  }

  /* ---------- elegibilidade e exclusões ---------- */
  function allowed(c: Candidate) {
    const key = `${c.media_type}-${c.id}`;

    if (hidden.has(key) || exclude.has(key)) return false;
    if (type !== "all" && c.media_type !== type) return false;
    if (minRating && Number(c.vote_average || 0) < minRating) return false;
    if (year && Number(String(c.release_date || c.first_air_date || "").slice(0, 4)) !== year) return false;
    // assistido = Biblioteca OU histórico preservado fora dela (V2.5)
    if (hideWatched && profile.watched.has(key)) return false;
    if (onlyNew && libraryByKey.has(key)) return false;
    if (genreFilter && c.genre_ids && !c.genre_ids.some((id) => idsForKey(c.media_type, genreFilter).includes(Number(id)))) return false;

    return true;
  }

  const today = todayIn(); // V3.4: o "dia" da rotação é o de Brasília (regra do Calendário)
  const anchorsAll = anchorOrder(profile, `${userId}|${today}`).filter((a) => type === "all" || a.media_type === type);
  const perPage = providerFilter || isTeenGenre || genreFilter ? 0 : anchorsPerPage(profile);
  const anchors = anchorsAll.slice((page - 1) * perPage, page * perPage);
  const genreForShelf: GenreKey | null = genreFilter ?? (cold || isTeenGenre ? null : liked[(page - 1) % Math.max(1, liked.length)] ?? null);
  const since = new Date(Date.now() - 270 * 86_400_000).toISOString().slice(0, 10);
  const profileGenres = cold ? null : liked.slice(0, 4);

  const [teen, providersData] = await Promise.all([teenKeywords(), tmdb("/watch/providers/movie", { watch_region: "BR" })]);

  /* tudo em paralelo; a MONTAGEM é sequencial (prioridade do motivo determinística) */
  const [anchorData, droppedRecs, genrePool, topPool, gemPool, releasePool, popularPool] = await Promise.all([
    Promise.all(
      anchors.map(async (a) => {
        // 2 páginas de similares: o ranking pessoal precisa de margem para escolher
        const [recs, recs2, details] = await Promise.all([
          tmdb(`/${a.media_type}/${a.tmdb_id}/recommendations`, { page: "1" }),
          tmdb(`/${a.media_type}/${a.tmdb_id}/recommendations`, { page: "2" }),
          a.media_type === "movie" ? tmdb(`/movie/${a.tmdb_id}`) : Promise.resolve(null),
        ]);
        const collectionId = details?.belongs_to_collection?.id;
        const collection = collectionId ? await tmdb(`/collection/${collectionId}`) : null;

        return {
          anchor: a,
          results: [...(Array.isArray(recs?.results) ? recs.results : []), ...(Array.isArray(recs2?.results) ? recs2.results : [])].map((c: Candidate) => ({ ...c, media_type: a.media_type })),
          siblings: new Set<number>((collection?.parts ?? []).map((p: { id: number }) => p.id)),
        };
      })
    ),
    // "parecido com o que você abandonou": recomendações dos 2 abandonos mais recentes
    Promise.all(
      profile.dropped
        .filter((d) => d.status === "dropped")
        .slice(0, 2)
        .map((d) => tmdb(`/${d.media_type}/${d.tmdb_id}/recommendations`, { page: "1" }).then((r) => ({ d, r })))
    ),
    genreForShelf || isTeenGenre
      ? Promise.all(types.map((t) => discover(t, { sort_by: "popularity.desc", "vote_count.gte": "150" }, genreForShelf ? [genreForShelf] : null, teen))).then((x) => x.flat())
      : Promise.resolve([]),
    Promise.all(
      types.map((t) =>
        discover(t, { sort_by: "vote_average.desc", "vote_count.gte": t === "movie" ? "1500" : "400", "vote_average.gte": "7.2" }, profileGenres, teen)
      )
    ).then((x) => x.flat()),
    cold
      ? Promise.resolve([])
      : Promise.all(
          types.map((t) =>
            discover(
              t,
              {
                sort_by: "vote_average.desc",
                "vote_count.gte": t === "movie" ? "300" : "150",
                "vote_count.lte": t === "movie" ? "4000" : "1500",
                "vote_average.gte": "7.2",
              },
              liked.slice(0, 5),
              teen
            )
          )
        ).then((x) => x.flat()),
    Promise.all(
      types.map((t) =>
        discover(
          t,
          {
            sort_by: "popularity.desc",
            "vote_count.gte": "30",
            ...(t === "movie"
              ? { "primary_release_date.gte": since, "primary_release_date.lte": today }
              : { "first_air_date.gte": since, "first_air_date.lte": today }),
          },
          cold ? null : liked.slice(0, 5),
          teen
        )
      )
    ).then((x) => x.flat()),
    Promise.all(types.map((t) => discover(t, { sort_by: "popularity.desc", "vote_count.gte": "200" }, cold ? null : liked.slice(0, 5), teen))).then((x) => x.flat()),
  ]);

  const nearDropped = new Set<string>();

  for (const { d, r } of droppedRecs) for (const c of r?.results ?? []) nearDropped.add(`${d.media_type}-${c.id}`);

  /* ---------- montagem ---------- */
  const used = new Set<string>();
  const mix = type === "all" ? profile.movieShare : null;
  /* prateleira montada, ainda com o pool (para o equilíbrio Filmes × Séries do feed final) */
  type Built = { shelf: Omit<Shelf, "results">; mixed: boolean; picked: Scored[]; pool: Scored[]; reason: (c: Scored) => string };
  const built: Built[] = [];
  const stage = { pool: [] as Scored[], beforeDedup: [] as Scored[], afterDedup: [] as Scored[] };

  function build(meta: Omit<Shelf, "results">, ranked: Scored[], opts: Parameters<typeof assemble>[1], min: number, reason: (c: Scored) => string) {
    stage.pool.push(...ranked);
    stage.beforeDedup.push(...assemble(ranked, { ...opts, used: new Set() }));

    const picked = assemble(ranked, opts);

    stage.afterDedup.push(...picked);

    if (picked.length < min) {
      for (const c of picked) used.delete(c.key);
      return;
    }

    built.push({ shelf: meta, mixed: opts.movieShare !== null && opts.movieShare !== undefined, picked, pool: ranked, reason });
  }

  function scoreAll(list: Candidate[], strict: boolean, prior?: (index: number) => number) {
    const seen = new Set<string>();

    return list
      .filter((c) => {
        const key = `${c.media_type}-${c.id}`;

        if (seen.has(key)) return false;
        seen.add(key);

        return isEligible(c, strict) && allowed(c);
      })
      .map((c, index) => scoreCandidate(profile, c, { prior: prior?.(index), nearDropped: nearDropped.has(`${c.media_type}-${c.id}`) }));
  }

  function card(c: Scored, reason: string) {
    const lib = libraryByKey.get(c.key);

    return {
      id: c.id,
      media_type: c.media_type,
      title: c.title,
      name: c.name,
      original_title: c.original_title,
      original_name: c.original_name,
      overview: c.overview,
      poster_path: c.poster_path,
      backdrop_path: c.backdrop_path,
      release_date: c.release_date,
      first_air_date: c.first_air_date,
      vote_average: c.vote_average,
      vote_count: c.vote_count,
      genre_ids: c.genre_ids,
      popularity: c.popularity,
      in_library: Boolean(lib),
      status: lib?.status ?? null,
      favorite: Boolean(lib?.favorite),
      library_id: lib?.library_id ?? null,
      personal_rating: lib?.rating === null || lib?.rating === undefined ? null : Number(lib.rating),
      reason,
    };
  }

  const label = (g: GenreKey | null) => (g ? GENRE_LABEL[g] : null);

  for (const { anchor, results, siblings } of anchorData) {
    const words = [anchorWord(anchor.original_title || ""), anchorWord(anchor.title)].filter(Boolean);
    const scored = scoreAll(results, false, (i) => 1.2 * Math.max(0, 1 - i / 40)).map((c) =>
      siblings.has(c.id) ? { ...c, franchise_override: "anchor" } : c
    );
    const likedIt = anchor.favorite || (anchor.rating !== null && Number(anchor.rating) >= 7.5) || anchor.rewatched;
    const title = likedIt ? `Porque você gostou de ${anchor.title}` : `Porque você assistiu ${anchor.title}`;

    build(
      { id: `because-${anchor.media_type}-${anchor.tmdb_id}`, kind: "because", title, subtitle: anchorSubtitle(anchor), icon: "sparkles" },
      sortScored(scored, sort),
      { used, limit: LIMIT, reservedFranchise: words, movieShare: null },
      MIN_ANCHOR,
      () => title
    );
  }

  function generic(kind: ShelfKind, pool: Candidate[], spec: { title: string; subtitle: string; icon: Shelf["icon"]; strict: boolean; keep?: (c: Scored) => boolean; reason: (c: Scored) => string }) {
    const scored = scoreAll(pool, spec.strict).filter((c) => (spec.keep ? spec.keep(c) : true));

    build(
      { id: `${kind}-${page}`, kind, title: spec.title, subtitle: spec.subtitle, icon: spec.icon },
      sortScored(scored, sort),
      { used, limit: LIMIT, movieShare: mix },
      MIN_GENERIC,
      spec.reason
    );
  }

  if (genreForShelf || isTeenGenre) {
    const name = isTeenGenre ? "Teen" : label(genreForShelf)!;

    generic("genre", genrePool, {
      title: `${name} para você`,
      subtitle: genreFilter || isTeenGenre ? "Do gênero que você escolheu, na ordem do seu gosto." : "Um gênero que aparece bastante entre as coisas que você mais gosta.",
      icon: "film",
      strict: false,
      reason: () => (genreFilter || isTeenGenre ? `${name}, ordenado pelo seu gosto.` : `Combina com seu gosto por ${name}.`),
    });
  }

  generic("top_rated", topPool, {
    title: cold ? "Bem avaliados para começar" : "Bem avaliados no seu estilo",
    subtitle: cold ? "Notas altas com muitas avaliações — avalie e curta títulos para personalizar." : "Notas altas com muitas avaliações, nos gêneros que você mais curte.",
    icon: "star",
    strict: false,
    keep: (c) => c.bayes >= 7,
    reason: (c) => (!cold && c.bestGenre ? `Nota alta em ${label(c.bestGenre)}, um gênero que você curte.` : "Nota alta com muitas avaliações."),
  });

  generic("gems", gemPool, {
    title: "Joias escondidas no seu estilo",
    subtitle: "Menos populares, com notas altas e avaliações suficientes.",
    icon: "gem",
    strict: true,
    // joia = boa (nota com confiança) + menos conhecida + compatível — nunca só "obscura"
    keep: (c) => c.bayes >= 7 && c.affinity > 0.05,
    reason: (c) => (c.bestGenre ? `Pouco conhecido e bem avaliado em ${label(c.bestGenre)}.` : "Pouco conhecido e bem avaliado."),
  });

  generic("releases", releasePool, {
    title: cold ? "Lançamentos em destaque" : "Lançamentos no seu estilo",
    subtitle: cold ? "Saíram nos últimos meses e estão sendo bem recebidos." : "Saíram nos últimos meses e combinam com o seu perfil.",
    icon: "calendar",
    strict: true,
    keep: (c) => Number(c.vote_average || 0) >= 6 && (cold || c.affinity > 0),
    reason: (c) => (!cold && c.bestGenre ? `Lançamento recente de ${label(c.bestGenre)}, no seu estilo.` : "Lançamento recente bem recebido."),
  });

  generic("popular", popularPool, {
    title: cold ? "Em alta agora" : "Em alta no seu estilo",
    subtitle: cold ? "O que mais gente está vendo no momento." : "O que está em alta, filtrado pelo seu gosto.",
    icon: "trending",
    strict: true,
    keep: (c) => c.bayes >= 6.3 && (cold || c.affinity > 0.1),
    reason: (c) => (!cold && c.bestGenre ? `Em alta e combina com seu gosto por ${label(c.bestGenre)}.` : "Em alta no catálogo agora."),
  });

  /* ---------- Filmes × Séries no feed final (aba Tudo) ---------- */
  const afterWeak = built.flatMap((b) => b.picked);
  const balance = type === "all" ? balanceTypes(built, { used, sort }) : { swaps: 0, relaxed: null };
  const shelves: Shelf[] = built.map((b) => ({ ...b.shelf, results: b.picked.map((c) => card(c, b.reason(c))) }));
  const mixOf = (list: Scored[]) => {
    const unique = [...new Map(list.map((c) => [c.key, c])).values()];

    return typeCounts(unique);
  };
  // diagnóstico só em desenvolvimento (?trace=1): proporção em cada etapa
  const trace =
    process.env.NODE_ENV !== "production" && params.get("trace") === "1"
      ? {
          profile_movie_share: Number(profile.movieShare.toFixed(3)),
          pool: mixOf(stage.pool),
          before_dedup: typeCounts(stage.beforeDedup),
          after_dedup: typeCounts(stage.afterDedup),
          after_weak_shelves: typeCounts(afterWeak),
          final: typeCounts(built.flatMap((b) => b.picked)),
          swaps: balance.swaps,
          relaxed: balance.relaxed,
        }
      : undefined;

  /* ---------- filtros: streaming relevantes no Brasil ---------- */
  const allProviders = Array.isArray(providersData?.results) ? providersData.results : [];
  // regra compartilhada com Descobrir (lib/streaming/providers-br)
  const providers = relevantBrProviders(allProviders, /^\d+$/.test(provider) ? provider : null);

  return NextResponse.json(
    {
      page,
      has_more: page < MAX_PAGES && shelves.length > 0,
      based_on: anchors.map((a) => a.title),
      profile: {
        level: profile.level,
        favorite_genres: profile.level === "cold" || profile.positiveCount < 3 ? [] : liked.map((g) => GENRE_LABEL[g]),
        seed_count: profile.positiveCount,
      },
      filters: {
        genres: ["Teen", ...genreFilterLabels()],
        providers: providers.map((p) => ({ id: String(p.provider_id), name: p.provider_name })),
      },
      needs_streaming_setup: needsStreamingSetup,
      shelves,
      ...(trace ? { trace } : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

function anchorSubtitle(anchor: WeightedTitle) {
  if (anchor.favorite) return "Um dos seus curtidos inspirou esta seleção.";
  if (anchor.rating !== null && Number(anchor.rating) >= 8) return `Você deu nota ${Number(anchor.rating).toFixed(1)} para este título.`;
  if (anchor.rewatched) return "Você reassistiu este título.";

  return "Baseado no que você já assistiu.";
}
