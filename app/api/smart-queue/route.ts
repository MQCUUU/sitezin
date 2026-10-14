import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import {
  QUEUE_RESULT_LIMIT,
  pickDiverse,
  pickSurprise,
  rankCandidates,
  type QueueCandidate,
  type QueueContext,
  type QueueFilters,
  type QueuePick,
} from "@/lib/smart-queue";
import {
  computeTvProgress,
  estimateEpisodeRuntime,
  groupWatchedByMedia,
  tvStructureFromRaw,
} from "@/lib/tv-progress";
import {
  genreNameMap,
  loadUserTaste,
  seedRecommendations,
  tmdbGet,
  type TmdbOptions,
} from "@/lib/taste-server";
import { tasteKey } from "@/lib/taste-profile";

/*
 * ==========================================
 * GET /api/smart-queue — "O que assistir agora?"
 * ==========================================
 *
 * Params: minutes (30|60|120|omitido), type (all|movie|tv), genre,
 * mine=1 (só meus serviços), source=all|queue|new, surprise=1.
 *
 * V2.3 — de "fila ordenada + populares do TMDB" para um recomendador:
 *  - perfil de gosto (lib/taste-profile): gêneros que o usuário avalia
 *    bem, penalidade pelo que abandona, "parecido com X, que você curtiu";
 *  - fontes: a FILA (want/watching/rewatching/paused) e DESCOBERTAS
 *    baseadas nos títulos mais curtidos (recomendações do TMDB), nunca
 *    algo que já está na biblioteca/ocultos;
 *  - duração REAL e onde assistir (BR) dos candidatos novos — 1 chamada
 *    de detalhes por candidato (≤ 14, em cache), sem N+1 sobre a biblioteca;
 *  - resultado variado: o melhor da fila + a melhor descoberta + o próximo,
 *    sem 3 do mesmo gênero.
 * Determinístico (sem IA), privado e escopado à sessão.
 */

const PRIVATE = { "Cache-Control": "private, no-store" };
const LIBRARY_CANDIDATE_LIMIT = 150;
const DISCOVERY_POOL = 14;
const ALLOWED_MINUTES = new Set([30, 60, 120]);

type Source = "all" | "queue" | "new";

function parseFilters(req: NextRequest): QueueFilters & { surprise: boolean; source: Source } {
  const params = req.nextUrl.searchParams;
  const minutesRaw = Number(params.get("minutes"));
  const type = params.get("type");
  const genre = (params.get("genre") || "").trim().slice(0, 40);
  const source = params.get("source");

  return {
    minutes: ALLOWED_MINUTES.has(minutesRaw) ? minutesRaw : null,
    type: type === "movie" || type === "tv" ? type : "all",
    genre: genre || null,
    onlyMyServices: params.get("mine") === "1",
    surprise: params.get("surprise") === "1",
    source: source === "queue" || source === "new" ? source : "all",
  };
}

function brProviders(watchProviders: unknown): { ids: number[]; names: string[] } | null {
  const region = (watchProviders as { results?: Record<string, unknown> } | null)?.results?.BR as
    | Record<string, { provider_id?: number; provider_name?: string }[]>
    | undefined;

  if (!region) return null;

  const ids = new Set<number>();
  const names: string[] = [];

  for (const kind of ["flatrate", "free", "ads"]) {
    for (const item of region[kind] ?? []) {
      if (Number.isInteger(item?.provider_id) && !ids.has(Number(item.provider_id))) {
        ids.add(Number(item.provider_id));
        if (item.provider_name) names.push(String(item.provider_name));
      }
    }
  }

  return { ids: Array.from(ids), names };
}

