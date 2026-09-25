import { getDb } from "@/lib/db/neon";
import { NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { searchTMDB } from "@/lib/tmdb";

type LetterboxdRow = {
  name?: string;
  year?: number | null;
  rating?: number | null;
  watchedDate?: string | null;
  rewatch?: boolean;
  source?: "diary" | "ratings" | "watchlist";
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function yearOf(item: any) {
  return Number(String(item?.release_date || "").slice(0, 4)) || null;
}

function chooseMovie(results: any[], row: LetterboxdRow) {
  const movies = results.filter((item) => item?.media_type === "movie");
  const wantedName = normalized(String(row.name || ""));
  const wantedYear = Number(row.year) || null;

  return (
    movies.find(
      (item) =>
        normalized(String(item.title || item.original_title || "")) === wantedName &&
        (!wantedYear || yearOf(item) === wantedYear),
    ) ||
    movies.find(
      (item) =>
        normalized(String(item.title || item.original_title || "")) === wantedName,
    ) ||
    movies.find((item) => !wantedYear || yearOf(item) === wantedYear) ||
    null
  );
}

async function parallelMap<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
) {
  const output = new Array<R>(values.length);
  let cursor = 0;

  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await worker(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, run),
  );
  return output;
}

export async function POST(request: Request) {
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;

  if (!user || !user.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rows = ((Array.isArray(body?.rows) ? body.rows : []) as LetterboxdRow[])
      .slice(0, 1000)
      .filter((row: LetterboxdRow) => String(row?.name || "").trim());

    if (!rows.length) {
      return NextResponse.json(
        { error: "O CSV não possui títulos válidos." },
        { status: 400 },
      );
    }

    const resolved = await parallelMap(rows, 5, async (row) => {
      const query = `${String(row.name).trim()}${row.year ? ` ${row.year}` : ""}`;
      const result = await searchTMDB(query) as any;
      return { row, movie: chooseMovie(result?.results || [], row) };
    });

    let imported = 0;
    let history = 0;
    const notFound: Array<{ name: string; year: number | null }> = [];
    const libraryByTmdb = new Map<number, {
      id: string;
      mediaId: number;
      status: string;
      personalRating: number | null;
    }>();

    for (const { row, movie } of resolved) {
      if (!movie?.id) {
        notFound.push({ name: String(row.name), year: Number(row.year) || null });
        continue;
      }

      let library = libraryByTmdb.get(Number(movie.id));

      if (!library) {
        const sql = getDb();
        const savedMediaRows = await sql`
          INSERT INTO public.media (
            tmdb_id, media_type, title, original_title, overview, poster_path, backdrop_path,
            release_date, genres, popularity, tmdb_rating, tmdb_vote_count, raw, updated_at
          )
          VALUES (
            ${movie.id}, 'movie', ${movie.title || row.name}, ${movie.original_title || null},
            ${movie.overview || null}, ${movie.poster_path || null}, ${movie.backdrop_path || null},
            ${movie.release_date || null}, ${[]}, ${movie.popularity ?? null},
            ${movie.vote_average ?? null}, ${movie.vote_count ?? null}, ${JSON.stringify(movie)}, now()
          )
          ON CONFLICT (tmdb_id, media_type)
          DO UPDATE SET
            title = EXCLUDED.title,
            original_title = COALESCE(EXCLUDED.original_title, media.original_title),
            overview = COALESCE(EXCLUDED.overview, media.overview),
            poster_path = COALESCE(EXCLUDED.poster_path, media.poster_path),
            backdrop_path = COALESCE(EXCLUDED.backdrop_path, media.backdrop_path),
            updated_at = now()
          RETURNING id
        `;
        const savedMedia = savedMediaRows[0];
        if (!savedMedia) throw new Error("Falha ao salvar filme.");

        const existingRows = await sql`
          SELECT id, status, personal_rating
          FROM public.library_items
          WHERE user_id = ${user.id} AND media_id = ${savedMedia.id}
          LIMIT 1
        `;

        let savedLibrary = existingRows[0] || null;

        if (!savedLibrary) {
          const insertRows = await sql`
            INSERT INTO public.library_items (
              user_id, media_id, status, personal_rating, added_at, updated_at
            )
            VALUES (${user.id}, ${savedMedia.id}, 'want', null, now(), now())
            RETURNING id, status, personal_rating
          `;
          if (!insertRows?.length) {
            throw new Error("Falha ao adicionar à biblioteca.");
          }
          savedLibrary = insertRows[0];
          imported++;

          await sql`
            INSERT INTO public.activity_events (
              user_id, media_id, library_item_id, event_type, metadata, occurred_at, created_at
            )
            VALUES (
              ${user.id}, ${savedMedia.id}, ${savedLibrary.id}, 'library_added',
              ${JSON.stringify({
                status: "want",
                media_type: "movie",
                title: movie.title || row.name,
                source: "letterboxd",
              })},
              now(), now()
            )
          `.catch((err) => console.error("Erro ao registrar importação na biblioteca:", err?.message));
        }

        library = {
          id: savedLibrary.id,
          mediaId: savedMedia.id,
          status: savedLibrary.status,
          personalRating: savedLibrary.personal_rating,
        };
        libraryByTmdb.set(Number(movie.id), library);
      }

      const rating = row.rating == null
        ? library.personalRating
        : Math.min(10, Math.max(0, Number(row.rating) * 2));
      const protectedWatchedStatus =
        library.status === "rewatched" || library.status === "rewatching";
      const nextStatus = row.source === "watchlist" || protectedWatchedStatus
        ? library.status
        : "watched";

      if (nextStatus !== library.status || rating !== library.personalRating) {
        const previousStatus = library.status;
        const sql = getDb();
        await sql`
          UPDATE public.library_items
          SET status = ${nextStatus}, personal_rating = ${rating}, updated_at = now()
          WHERE id = ${library.id} AND user_id = ${user.id}
        `;

        library.status = nextStatus;
        library.personalRating = rating;

        if (nextStatus !== previousStatus) {
          await sql`
            INSERT INTO public.activity_events (
              user_id, media_id, library_item_id, event_type, metadata, occurred_at, created_at
            )
            VALUES (
              ${user.id}, ${library.mediaId}, ${library.id}, 'status_changed',
              ${JSON.stringify({
                from: previousStatus,
                to: nextStatus,
                source: "letterboxd",
              })},
              now(), now()
            )
          `.catch((err) => console.error("Erro ao registrar status importado:", err?.message));
        }
      }

      if (row.watchedDate) {
        const watchedAt = new Date(`${row.watchedDate}T12:00:00`).toISOString();
        const sql = getDb();
        const existingCount = await sql`
          SELECT count(*)::int as count
          FROM public.watch_entries
          WHERE user_id = ${user.id}
            AND library_item_id = ${library.id}
            AND watched_at = ${watchedAt}
        `;

        if (Number(existingCount[0]?.count || 0) === 0) {
          const ratingVal = row.rating == null ? null : Number(row.rating) * 2;
          const isRewatch = Boolean(row.rewatch);
          try {
            await sql`
              INSERT INTO public.watch_entries (
                user_id, library_item_id, media_id, watched_at, rating, is_rewatch
              )
              VALUES (
                ${user.id}, ${library.id}, ${library.mediaId}, ${watchedAt}, ${ratingVal}, ${isRewatch}
              )
            `;
            history++;
          } catch (insertErr: any) {
            console.error("Erro ao inserir watch entry importada:", insertErr?.message);
          }
        }
      }
    }

    return NextResponse.json({
      imported,
      history,
      not_found: notFound,
      processed: rows.length,
    });
  } catch (error) {
    return respostaDeErro(error, "POST /api/account/import/letterboxd");
  }
}
