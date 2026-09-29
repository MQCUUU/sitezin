import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import {
  QUEUE_RESULT_LIMIT,
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

/*
 * ==========================================
 * GET /api/smart-queue — V2.1-E "O que assistir agora?"
 * ==========================================
 *
 * Params: minutes (30|60|120|omitido=sem limite), type (all|movie|tv),
 * genre (nome), mine=1 (só meus serviços), surprise=1 (aleatório entre
 * os candidatos válidos).
 *
 * Determinístico, SEM IA. Privado (`no-store`), escopado à sessão.
 *
 * Custo (independente do tamanho da biblioteca):
 *   1 query: candidatos da biblioteca (LIMIT 150, já sem ocultos)
 *   1 query: episódios assistidos das séries candidatas (batched)
 *   1 query: gêneros favoritos do usuário (agregado, LIMIT 5)
 *   1 query: serviços do usuário
 *   fallback (só se < 3 elegíveis): ≤ 2 chamadas TMDB discover + 1 query
 *   batched de estado/ocultos dos resultados (≤ 40 ids).
 * Nunca baixa a biblioteca inteira no client, nunca N+1.
 */

const PRIVATE = { "Cache-Control": "private, no-store" };
const LIBRARY_CANDIDATE_LIMIT = 150;
const DISCOVER_FALLBACK_MIN = QUEUE_RESULT_LIMIT;
const TMDB_BASE = "https://api.themoviedb.org/3";

const ALLOWED_MINUTES = new Set([30, 60, 120]);

function parseFilters(req: NextRequest): QueueFilters & { surprise: boolean } {
  const params = req.nextUrl.searchParams;
  const minutesRaw = Number(params.get("minutes"));
  const type = params.get("type");
  const genre = (params.get("genre") || "").trim().slice(0, 40);

  return {
    minutes: ALLOWED_MINUTES.has(minutesRaw) ? minutesRaw : null,
    type: type === "movie" || type === "tv" ? type : "all",
    genre: genre || null,
    onlyMyServices: params.get("mine") === "1",
    surprise: params.get("surprise") === "1",
  };
}

function providerIdsFromRaw(watchProviders: unknown): number[] | null {
  const region = (watchProviders as { results?: Record<string, unknown> } | null)?.results?.BR as
    | Record<string, { provider_id?: number }[]>
    | undefined;

  if (!region) return null;

  const ids = new Set<number>();

  for (const kind of ["flatrate", "free", "ads"]) {
    for (const item of region[kind] ?? []) {
      if (Number.isInteger(item?.provider_id)) ids.add(Number(item.provider_id));
    }
  }

  return Array.from(ids);
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const { surprise, ...filters } = parseFilters(req);
    const sql = getDb();

    const [libraryRows, genreRows, serviceRows] = await Promise.all([
      sql.query(
        `SELECT li.id AS library_id, li.status, li.favorite, li.personal_rating,
                m.id AS media_id, m.tmdb_id, m.media_type, m.title, m.poster_path,
                m.genres, m.runtime, m.tmdb_rating, m.seasons_count, m.episodes_count,
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
      sql`
        SELECT g AS genre, count(*)::int AS n
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id,
             unnest(m.genres) AS g
        WHERE li.user_id = ${userId}
          AND (li.favorite OR li.personal_rating >= 7)
        GROUP BY g
        ORDER BY n DESC, g
        LIMIT 5
      `,
      /*
       * SEM `.catch`: se a migration v2.1-e-streaming-services.sql não
       * existir no banco, o erro de schema aparece (500) em vez de virar
       * "sem serviços" em silêncio. Migration PRÉ-DEPLOY obrigatória.
       */
      sql`
        SELECT provider_id, provider_name
        FROM public.user_streaming_services
        WHERE user_id = ${userId}
      `,
    ]);

    const context: QueueContext = {
      favoriteGenres: (genreRows as { genre: string }[]).map((row) => row.genre),
      myServices: new Map(
        (serviceRows as { provider_id: number; provider_name: string }[]).map((row) => [
          Number(row.provider_id),
          row.provider_name,
        ])
      ),
    };

    // Progresso de TODAS as séries candidatas numa única query.
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
            tvStructureFromRaw(raw, {
              seasons_count: row.seasons_count,
              episodes_count: row.episodes_count,
            }),
            watchedByMedia.get(Number(row.media_id)) ?? [],
            { rewatching: row.status === "rewatching" }
          )
        : null;

      const runtime = isTv
        ? estimateEpisodeRuntime(raw)
        : Number(row.runtime) > 0
          ? Number(row.runtime)
          : null;

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
        provider_ids: providerIdsFromRaw(row.watch_providers),
        provider_guaranteed: false,
        tv_progress: progress,
      };
    });

    let picks = rankCandidates(candidates, filters, context);
    let usedFallback = false;

    // Fallback útil (usuário sem histórico ou filtros estreitos).
    if (picks.length < DISCOVER_FALLBACK_MIN) {
      const extra = await discoverFallback(userId, filters, context);
      usedFallback = extra.length > 0;
      picks = [...picks, ...rankCandidates(extra, filters, context)].sort((a, b) => b.score - a.score);
    }

    const chosen: QueuePick[] = surprise
      ? (() => {
          const one = pickSurprise(picks);
          return one ? [one] : [];
        })()
      : picks.slice(0, QUEUE_RESULT_LIMIT);

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
          /*
           * "library_snapshot": disponibilidade vem de raw.watch_providers,
           * gravado quando o título entrou na biblioteca (sem timestamp de
           * frescor) → pode estar desatualizada. "tmdb_live": consulta
           * Discover do TMDB feita agora (cache ≤ 1h).
           */
          availability_source:
            pick.candidate.source === "library" ? "library_snapshot" : "tmdb_live",
          reason: pick.reason,
          source: pick.candidate.source,
        })),
        total_eligible: picks.length,
        surprise,
        used_fallback: usedFallback,
        has_services: context.myServices.size > 0,
      },
      { headers: PRIVATE }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/smart-queue");
  }
}

/*
 * Candidatos do TMDB Discover (popular + bem avaliado) — só quando a
 * biblioteca não rende resultados suficientes. Limite de tempo via
 * `with_runtime.lte` (filme: duração; série: média de episódio =
 * ESTIMATIVA), serviços via `with_watch_providers` quando o filtro
 * estrito está ligado. Remove o que já está na biblioteca ou oculto
 * com UMA query batched.
 */
async function discoverFallback(
  userId: string,
  filters: QueueFilters,
  context: QueueContext
): Promise<QueueCandidate[]> {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) return [];

  if (filters.onlyMyServices && context.myServices.size === 0) return [];

  const types: ("movie" | "tv")[] = filters.type === "all" ? ["movie", "tv"] : [filters.type];
  const language = process.env.TMDB_LANGUAGE || "pt-BR";

  const responses = await Promise.all(
    types.map(async (type) => {
      const params = new URLSearchParams({
        api_key: apiKey,
        language,
        sort_by: "popularity.desc",
        "vote_count.gte": "300",
        "vote_average.gte": "6.5",
        include_adult: "false",
        page: "1",
      });

      if (filters.minutes !== null) params.set("with_runtime.lte", String(filters.minutes));

      if (filters.genre) {
        const genreId = await genreIdByName(type, filters.genre, apiKey, language);
        if (!genreId) return { type, results: [] as Record<string, any>[] };
        params.set("with_genres", String(genreId));
      }

      if (filters.onlyMyServices) {
        params.set("watch_region", "BR");
        params.set("with_watch_monetization_types", "flatrate|free|ads");
        params.set("with_watch_providers", Array.from(context.myServices.keys()).join("|"));
      }

      const response = await fetch(`${TMDB_BASE}/discover/${type}?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 3600 },
      }).catch(() => null);

      const data = response?.ok ? await response.json().catch(() => null) : null;

      return { type, results: (data?.results ?? []) as Record<string, any>[] };
    })
  );

  const flat: Record<string, any>[] = responses.flatMap((entry) =>
    entry.results.slice(0, 20).map((item) => ({ ...item, media_type: entry.type }))
  );

  if (flat.length === 0) return [];

  const known = (await getDb().query(
    `SELECT tmdb_id, media_type FROM (
       SELECT m.tmdb_id, m.media_type
       FROM public.library_items li JOIN public.media m ON m.id = li.media_id
       WHERE li.user_id = $1
       UNION
       SELECT tmdb_id, media_type FROM public.user_hidden_titles WHERE user_id = $1
     ) t
     WHERE tmdb_id = ANY($2::bigint[])`,
    [userId, flat.map((item) => Number(item.id))]
  )) as { tmdb_id: number | string; media_type: string }[];

  const excluded = new Set(known.map((row) => `${row.media_type}-${Number(row.tmdb_id)}`));

  return flat
    .filter((item) => !excluded.has(`${item.media_type}-${Number(item.id)}`))
    .map((item) => ({
      source: "discover" as const,
      library_id: null,
      tmdb_id: Number(item.id),
      media_type: item.media_type as "movie" | "tv",
      title: String(item.title || item.name || "Sem título"),
      poster_path: item.poster_path ?? null,
      genres: filters.genre ? [filters.genre] : [],
      runtime_minutes: null,
      runtime_estimated: item.media_type === "tv",
      fits_by_filter: filters.minutes !== null,
      status: null,
      favorite: false,
      personal_rating: null,
      tmdb_rating: item.vote_average ? Number(item.vote_average) : null,
      provider_ids: null,
      provider_guaranteed: filters.onlyMyServices,
      tv_progress: null,
    }));
}

async function genreIdByName(
  type: "movie" | "tv",
  name: string,
  apiKey: string,
  language: string
): Promise<number | null> {
  const response = await fetch(
    `${TMDB_BASE}/genre/${type}/list?language=${encodeURIComponent(language)}&api_key=${encodeURIComponent(apiKey)}`,
    { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
  ).catch(() => null);

  const data = response?.ok ? await response.json().catch(() => null) : null;
  const found = (data?.genres ?? []).find((genre: { id: number; name: string }) => genre.name === name);

  return found ? Number(found.id) : null;
}
