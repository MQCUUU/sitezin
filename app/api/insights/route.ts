import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { dateKeyInTimeZone } from "@/lib/date-only";
import { buildInsights } from "@/lib/insights/compute";
import { optional } from "@/lib/insights/db-safe";
import { INSIGHTS_TZ, normalizeParams } from "@/lib/insights/period";
import type { EntryRow, EpisodeDay, EventRow, HiddenRow, HourRow, InsightsInput, LibRow } from "@/lib/insights/types";

/*
 * GET /api/insights?period=&type=&from=&to=&compare=
 *
 * Lê os dados do usuário UMA vez (consultas em paralelo, filtradas por
 * user_id, já agregadas no banco onde o volume cresce — episódios por
 * dia/série, horários por dia/hora) e devolve o payload calculado por
 * lib/insights/compute.ts. Nenhuma linha crua vai para o navegador.
 * Dias no fuso de Brasília (INSIGHTS_TZ).
 */

const TZ = INSIGHTS_TZ;
const LIMIT = 50000;

type Row = Record<string, any>;

const arr = (value: unknown): string[] => (Array.isArray(value) ? value.map(String).filter(Boolean) : []);
const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function countriesOf(row: Row): string[] {
  if (Array.isArray(row.origin_country) && row.origin_country.length) return row.origin_country.map(String).slice(0, 3);

  if (Array.isArray(row.production_countries)) {
    return row.production_countries
      .map((c: Row | string) => (typeof c === "string" ? c : c?.iso_3166_1))
      .filter(Boolean)
      .slice(0, 3);
  }

  return [];
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const search = request.nextUrl.searchParams;
    const params = normalizeParams({
      period: search.get("period"),
      type: search.get("type"),
      from: search.get("from"),
      to: search.get("to"),
      compare: search.get("compare"),
    });

    const sql = getDb();

    const [library, episodes, entries, hours, hidden, events] = await Promise.all([
      sql`
        SELECT
          m.id AS media_id, m.tmdb_id, m.media_type, m.title, m.poster_path,
          li.status, li.favorite, li.personal_rating, li.rewatch_count, li.completed_seasons,
          to_char(li.watched_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS watched_day,
          to_char(li.added_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS added_day,
          to_char(li.updated_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS updated_day,
          extract(year FROM (CASE WHEN m.media_type = 'tv' THEN m.first_air_date ELSE m.release_date END))::int AS release_year,
          m.runtime, m.seasons_count, m.episodes_count, m.genres, m.tmdb_rating, m.tmdb_vote_count,
          m.raw->>'original_language' AS language,
          m.raw->'origin_country' AS origin_country,
          m.raw->'production_countries' AS production_countries,
          m.raw->'directors' AS directors,
          (m.raw->>'enriched_v2') IS NOT NULL AS enriched,
          m.cast_names[1:5] AS cast_names, m.creator_names[1:3] AS creator_names
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${userId}
        ORDER BY li.updated_at DESC, li.id ASC
        LIMIT ${LIMIT}
      `,
      sql`
        SELECT
          ep.media_id,
          to_char(ep.watched_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
          count(*)::int AS n,
          count(*) FILTER (WHERE ep.season_number > 0)::int AS regular,
          count(*) FILTER (WHERE ep.is_rewatch)::int AS rewatch
        FROM public.episodes_progress ep
        WHERE ep.user_id = ${userId} AND ep.watched = true
        GROUP BY 1, 2
        LIMIT ${LIMIT}
      `,
      sql`
        SELECT we.media_id, to_char(we.watched_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day, we.rating, we.is_rewatch
        FROM public.watch_entries we
        WHERE we.user_id = ${userId}
        ORDER BY we.watched_at ASC
        LIMIT ${LIMIT}
      `,
      // Horário: SÓ registros com precisão 'datetime' gravada na escrita.
      // NULL (antigos, proveniência desconhecida) e 'date' (só a data) nunca
      // entram em "horário em que mais assiste" — um registro real às 21:00 entra.
      optional(
        async () =>
          (await sql`
            WITH ev AS (
              -- Filmes: cada visualização registrada (watch_entries); sem registro,
              -- a data da biblioteca. Nunca as duas para o mesmo título.
              SELECT we.watched_at AS ts, we.watched_at_precision AS precision, m.media_type
              FROM public.watch_entries we
              JOIN public.media m ON m.id = we.media_id
              WHERE we.user_id = ${userId} AND m.media_type = 'movie'
              UNION ALL
              SELECT li.watched_at, li.watched_at_precision, m.media_type
              FROM public.library_items li
              JOIN public.media m ON m.id = li.media_id
              WHERE li.user_id = ${userId} AND li.watched_at IS NOT NULL AND li.status IN ('watched', 'rewatched')
                AND m.media_type = 'movie'
                AND NOT EXISTS (SELECT 1 FROM public.watch_entries we2 WHERE we2.library_item_id = li.id)
              UNION ALL
              SELECT ep.watched_at, ep.watched_at_precision, 'tv'
              FROM public.episodes_progress ep
              WHERE ep.user_id = ${userId} AND ep.watched = true AND ep.watched_at IS NOT NULL
            )
            SELECT
              to_char(ts AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
              extract(hour FROM ts AT TIME ZONE ${TZ})::int AS hour,
              media_type,
              count(*)::int AS n,
              count(*) FILTER (WHERE precision = 'datetime')::int AS timed
            FROM ev
            GROUP BY 1, 2, 3
            LIMIT ${LIMIT}
          `) as Row[],
        [] as Row[]
      ),
      sql`
        SELECT media_type, to_char(created_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day
        FROM public.user_hidden_titles
        WHERE user_id = ${userId}
        LIMIT ${LIMIT}
      `,
      optional(
        async () =>
          (await sql`
            SELECT kind, source, tmdb_id, media_type, exposure_id,
                   to_char(created_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day
            FROM public.user_events
            WHERE user_id = ${userId}
            LIMIT ${LIMIT}
          `) as Row[],
        [] as Row[]
      ),
    ]);

    const input: InsightsInput = {
      library: (library as Row[]).map(
        (row): LibRow => ({
          media_id: Number(row.media_id),
          tmdb_id: Number(row.tmdb_id),
          type: row.media_type === "tv" ? "tv" : "movie",
          title: String(row.title),
          poster_path: row.poster_path ?? null,
          status: String(row.status),
          favorite: Boolean(row.favorite),
          rating: num(row.personal_rating),
          watched_day: row.watched_day ?? null,
          added_day: row.added_day,
          updated_day: row.updated_day,
          rewatch_count: Number(row.rewatch_count || 0),
          release_year: num(row.release_year),
          runtime: num(row.runtime),
          seasons_count: num(row.seasons_count),
          episodes_count: num(row.episodes_count),
          completed_seasons: Number(row.completed_seasons || 0),
          genres: arr(row.genres),
          tmdb_rating: num(row.tmdb_rating),
          vote_count: num(row.tmdb_vote_count),
          language: row.language || null,
          countries: countriesOf(row),
          cast: arr(row.cast_names),
          creators: arr(row.creator_names),
          directors: arr(row.directors),
          enriched: Boolean(row.enriched),
        })
      ),
      episodes: (episodes as Row[]).map(
        (row): EpisodeDay => ({
          media_id: Number(row.media_id),
          day: row.day ?? null,
          n: Number(row.n),
          regular: Number(row.regular),
          rewatch: Number(row.rewatch),
        })
      ),
      entries: (entries as Row[]).map(
        (row): EntryRow => ({ media_id: Number(row.media_id), day: row.day ?? null, rating: num(row.rating), is_rewatch: Boolean(row.is_rewatch) })
      ),
      hours: hours.value.map(
        (row): HourRow => ({
          day: row.day,
          hour: Number(row.hour),
          type: row.media_type === "tv" ? "tv" : "movie",
          n: Number(row.n),
          timed: Number(row.timed),
        })
      ),
      hidden: (hidden as Row[]).map((row): HiddenRow => ({ type: row.media_type === "tv" ? "tv" : "movie", day: row.day })),
      events: events.available
        ? events.value.map(
            (row): EventRow => ({
              kind: row.kind,
              source: String(row.source),
              tmdb_id: Number(row.tmdb_id),
              type: row.media_type === "tv" ? "tv" : "movie",
              day: row.day,
              exposure: row.exposure_id ?? null,
            })
          )
        : null,
      today: dateKeyInTimeZone(new Date(), TZ),
    };

    return NextResponse.json(buildInsights(input, params), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respostaDeErro(error, "GET /api/insights");
  }
}
