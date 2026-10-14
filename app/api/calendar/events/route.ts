import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { calendarTMDB, lightweightDetailsTMDB, seasonTMDB, upcomingMoviesTMDB, upcomingSeriesTMDB } from "@/lib/tmdb";
import { addDays, daysBetween, isDay, todayIn } from "@/lib/calendar/dates";
import { buildEvents, type DiscoveryInput, type LibraryEntry, type MovieInput, type SeriesInput } from "@/lib/calendar/build";
import type { CalendarResponse } from "@/lib/calendar/types";

/*
 * GET /api/calendar/events?from=AAAA-MM-DD&to=AAAA-MM-DD[&scope=library]
 *
 * Eventos normalizados de UM período (Agenda: 60 dias; Semana: 7; Mês: a grade).
 * - Biblioteca + progresso: 2 consultas ao banco por requisição.
 * - Séries: detalhes (cache 6 h) e SÓ as temporadas que podem ter episódios no
 *   período (cache 6 h) — é o que permite mostrar vários episódios num dia e
 *   temporadas inteiras, além do passado. Concorrência limitada (6).
 * - Filmes da biblioteca: data BR (fallback US) conferida.
 * - Descobertas: discover do TMDB no intervalo; para os filmes mais populares
 *   a data é conferida pela mesma regra BR/US (o discover devolve a data
 *   primária, que pode ser de outro país).
 * Falha de uma fonte não derruba as outras (`partial`).
 */

const MAX_SPAN = 75;
const CONCURRENCY = 6;
const DISCOVERY_MOVIES_CHECKED = 24;

type Row = Record<string, any>;

