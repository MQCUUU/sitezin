import { NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { lightweightDetailsTMDB, searchMoviesTMDB } from "@/lib/tmdb";
import { chooseLetterboxdMovie } from "@/lib/letterboxd/match";
import { resolveCatalogMedia } from "@/lib/lists/media";

/*
 * POST /api/account/import/letterboxd — mescla diary.csv / ratings.csv /
 * watchlist.csv (o cliente lê o CSV e manda as linhas) na biblioteca do
 * usuário da sessão, sem apagar nada.
 *
 * V3.3:
 *  - busca /search/movie com o ANO como filtro (antes "Nome Ano" no texto do
 *    /search/multi: "Interstellar 2014" devolvia 0 resultados) e casamento
 *    estrito (lib/letterboxd/match.ts) — sem o antigo "qualquer filme do mesmo
 *    ano", que podia vincular o filme errado em silêncio;
 *  - 2ª tentativa em en-US (o Letterboxd exporta títulos em inglês);
 *  - catálogo pela fonte única (lib/lists/media.ts): existente não é alterado,
 *    novo vem do TMDB pelo servidor;
 *  - eventos de atividade passam a ser gravados (antes iam para uma coluna
 *    `created_at` que não existe em activity_events e falhavam em silêncio);
 *  - resumo factual: adicionados, atualizados, histórico, não encontrados.
 * Idempotente: reimportar o mesmo arquivo não duplica item, nota nem visualização.
 */

type LetterboxdRow = {
  name?: string;
  year?: number | null;
  rating?: number | null;
  watchedDate?: string | null;
  rewatch?: boolean;
  source?: "diary" | "ratings" | "watchlist";
};

type Movie = { id: number; title?: string; original_title?: string; overview?: string; poster_path?: string; backdrop_path?: string; release_date?: string; popularity?: number; vote_average?: number; vote_count?: number };

async function parallelMap<T, R>(values: T[], concurrency: number, worker: (value: T) => Promise<R>) {
  const output = new Array<R>(values.length);
  let cursor = 0;

  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await worker(values[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return output;
}

async function resolveMovie(row: LetterboxdRow): Promise<Movie | null> {
  const name = String(row.name).trim();
  const year = Number(row.year) || null;
  const pt = ((await searchMoviesTMDB(name, year).catch(() => null)) as { results?: Movie[] } | null)?.results || [];
  const fromPt = chooseLetterboxdMovie(pt, row) as Movie | null;

  if (fromPt) return fromPt;

  const en = ((await searchMoviesTMDB(name, year, "en-US").catch(() => null)) as { results?: Movie[] } | null)?.results || [];
  const fromEn = chooseLetterboxdMovie(en, row) as Movie | null;

  if (!fromEn) return null;

  // Casou pelo título em inglês: os dados do catálogo continuam em pt-BR.
  const localized =
    pt.find((item) => item.id === fromEn.id) ||
    ((await lightweightDetailsTMDB("movie", fromEn.id).catch(() => null)) as Movie | null);

  return localized ? { ...fromEn, ...localized, id: fromEn.id } : fromEn;
}

export async function POST(request: Request) {
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;

  if (!user || !user.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const rows = ((Array.isArray(body?.rows) ? body.rows : []) as LetterboxdRow[])
      .slice(0, 1000)
      .filter((row: LetterboxdRow) => String(row?.name || "").trim());

    if (!rows.length) {
      return NextResponse.json({ error: "O CSV não possui títulos válidos." }, { status: 400 });
    }

    const resolved = await parallelMap(rows, 5, async (row) => ({ row, movie: await resolveMovie(row) }));
    const sql = getDb();

    let imported = 0;
    let updated = 0;
    let history = 0;
    const notFound: Array<{ name: string; year: number | null }> = [];
    const libraryByTmdb = new Map<number, { id: string; mediaId: number; status: string; personalRating: number | null }>();

    for (const { row, movie } of resolved) {
      if (!movie?.id) {
        notFound.push({ name: String(row.name), year: Number(row.year) || null });
        continue;
      }

      let library = libraryByTmdb.get(Number(movie.id));

      if (!library) {
        // Catálogo: fonte única (lib/lists/media.ts) — existente não é alterado;
        // novo vem do TMDB pelo servidor. Sem confirmação do TMDB, conta como não encontrado.
        const catalog = await resolveCatalogMedia(sql, "movie", Number(movie.id));

        if (!catalog.ok) {
          notFound.push({ name: String(row.name), year: Number(row.year) || null });
          continue;
        }

        const savedMedia = { id: catalog.id };

        const insertRows = await sql`
          INSERT INTO public.library_items (user_id, media_id, status, personal_rating, added_at, updated_at)
          VALUES (${user.id}, ${savedMedia.id}, 'want', null, now(), now())
          ON CONFLICT (user_id, media_id) DO NOTHING
          RETURNING id, status, personal_rating
        `;
        let savedLibrary = insertRows[0];

        if (savedLibrary) {
          imported++;
          await sql`
            INSERT INTO public.activity_events (user_id, media_id, library_item_id, event_type, metadata, occurred_at)
            VALUES (
              ${user.id}, ${savedMedia.id}, ${savedLibrary.id}, 'library_added',
              ${JSON.stringify({ status: "want", media_type: "movie", title: movie.title || row.name, source: "letterboxd" })}, now()
            )
          `.catch((err) => console.error("Erro ao registrar importação na biblioteca:", err?.message));
        } else {
          const existingRows = await sql`
            SELECT id, status, personal_rating
            FROM public.library_items
            WHERE user_id = ${user.id} AND media_id = ${savedMedia.id}
            LIMIT 1
          `;
          savedLibrary = existingRows[0];
        }

        if (!savedLibrary) throw new Error("Falha ao adicionar à biblioteca.");

        library = {
          id: savedLibrary.id,
          mediaId: savedMedia.id,
          status: savedLibrary.status,
          personalRating: savedLibrary.personal_rating === null ? null : Number(savedLibrary.personal_rating),
        };
        libraryByTmdb.set(Number(movie.id), library);
      }

      const rating =
        row.rating == null ? library.personalRating : Math.min(10, Math.max(0, Number(row.rating) * 2));
      const protectedWatchedStatus = library.status === "rewatched" || library.status === "rewatching";
      const nextStatus = row.source === "watchlist" || protectedWatchedStatus ? library.status : "watched";

      if (nextStatus !== library.status || rating !== library.personalRating) {
        const previousStatus = library.status;

        await sql`
          UPDATE public.library_items
          SET status = ${nextStatus}, personal_rating = ${rating}, updated_at = now()
          WHERE id = ${library.id} AND user_id = ${user.id}
        `;

        library.status = nextStatus;
        library.personalRating = rating;
        updated++;

        if (nextStatus !== previousStatus) {
          await sql`
            INSERT INTO public.activity_events (user_id, media_id, library_item_id, event_type, metadata, occurred_at)
            VALUES (
              ${user.id}, ${library.mediaId}, ${library.id}, 'status_changed',
              ${JSON.stringify({ from: previousStatus, to: nextStatus, source: "letterboxd" })}, now()
            )
          `.catch((err) => console.error("Erro ao registrar status importado:", err?.message));
        }
      }

      if (row.watchedDate && /^\d{4}-\d{2}-\d{2}$/.test(row.watchedDate)) {
        // Data do diário = dia civil; meio-dia UTC mantém o mesmo dia em qualquer fuso do Brasil.
        const watchedAt = `${row.watchedDate}T12:00:00.000Z`;
        const isRewatch = Boolean(row.rewatch);
        const inserted = await sql`
          INSERT INTO public.watch_entries (
            user_id, library_item_id, media_id, watched_at, watched_at_precision, rating, is_rewatch
          )
          SELECT ${user.id}, ${library.id}, ${library.mediaId}, ${watchedAt}, 'date',
                 ${row.rating == null ? null : Number(row.rating) * 2}, ${isRewatch}
          WHERE NOT EXISTS (
            SELECT 1 FROM public.watch_entries
            WHERE user_id = ${user.id} AND media_id = ${library.mediaId} AND watched_at = ${watchedAt}
          )
          ON CONFLICT DO NOTHING
          RETURNING 1
        `;

        if (inserted.length > 0) history++;
      }
    }

    return NextResponse.json(
      {
        imported,
        updated,
        history,
        not_found: notFound,
        processed: rows.length,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return respostaDeErro(error, "POST /api/account/import/letterboxd");
  }
}
