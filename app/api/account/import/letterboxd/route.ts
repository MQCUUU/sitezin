import { NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
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
        const { data: savedMedia, error: mediaError } = await supabase
          .from("media")
          .upsert({
            tmdb_id: movie.id,
            media_type: "movie",
            title: movie.title || row.name,
            original_title: movie.original_title || null,
            overview: movie.overview || null,
            poster_path: movie.poster_path || null,
            backdrop_path: movie.backdrop_path || null,
            release_date: movie.release_date || null,
            genres: [],
            popularity: movie.popularity ?? null,
            tmdb_rating: movie.vote_average ?? null,
            tmdb_vote_count: movie.vote_count ?? null,
            raw: movie,
          }, { onConflict: "tmdb_id,media_type" })
          .select("id")
          .single();

        if (mediaError || !savedMedia) throw mediaError || new Error("Falha ao salvar filme.");

        const { data: existing } = await supabase
          .from("library_items")
          .select("id, status, personal_rating")
          .eq("user_id", user.id)
          .eq("media_id", savedMedia.id)
          .maybeSingle();

        let savedLibrary = existing;

        if (!savedLibrary) {
          // Todo importado entra primeiro na biblioteca com o status padrÃ£o.
          // A mudanÃ§a para "assistido" (ou outro status futuro) acontece abaixo.
          const { data, error: libraryError } = await supabase
            .from("library_items")
            .insert({
              user_id: user.id,
              media_id: savedMedia.id,
              status: "want",
              personal_rating: null,
            })
            .select("id, status, personal_rating")
            .single();

          if (libraryError || !data) {
            throw libraryError || new Error("Falha ao adicionar Ã  biblioteca.");
          }

          savedLibrary = data;
          imported++;

          const { error: activityError } = await supabase
            .from("activity_events")
            .insert({
              user_id: user.id,
              media_id: savedMedia.id,
              library_item_id: data.id,
              event_type: "library_added",
              metadata: {
                status: "want",
                media_type: "movie",
                title: movie.title || row.name,
                source: "letterboxd",
              },
            });

          if (activityError) {
            console.error("Erro ao registrar importaÃ§Ã£o na biblioteca:", activityError.message);
          }
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
        const { error: updateError } = await supabase
          .from("library_items")
          .update({ status: nextStatus, personal_rating: rating })
          .eq("id", library.id)
          .eq("user_id", user.id);

        if (updateError) throw updateError;

        library.status = nextStatus;
        library.personalRating = rating;

        if (nextStatus !== previousStatus) {
          const { error: activityError } = await supabase
            .from("activity_events")
            .insert({
              user_id: user.id,
              media_id: library.mediaId,
              library_item_id: library.id,
              event_type: "status_changed",
              metadata: {
                from: previousStatus,
                to: nextStatus,
                source: "letterboxd",
              },
            });

          if (activityError) {
            console.error("Erro ao registrar status importado:", activityError.message);
          }
        }
      }

      if (row.watchedDate) {
        const watchedAt = new Date(`${row.watchedDate}T12:00:00`).toISOString();
        const { count } = await supabase
          .from("watch_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("library_item_id", library.id)
          .eq("watched_at", watchedAt);

        if (!count) {
          const { error } = await supabase.from("watch_entries").insert({
            user_id: user.id,
            library_item_id: library.id,
            media_id: library.mediaId,
            watched_at: watchedAt,
            rating: row.rating == null ? null : Number(row.rating) * 2,
            is_rewatch: Boolean(row.rewatch),
          });
          if (!error) history++;
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