async function mapLimited<T, R>(values: T[], worker: (value: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(values.length).fill(null);
  let next = 0;

  async function run() {
    while (next < values.length) {
      const index = next;

      next += 1;

      try {
        out[index] = await worker(values[index]);
      } catch (error) {
        console.error("[calendar] item falhou:", (error as Error)?.message);
        out[index] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, run));

  return out;
}

/** Temporadas (> 0) que podem ter episódios no período. */
function seasonsToFetch(details: Row, from: string, to: string): number[] {
  const seasons = (Array.isArray(details?.seasons) ? details.seasons : [])
    .filter((s: Row) => Number(s.season_number) > 0 && s.air_date)
    .map((s: Row) => ({ n: Number(s.season_number), air: String(s.air_date) }))
    .sort((a: { n: number }, b: { n: number }) => a.n - b.n);
  const lastAired = String(details?.last_episode_to_air?.air_date || "");
  const ended = ["Ended", "Canceled"].includes(String(details?.status));
  const picked = new Set<number>();

  // Série encerrada cujo último episódio é anterior ao período: nada a buscar.
  if (ended && lastAired && lastAired < from) return [];

  seasons.forEach((s: { n: number; air: string }, i: number) => {
    const nextAir = seasons[i + 1]?.air ?? null;

    if (s.air > to) return; // começa depois do período
    if (nextAir && nextAir <= from) return; // a próxima já tinha começado antes do período
    if (daysBetween(s.air, from) > 400 && s.n !== seasons[seasons.length - 1]?.n) return; // temporada antiga

    picked.add(s.n);
  });

  const nextEp = details?.next_episode_to_air;

  if (nextEp?.season_number && nextEp.air_date && nextEp.air_date <= to) picked.add(Number(nextEp.season_number));

  return [...picked].slice(-3);
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const params = request.nextUrl.searchParams;
    const today = todayIn();
    const from = isDay(params.get("from")) ? (params.get("from") as string) : today;
    let to = isDay(params.get("to")) ? (params.get("to") as string) : addDays(from, 59);

    if (to < from) to = from;
    if (daysBetween(from, to) > MAX_SPAN) to = addDays(from, MAX_SPAN);

    const libraryOnly = params.get("scope") === "library";
    const partial: string[] = [];
    const sql = getDb();

    /* ---------- biblioteca + progresso (2 consultas) ---------- */
    let rows: Row[] = [];
    let progressRows: Row[] = [];

    try {
      [rows, progressRows] = await Promise.all([
        sql`
          SELECT li.status, m.tmdb_id, m.media_type, m.title, m.poster_path, m.backdrop_path
          FROM public.library_items li
          JOIN public.media m ON m.id = li.media_id
          WHERE li.user_id = ${userId} AND li.status <> 'dropped' AND m.tmdb_id IS NOT NULL
        ` as Promise<Row[]>,
        sql`
          SELECT m.tmdb_id, ep.season_number, ep.episode_number
          FROM public.episodes_progress ep
          JOIN public.media m ON m.id = ep.media_id
          WHERE ep.user_id = ${userId} AND ep.watched = true AND ep.season_number > 0 AND m.media_type = 'tv'
        ` as Promise<Row[]>,
      ]);
    } catch (error) {
      console.error("[calendar] biblioteca falhou:", (error as Error)?.message);
      partial.push("library");
    }

    const watchedByShow = new Map<number, Set<string>>();

    for (const r of progressRows) {
      const set = watchedByShow.get(Number(r.tmdb_id)) ?? new Set<string>();

      set.add(`${Number(r.season_number)}-${Number(r.episode_number)}`);
      watchedByShow.set(Number(r.tmdb_id), set);
    }

    const library = new Map<string, LibraryEntry>();
    const watchedMovies = new Set<number>();

    for (const r of rows) {
      const type = r.media_type === "tv" ? "tv" : "movie";
      const tmdb = Number(r.tmdb_id);

      library.set(`${type}-${tmdb}`, {
        tmdb_id: tmdb,
        media_type: type,
        status: String(r.status),
        watched: type === "tv" ? watchedByShow.get(tmdb) ?? new Set() : new Set(),
      });

      if (type === "movie" && ["watched", "rewatched", "rewatching"].includes(String(r.status))) watchedMovies.add(tmdb);
    }

    /* ---------- séries da biblioteca ---------- */
    const showRows = rows.filter((r) => r.media_type === "tv");
    const series = (
      await mapLimited(showRows, async (r): Promise<SeriesInput | null> => {
        const details = await lightweightDetailsTMDB("tv", Number(r.tmdb_id));
        const wanted = seasonsToFetch(details, from, to);

        if (!wanted.length) return null;

        const seasonData = await Promise.all(wanted.map((n) => seasonTMDB(Number(r.tmdb_id), n).catch(() => null)));
        const episodes = seasonData.flatMap((season: Row | null) =>
          (Array.isArray(season?.episodes) ? season.episodes : [])
            .filter((e: Row) => e?.air_date && e.air_date >= from && e.air_date <= to)
            .map((e: Row) => ({ season_number: Number(e.season_number), episode_number: Number(e.episode_number), air_date: String(e.air_date).slice(0, 10) }))
        );

        return {
          tmdb_id: Number(r.tmdb_id),
          title: details?.name || r.title || "Série",
          poster_path: details?.poster_path || r.poster_path || null,
          backdrop_path: details?.backdrop_path || r.backdrop_path || null,
          popularity: Number(details?.popularity || 0),
          seasons: (Array.isArray(details?.seasons) ? details.seasons : [])
            .filter((s: Row) => Number(s.season_number) > 0)
            .map((s: Row) => ({ season_number: Number(s.season_number), episode_count: Number(s.episode_count || 0) })),
          episodes,
        };
      })
    ).filter((s): s is SeriesInput => Boolean(s));

    /* ---------- filmes da biblioteca (ainda não assistidos) ---------- */
    const movieRows = rows.filter((r) => r.media_type === "movie" && !watchedMovies.has(Number(r.tmdb_id)));
    const toMovie = (fromLibrary: boolean) => async (tmdb: number): Promise<MovieInput | null> => {
      const [event] = await calendarTMDB("movie", tmdb);

      if (!event?.date) return null;

      return {
        tmdb_id: tmdb,
        title: event.title,
        poster_path: event.poster_path,
        backdrop_path: event.backdrop_path,
        date: event.date,
        release_label: event.release_label === "Cinema" || event.release_label === "Digital" || event.release_label === "Cinema limitado" ? event.release_label : null,
        popularity: 0,
        fromLibrary,
      };
    };
    const movies = (await mapLimited(movieRows.map((r) => Number(r.tmdb_id)), toMovie(true))).filter((m): m is MovieInput => Boolean(m));

    /* ---------- descobertas (lançamentos gerais) ---------- */
    let discoveries: DiscoveryInput[] = [];

    if (!libraryOnly) {
      try {
        const range = { start: from, end: to };
        const settled = await Promise.allSettled([
          upcomingMoviesTMDB(0, 1, range),
          upcomingMoviesTMDB(0, 2, range),
          upcomingSeriesTMDB(0, 1, range),
          upcomingSeriesTMDB(0, 2, range),
        ]);

        if (settled.every((s) => s.status === "rejected")) throw new Error("TMDB indisponível");

        const raw = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
        const seen = new Set<string>();

        for (const d of raw) {
          const key = `${d.media_type}-${d.tmdb_id}`;

          // Itens da biblioteca vêm pelo caminho pessoal; exceção: filme já assistido
          // (não buscado acima) entra pela descoberta para aparecer como "Assistido".
          if (!d.date || seen.has(key) || (library.has(key) && !(d.media_type === "movie" && watchedMovies.has(d.tmdb_id)))) continue;

          seen.add(key);
          discoveries.push({
            tmdb_id: d.tmdb_id,
            media_type: d.media_type,
            title: d.title,
            poster_path: d.poster_path,
            backdrop_path: d.backdrop_path,
            date: d.date,
            popularity: d.popularity,
          });
        }

        // Filmes populares: confere a data BR/US (a do discover é a primária).
        const topMovies = discoveries
          .filter((d) => d.media_type === "movie")
          .sort((a, b) => b.popularity - a.popularity)
          .slice(0, DISCOVERY_MOVIES_CHECKED);
        const checked = await mapLimited(topMovies.map((d) => d.tmdb_id), toMovie(false));
        const checkedById = new Map(checked.filter((m): m is MovieInput => Boolean(m)).map((m) => [m.tmdb_id, m]));

        discoveries = discoveries
          .map((d) => {
            const c = d.media_type === "movie" ? checkedById.get(d.tmdb_id) : undefined;

            return c ? { ...d, date: c.date } : d;
          })
          .filter((d) => d.media_type === "tv" || checkedById.has(d.tmdb_id) || !topMovies.some((t) => t.tmdb_id === d.tmdb_id));
      } catch (error) {
        console.error("[calendar] descobertas falharam:", (error as Error)?.message);
        partial.push("discoveries");
      }
    }

    const events = buildEvents({ from, to, library, series, movies, discoveries, watchedMovies });
    const body: CalendarResponse = {
      from,
      to,
      today,
      events,
      partial,
      hasPersonalSources: rows.some((r) => r.status !== "dropped"),
    };

    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return respostaDeErro(error, "GET /api/calendar/events");
  }
}