function yearOf(date: unknown): number | null {
  const year = Number(String(date ?? "").slice(0, 4));

  return Number.isInteger(year) && year > 1800 ? year : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const { surprise, source, ...filters } = parseFilters(req);
    const sql = getDb();
    const apiKey = process.env.TMDB_API_KEY || "";
    const options: TmdbOptions = { apiKey, language: process.env.TMDB_LANGUAGE || "pt-BR" };

    // strictServices: tabela de serviços ausente = erro visível (migration pré-deploy).
    const [taste, libraryRows] = await Promise.all([
      loadUserTaste(userId, { strictServices: true }),
      source === "new"
        ? Promise.resolve([] as Record<string, unknown>[])
        : sql.query(
            `SELECT li.id AS library_id, li.status, li.favorite, li.personal_rating,
                    EXTRACT(DAY FROM (now() - li.added_at))::int AS added_days,
                    m.id AS media_id, m.tmdb_id, m.media_type, m.title, m.poster_path,
                    m.genres, m.runtime, m.tmdb_rating, m.seasons_count, m.episodes_count,
                    m.overview, m.release_date, m.first_air_date,
                    m.raw->'episode_run_time' AS episode_run_time,
                    m.raw->'last_episode_to_air' AS last_episode_to_air,
                    m.raw->'seasons' AS seasons,
                    m.raw->'status' AS series_status,
                    m.raw->'watch_providers' AS watch_providers
             FROM public.library_items li
             JOIN public.media m ON m.id = li.media_id
             WHERE li.user_id = $1
               AND li.status IN ('want', 'watching', 'rewatching', 'paused')
               AND NOT EXISTS (
                 SELECT 1 FROM public.user_hidden_titles h
                 WHERE h.user_id = li.user_id
                   AND h.tmdb_id = m.tmdb_id
                   AND h.media_type = m.media_type
               )
             ORDER BY li.updated_at DESC
             LIMIT ${LIBRARY_CANDIDATE_LIMIT}`,
            [userId]
          ),
    ]);

    const context: QueueContext = {
      profile: taste.profile.size >= 3 ? taste.profile : undefined,
      favoriteGenres: taste.profile.topGenres,
      myServices: new Map(taste.services.map((service) => [service.provider_id, service.provider_name])),
    };

    // ---------- candidatos da biblioteca (fila / continuar) ----------
    const tvRows = (libraryRows as Record<string, any>[]).filter((row) => row.media_type === "tv");
    let watchedByMedia = new Map<number, { season_number: number; episode_number: number }[]>();

    if (tvRows.length > 0) {
      const progressRows = (await sql`
        SELECT media_id, season_number, episode_number
        FROM public.episodes_progress
        WHERE user_id = ${userId}
          AND watched = true
          AND media_id = ANY(${tvRows.map((row) => Number(row.media_id))}::int[])
      `) as { media_id: number; season_number: number; episode_number: number }[];

      watchedByMedia = groupWatchedByMedia(progressRows);
    }

    const candidates: QueueCandidate[] = (libraryRows as Record<string, any>[]).map((row) => {
      const isTv = row.media_type === "tv";
      const raw = {
        seasons: row.seasons,
        last_episode_to_air: row.last_episode_to_air,
        status: row.series_status,
        episode_run_time: row.episode_run_time,
      };

      const progress = isTv
        ? computeTvProgress(
            tvStructureFromRaw(raw, { seasons_count: row.seasons_count, episodes_count: row.episodes_count }),
            watchedByMedia.get(Number(row.media_id)) ?? [],
            { rewatching: row.status === "rewatching" }
          )
        : null;

      const runtime = isTv ? estimateEpisodeRuntime(raw) : Number(row.runtime) > 0 ? Number(row.runtime) : null;
      const providers = brProviders(row.watch_providers);

      return {
        source: "library",
        library_id: String(row.library_id),
        tmdb_id: Number(row.tmdb_id),
        media_type: isTv ? "tv" : "movie",
        title: String(row.title),
        poster_path: row.poster_path ?? null,
        genres: Array.isArray(row.genres) ? row.genres : [],
        runtime_minutes: runtime,
        runtime_estimated: isTv,
        fits_by_filter: false,
        status: row.status,
        favorite: Boolean(row.favorite),
        personal_rating: row.personal_rating === null ? null : Number(row.personal_rating),
        tmdb_rating: row.tmdb_rating === null ? null : Number(row.tmdb_rating),
        provider_ids: providers?.ids ?? null,
        provider_names: providers?.names ?? [],
        provider_guaranteed: false,
        tv_progress: progress,
        added_days: row.added_days === null ? null : Number(row.added_days),
        overview: row.overview ? String(row.overview).slice(0, 220) : null,
        year: yearOf(isTv ? row.first_air_date : row.release_date),
        vote_average: row.tmdb_rating === null ? null : Number(row.tmdb_rating),
      };
    });

    // ---------- descobertas (baseadas no gosto) ----------
    let usedDiscovery = false;

    if (source !== "queue" && apiKey) {
      const types: ("movie" | "tv")[] = filters.type === "all" ? ["movie", "tv"] : [filters.type];
      const pool = await discoveryPool(taste, options, types, filters);
      const genres = await genreNameMap(options);

      const enriched = await Promise.all(
        pool.map(async (entry) => {
          const details = await tmdbGet(
            `/${entry.media_type}/${entry.item.id}`,
            options,
            { append_to_response: "watch/providers" },
            21600
          );

          return { entry, details };
        })
      );

      for (const { entry, details } of enriched) {
        if (!details) continue;

        const isTv = entry.media_type === "tv";
        const providers = brProviders(details["watch/providers"]);
        const runtime = isTv
          ? Number((details.episode_run_time ?? [])[0]) > 0
            ? Number(details.episode_run_time[0])
            : null
          : Number(details.runtime) > 0
            ? Number(details.runtime)
            : null;

        const genreNames: string[] = Array.isArray(details.genres)
          ? details.genres.map((genre: { name: string }) => String(genre.name))
          : (entry.item.genre_ids ?? []).map((id: number) => genres.get(Number(id))).filter(Boolean);

        candidates.push({
          source: "discover",
          library_id: null,
          tmdb_id: Number(entry.item.id),
          media_type: entry.media_type,
          title: String(details.title || details.name || entry.item.title || entry.item.name || "Sem título"),
          poster_path: details.poster_path ?? entry.item.poster_path ?? null,
          genres: genreNames,
          runtime_minutes: runtime,
          runtime_estimated: isTv,
          fits_by_filter: false,
          status: null,
          favorite: false,
          personal_rating: null,
          tmdb_rating: details.vote_average ? Number(details.vote_average) : null,
          provider_ids: providers?.ids ?? null,
          provider_names: providers?.names ?? [],
          provider_guaranteed: false,
          tv_progress: null,
          because: entry.because,
          overview: details.overview ? String(details.overview).slice(0, 220) : null,
          year: yearOf(isTv ? details.first_air_date : details.release_date),
          vote_average: details.vote_average ? Number(details.vote_average) : null,
        });
      }

      usedDiscovery = enriched.some(({ details }) => Boolean(details));
    }

    const ranked = rankCandidates(candidates, filters, context);
    const chosen: QueuePick[] = surprise
      ? (() => {
          const one = pickSurprise(ranked.slice(0, 12));
          return one ? [one] : [];
        })()
      : pickDiverse(ranked, QUEUE_RESULT_LIMIT, source);

    return NextResponse.json(
      {
        results: chosen.map((pick) => ({
          library_id: pick.candidate.library_id,
          tmdb_id: pick.candidate.tmdb_id,
          media_type: pick.candidate.media_type,
          title: pick.candidate.title,
          poster_path: pick.candidate.poster_path,
          status: pick.candidate.status,
          runtime_minutes: pick.candidate.runtime_minutes,
          runtime_estimated: pick.candidate.runtime_estimated,
          next_episode: pick.candidate.tv_progress?.next ?? null,
          services: pick.matched_services,
          where_to_watch: (pick.candidate.provider_names ?? []).slice(0, 3),
          reason: pick.reason,
          source: pick.candidate.source,
          overview: pick.candidate.overview ?? null,
          year: pick.candidate.year ?? null,
          vote_average: pick.candidate.vote_average ?? null,
          genres: pick.candidate.genres.slice(0, 3),
          /*
           * "library_snapshot": disponibilidade vem de raw.watch_providers,
           * gravado quando o título entrou na biblioteca (sem timestamp de
           * frescor) → pode estar desatualizada. "tmdb_live": consulta
           * feita agora ao TMDB (cache ≤ 6 h).
           */
          availability_source: pick.candidate.source === "library" ? "library_snapshot" : "tmdb_live",
        })),
        total_eligible: ranked.length,
        surprise,
        used_fallback: usedDiscovery,
        has_services: context.myServices.size > 0,
        personalized: Boolean(context.profile),
      },
      { headers: PRIVATE }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/smart-queue");
  }
}

/*
 * Pool de descobertas: recomendações dos títulos mais curtidos (mais
 * recomendado por vários = primeiro) + Discover popular/bem avaliado como
 * complemento (filtros de gênero/tempo/serviço aplicados na consulta).
 * Nunca retorna o que está na biblioteca ou oculto.
 */
async function discoveryPool(
  taste: Awaited<ReturnType<typeof loadUserTaste>>,
  options: TmdbOptions,
  types: ("movie" | "tv")[],
  filters: QueueFilters
): Promise<{ item: Record<string, any>; media_type: "movie" | "tv"; because: string[] }[]> {
  const seeded = taste.profile.seeds.length > 0 ? await seedRecommendations(taste, options, types) : new Map();

  const fromSeeds = Array.from(seeded.values())
    .sort(
      (a, b) =>
        b.because.length - a.because.length ||
        Number(b.item.vote_average || 0) - Number(a.item.vote_average || 0)
    )
    .slice(0, DISCOVERY_POOL)
    .map((entry) => ({ item: entry.item, media_type: entry.media_type, because: entry.because }));

  if (fromSeeds.length >= 8 && !filters.genre && !filters.onlyMyServices && filters.minutes === null) return fromSeeds;

  // Complemento: Discover (respeita gênero e serviços quando pedidos).
  const genres = await genreNameMap(options);
  const extra: { item: Record<string, any>; media_type: "movie" | "tv"; because: string[] }[] = [];

  await Promise.all(
    types.map(async (type) => {
      const params: Record<string, string> = {
        sort_by: "popularity.desc",
        "vote_count.gte": "300",
        "vote_average.gte": "6.7",
        include_adult: "false",
        page: "1",
      };

      if (filters.genre) {
        const id = Array.from(genres.entries()).find(([, name]) => name === filters.genre)?.[0];

        if (!id) return;
        params.with_genres = String(id);
      } else if (taste.profile.topGenres.length > 0) {
        const ids = taste.profile.topGenres
          .slice(0, 2)
          .map((name) => Array.from(genres.entries()).find(([, n]) => n === name)?.[0])
          .filter(Boolean);

        if (ids.length) params.with_genres = ids.join("|");
      }

      if (filters.onlyMyServices && taste.services.length > 0) {
        params.watch_region = "BR";
        params.with_watch_monetization_types = "flatrate|free|ads";
        params.with_watch_providers = taste.services.map((service) => service.provider_id).join("|");
      } else if (filters.onlyMyServices) {
        return;
      }

      if (filters.minutes !== null) params["with_runtime.lte"] = String(filters.minutes);

      const data = await tmdbGet(`/discover/${type}`, options, params, 3600);

      for (const item of ((data?.results ?? []) as Record<string, any>[]).slice(0, 12)) {
        const key = tasteKey(type, item.id);

        if (!item.poster_path || taste.profile.owned.has(key) || taste.hidden.has(key)) continue;
        extra.push({ item, media_type: type, because: [] });
      }
    })
  );

  const merged = new Map<string, { item: Record<string, any>; media_type: "movie" | "tv"; because: string[] }>();

  for (const entry of [...fromSeeds, ...extra]) {
    const key = tasteKey(entry.media_type, entry.item.id);
    if (!merged.has(key)) merged.set(key, entry);
  }

  return Array.from(merged.values()).slice(0, DISCOVERY_POOL);
}
