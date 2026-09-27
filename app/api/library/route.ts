import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { respostaDeErro } from "@/lib/api-error";

interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
  success: boolean;
}

interface MediaData {
  id: number;
  tmdb_id: number;
  media_type: string;
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  first_air_date: string | null;
  genres: string[];
  tmdb_rating: number | null;
  tmdb_vote_count: number | null;
  runtime: number | null;
  seasons_count: number | null;
  episodes_count: number | null;
  creator_names: string[];
  cast_names: string[];
  raw: Record<string, unknown>;
}

interface LibraryItem {
  id: string;
  status: string;
  favorite: boolean;
  personal_rating: number | null;
  review: string | null;
  watched_at: string | null;
  rewatch_count: number;
  current_season: number | null;
  completed_seasons: number;
  stopped_season: number | null;
  added_at: string;
  updated_at: string;
  media: MediaData;
}

interface PaginatedLibraryResponse {
  items: LibraryItem[];
  page: number;
  per_page: number;
  total_pages: number;
  total_results: number;
  total_library: number;
  counts: Record<string, number>;
  genres: string[];
  years: string[];
}

interface PostRequestBody {
  media: {
    id: number;
    media_type: string;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    overview?: string;
    poster_path?: string;
    backdrop_path?: string;
    release_date?: string;
    first_air_date?: string;
    genres?: any[];
    vote_average?: number;
    tmdb_rating?: number;
    vote_count?: number;
    runtime?: number;
    number_of_seasons?: number;
    number_of_episodes?: number;
    creator_names?: string[];
    cast_names?: string[];
  };
  status?: string;
  favorite?: boolean;
  personal_rating?: number | null;
  review?: string | null;
}

const VALID_STATUSES = [
  "want",
  "watching",
  "watched",
  "paused",
  "dropped",
  "rewatching",
  "rewatched",
];

function normalizeGenres(genres: any[] | undefined): string[] {
  if (!Array.isArray(genres)) {
    return [];
  }

  return genres
    .map((genre) => {
      if (typeof genre === "string") {
        return genre;
      }
      if (genre && typeof genre === "object") {
        return genre.name || "";
      }
      return "";
    })
    .filter(Boolean);
}

/*
 * ==========================================
 * GET
 * ==========================================
 */
export async function GET(
  req: NextRequest
): Promise<
  NextResponse<
    LibraryItem | LibraryItem[] | PaginatedLibraryResponse | null | ErrorResponse
  >
> {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const userId = user.id;
    const sql = getDb();
    const url = new URL(req.url);
    const tmdbIdParam = url.searchParams.get("tmdb_id");
    const typeParam = url.searchParams.get("type");

    /*
     * Consulta individual: /api/library?tmdb_id=123&type=tv
     */
    if (tmdbIdParam !== null) {
      const tmdbId = Number(tmdbIdParam);
      if (!tmdbIdParam || !Number.isFinite(tmdbId)) {
        return NextResponse.json({ error: "tmdb_id inválido." }, { status: 400 });
      }

      if (typeParam !== "movie" && typeParam !== "tv") {
        return NextResponse.json(
          { error: "type deve ser movie ou tv." },
          { status: 400 }
        );
      }

      const rows = await sql`
        SELECT
          li.id,
          li.status,
          li.favorite,
          li.personal_rating,
          li.review,
          li.watched_at,
          li.rewatch_count,
          li.current_season,
          li.completed_seasons,
          li.stopped_season,
          li.added_at,
          li.updated_at,
          to_jsonb(m.*) as media
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${userId}
          AND m.tmdb_id = ${tmdbId}
          AND m.media_type = ${typeParam}
        LIMIT 1;
      `;

      if (rows.length === 0) {
        return NextResponse.json(null);
      }

      return NextResponse.json(rows[0] as unknown as LibraryItem);
    }

    /*
     * ==========================================
     * FILTROS DINÂMICOS — compartilhados pelos
     * modos paginado e não-paginado (D1)
     * ==========================================
     *
     * D0 encontrou: mesmo no modo `paginated=true`, a query antiga
     * buscava TODAS as linhas do usuário e filtrava/ordenava/paginava
     * inteiramente em memória no Node — HIGH performance risk. Agora os
     * filtros viram WHERE real, o sort vira ORDER BY real, e a
     * paginação vira LIMIT/OFFSET real. `sql.query(text, params)` é
     * necessário aqui (em vez do template `sql\`...\``) porque o
     * WHERE é montado dinamicamente conforme os filtros presentes.
     */
    const params: unknown[] = [userId];
    const conditions: string[] = ["li.user_id = $1"];

    function addParam(value: unknown): string {
      params.push(value);
      return `$${params.length}`;
    }

    const search = (url.searchParams.get("search") || "").trim();
    const mediaType = url.searchParams.get("media_type");
    const status = url.searchParams.get("status");
    const genre = (url.searchParams.get("genre") || "").trim();
    const year = (url.searchParams.get("year") || "").trim();
    const favoriteOnly = url.searchParams.get("favorite") === "true";
    const minRating = Number(url.searchParams.get("min_rating") || "");
    const minTmdbRating = Number(url.searchParams.get("min_tmdb_rating") || "");
    const sort = (url.searchParams.get("sort") || "added").trim();

    if (search) {
      // Escapa curingas do LIKE para preservar o match por substring literal de antes.
      const escaped = search.replace(/[%_\\]/g, (char) => `\\${char}`);
      const term = `%${escaped}%`;
      conditions.push(
        `(m.title ILIKE ${addParam(term)} OR m.original_title ILIKE ${addParam(term)})`
      );
    }

    if (mediaType === "movie" || mediaType === "tv") {
      conditions.push(`m.media_type = ${addParam(mediaType)}`);
    }

    if (status && status !== "all") {
      conditions.push(`li.status = ${addParam(status)}`);
    }

    if (genre) {
      conditions.push(
        `EXISTS (SELECT 1 FROM unnest(m.genres) AS g WHERE lower(g) = lower(${addParam(genre)}))`
      );
    }

    if (year && /^\d{4}$/.test(year)) {
      conditions.push(
        `EXTRACT(YEAR FROM (CASE WHEN m.media_type = 'tv' THEN m.first_air_date ELSE m.release_date END))::text = ${addParam(year)}`
      );
    }

    if (favoriteOnly) {
      conditions.push("li.favorite = true");
    }

    if (Number.isFinite(minRating) && minRating > 0) {
      conditions.push(`li.personal_rating >= ${addParam(minRating)}`);
    }

    if (Number.isFinite(minTmdbRating) && minTmdbRating > 0) {
      conditions.push(`m.tmdb_rating >= ${addParam(minTmdbRating)}`);
    }

    const whereClause = conditions.join(" AND ");

    /*
     * `az`/`za` usavam `localeCompare(..., "pt-BR")` em memória; aqui
     * viram `lower(m.title)` — equivalente na prática (mesma ordem
     * alfabética geral), sem depender de uma collation ICU específica
     * estar disponível no Postgres do Neon.
     */
    const SORT_COLUMNS: Record<string, string> = {
      rating: "li.personal_rating DESC NULLS LAST, li.added_at DESC",
      "rating-low": "li.personal_rating ASC NULLS LAST, li.added_at DESC",
      tmdb: "m.tmdb_rating DESC NULLS LAST, li.added_at DESC",
      az: "lower(m.title) ASC",
      za: "lower(m.title) DESC",
      newest:
        "(CASE WHEN m.media_type = 'tv' THEN m.first_air_date ELSE m.release_date END) DESC NULLS LAST",
      oldest:
        "(CASE WHEN m.media_type = 'tv' THEN m.first_air_date ELSE m.release_date END) ASC NULLS LAST",
      updated: "li.updated_at DESC",
      added: "li.added_at DESC",
    };
    const orderByClause = SORT_COLUMNS[sort] || SORT_COLUMNS.added;

    const paginated = url.searchParams.get("paginated") === "true";

    const baseSelect = `
      SELECT
        li.id,
        li.status,
        li.favorite,
        li.personal_rating,
        li.review,
        li.watched_at,
        li.rewatch_count,
        li.current_season,
        li.completed_seasons,
        li.stopped_season,
        li.added_at,
        li.updated_at,
        to_jsonb(m.*) as media
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE ${whereClause}
    `;

    /*
     * Modo normal (não-paginado) — Home/Discover continuam recebendo a
     * biblioteca inteira (sem filtro nenhum passado, comportamento
     * idêntico ao anterior — precisam de múltiplos recortes de status
     * simultâneos, não dá para filtrar num único parâmetro sem
     * redesenhar essas páginas, fora do escopo D1 §10). Favorites e
     * Ranking agora passam filtro real (`favorite=true` /
     * `min_rating`) e recebem só o subconjunto que precisam, em vez da
     * biblioteca inteira sendo filtrada no cliente.
     */
    if (!paginated) {
      const rows = await sql.query(`${baseSelect} ORDER BY ${orderByClause}`, params);
      return NextResponse.json(rows as unknown as LibraryItem[]);
    }

    /*
     * Modo paginado (/library)
     */
    const requestedPage = Number(url.searchParams.get("page") || 1);
    const requestedLimit = Number(url.searchParams.get("limit") || 27);

    const page = Number.isFinite(requestedPage)
      ? Math.max(1, Math.floor(requestedPage))
      : 1;

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
      : 27;

    // 1. Contagem total FILTRADA — decide totalPages/clamping antes de buscar a página.
    const countRows = await sql.query(
      `SELECT count(*)::int AS total FROM public.library_items li JOIN public.media m ON m.id = li.media_id WHERE ${whereClause}`,
      params
    );
    const totalResults = Number((countRows[0] as { total: number } | undefined)?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalResults / limit));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;

    // 2. Página de dados FILTRADA — LIMIT/OFFSET reais, sem trazer o resto da biblioteca.
    const limitPlaceholder = addParam(limit);
    const offsetPlaceholder = addParam(offset);
    const pageRows = await sql.query(
      `${baseSelect} ORDER BY ${orderByClause} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      params
    );

    // 3. Contagens por status + favoritos — agregado, sem filtro (mesmo significado de antes: conta a biblioteca inteira do usuário, não a página filtrada).
    const countsRows = await sql`
      SELECT
        count(*)::int AS all,
        count(*) FILTER (WHERE status = 'want')::int AS want,
        count(*) FILTER (WHERE status = 'watching')::int AS watching,
        count(*) FILTER (WHERE status = 'watched')::int AS watched,
        count(*) FILTER (WHERE status = 'paused')::int AS paused,
        count(*) FILTER (WHERE status = 'dropped')::int AS dropped,
        count(*) FILTER (WHERE status = 'rewatching')::int AS rewatching,
        count(*) FILTER (WHERE status = 'rewatched')::int AS rewatched,
        count(*) FILTER (WHERE favorite)::int AS favorites
      FROM public.library_items
      WHERE user_id = ${userId}
    `;
    const counts = (countsRows[0] as Record<string, number> | undefined) || {
      all: 0, want: 0, watching: 0, watched: 0, paused: 0, dropped: 0, rewatching: 0, rewatched: 0, favorites: 0,
    };

    // 4. Opções de filtro (gêneros/anos) — projeção leve (só 2 colunas), biblioteca inteira do usuário, sem o payload completo de `media`.
    const genreYearRows = await sql`
      SELECT
        m.genres,
        (CASE WHEN m.media_type = 'tv' THEN m.first_air_date ELSE m.release_date END) as date
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${userId}
    `;
    const genreSet = new Set<string>();
    const yearSet = new Set<string>();
    for (const row of genreYearRows as { genres: unknown; date: string | null }[]) {
      const genres = Array.isArray(row.genres) ? row.genres : [];
      for (const itemGenre of genres) {
        if (typeof itemGenre === "string" && itemGenre.trim()) {
          genreSet.add(itemGenre.trim());
        }
      }
      if (row.date) {
        const parsedYear = new Date(row.date).getFullYear();
        if (Number.isFinite(parsedYear)) {
          yearSet.add(String(parsedYear));
        }
      }
    }

    return NextResponse.json(
      {
        items: pageRows as LibraryItem[],
        page: safePage,
        per_page: limit,
        total_pages: totalPages,
        total_results: totalResults,
        total_library: Number(counts.all || 0),
        counts,
        genres: Array.from(genreSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
        years: Array.from(yearSet).sort((a, b) => Number(b) - Number(a)),
      } satisfies PaginatedLibraryResponse,
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro em GET /api/library:", error);
    return respostaDeErro(error, "GET /api/library");
  }
}

/*
 * ==========================================
 * POST
 * ==========================================
 */
export async function POST(
  req: Request
): Promise<NextResponse<LibraryItem | ErrorResponse | SuccessResponse>> {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const userId = user.id;
    const body: PostRequestBody = await req.json();
    const media = body.media;

    if (!media?.id) {
      return NextResponse.json(
        { error: "Dados do título inválidos." },
        { status: 400 }
      );
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }

    const mediaType = media.media_type === "tv" ? "tv" : "movie";
    const mediaTitle = media.title ?? media.name ?? "Sem título";
    const originalTitle = media.original_title ?? media.original_name ?? null;
    const overview = media.overview ?? null;
    const posterPath = media.poster_path ?? null;
    const backdropPath = media.backdrop_path ?? null;
    const releaseDate = media.release_date ?? null;
    const firstAirDate = media.first_air_date ?? null;
    const normalizedGenres = normalizeGenres(media.genres);
    const tmdbRating = media.vote_average ?? media.tmdb_rating ?? null;
    const tmdbVoteCount = media.vote_count ?? null;
    const runtime = media.runtime ?? null;
    const seasonsCount = media.number_of_seasons ?? null;
    const episodesCount = media.number_of_episodes ?? null;
    const creatorNames = media.creator_names || [];
    const castNames = media.cast_names || [];
    const rawJson = media || {};

    const sql = getDb();

    /*
     * 1. Salvar / atualizar mídia
     */
    const mediaRows = await sql`
      INSERT INTO public.media (
        tmdb_id,
        media_type,
        title,
        original_title,
        overview,
        poster_path,
        backdrop_path,
        release_date,
        first_air_date,
        genres,
        tmdb_rating,
        tmdb_vote_count,
        runtime,
        seasons_count,
        episodes_count,
        creator_names,
        cast_names,
        raw,
        updated_at
      )
      VALUES (
        ${media.id},
        ${mediaType},
        ${mediaTitle},
        ${originalTitle},
        ${overview},
        ${posterPath},
        ${backdropPath},
        ${releaseDate},
        ${firstAirDate},
        ${normalizedGenres},
        ${tmdbRating},
        ${tmdbVoteCount},
        ${runtime},
        ${seasonsCount},
        ${episodesCount},
        ${creatorNames},
        ${castNames},
        ${rawJson},
        NOW()
      )
      ON CONFLICT (tmdb_id, media_type)
      DO UPDATE SET
        title = EXCLUDED.title,
        original_title = EXCLUDED.original_title,
        overview = EXCLUDED.overview,
        poster_path = EXCLUDED.poster_path,
        backdrop_path = EXCLUDED.backdrop_path,
        release_date = EXCLUDED.release_date,
        first_air_date = EXCLUDED.first_air_date,
        genres = EXCLUDED.genres,
        tmdb_rating = EXCLUDED.tmdb_rating,
        tmdb_vote_count = EXCLUDED.tmdb_vote_count,
        runtime = EXCLUDED.runtime,
        seasons_count = EXCLUDED.seasons_count,
        episodes_count = EXCLUDED.episodes_count,
        creator_names = EXCLUDED.creator_names,
        cast_names = EXCLUDED.cast_names,
        raw = EXCLUDED.raw,
        updated_at = NOW()
      RETURNING *;
    `;

    const existingMedia = mediaRows[0];
    if (!existingMedia) {
      return NextResponse.json(
        { error: "Não foi possível salvar os dados do título." },
        { status: 500 }
      );
    }

    /*
     * 2. Procurar item na biblioteca do usuário
     */
    const existingItemRows = await sql`
      SELECT
        id,
        status,
        favorite,
        personal_rating,
        review,
        rewatch_count,
        current_season,
        completed_seasons,
        stopped_season
      FROM public.library_items
      WHERE user_id = ${userId} AND media_id = ${existingMedia.id}
      LIMIT 1;
    `;
    const existingLibraryItem = existingItemRows[0] || null;

    /*
     * 3. Calcular reassistidas e progresso
     */
    let rewatchCount = Number(existingLibraryItem?.rewatch_count || 0);
    const isStartingRewatch =
      body.status === "rewatching" &&
      existingLibraryItem?.status !== "rewatching";

    const isDirectlyCompletingRewatch =
      body.status === "rewatched" &&
      existingLibraryItem?.status !== "rewatching" &&
      existingLibraryItem?.status !== "rewatched";

    if (isStartingRewatch || isDirectlyCompletingRewatch) {
      rewatchCount += 1;
    }

    const newStatus =
      body.status ?? existingLibraryItem?.status ?? "want";
    const newFavorite =
      body.favorite ?? existingLibraryItem?.favorite ?? false;
    const personalRating =
      body.personal_rating !== undefined
        ? body.personal_rating
        : existingLibraryItem?.personal_rating ?? null;
    const review =
      body.review !== undefined
        ? body.review
        : existingLibraryItem?.review ?? null;

    let currentSeason = existingLibraryItem?.current_season ?? null;
    let completedSeasons = Number(existingLibraryItem?.completed_seasons || 0);
    let stoppedSeason = existingLibraryItem?.stopped_season ?? null;

    if (mediaType === "tv" && !existingLibraryItem) {
      currentSeason = 1;
      completedSeasons = 0;
      stoppedSeason = null;
    }

    if (mediaType === "movie") {
      currentSeason = null;
      completedSeasons = 0;
      stoppedSeason = null;
    }

    if (mediaType === "tv" && isStartingRewatch) {
      completedSeasons = 0;
      currentSeason = 1;
      stoppedSeason = null;
    }

    if (mediaType === "tv" && newStatus === "rewatched") {
      const totalSeasons = Number(existingMedia.seasons_count || 0);
      completedSeasons = totalSeasons;
      currentSeason = totalSeasons || 1;
      stoppedSeason = null;
    }

    /*
     * 4. Salvar na biblioteca (Upsert)
     */
    const itemRows = await sql`
      INSERT INTO public.library_items (
        user_id,
        media_id,
        status,
        favorite,
        personal_rating,
        review,
        rewatch_count,
        current_season,
        completed_seasons,
        stopped_season,
        updated_at
      )
      VALUES (
        ${userId},
        ${existingMedia.id},
        ${newStatus},
        ${newFavorite},
        ${personalRating},
        ${review},
        ${rewatchCount},
        ${currentSeason},
        ${completedSeasons},
        ${stoppedSeason},
        NOW()
      )
      ON CONFLICT (user_id, media_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        favorite = EXCLUDED.favorite,
        personal_rating = EXCLUDED.personal_rating,
        review = EXCLUDED.review,
        rewatch_count = EXCLUDED.rewatch_count,
        current_season = EXCLUDED.current_season,
        completed_seasons = EXCLUDED.completed_seasons,
        stopped_season = EXCLUDED.stopped_season,
        updated_at = NOW()
      RETURNING
        id,
        status,
        favorite,
        personal_rating,
        review,
        watched_at,
        rewatch_count,
        current_season,
        completed_seasons,
        stopped_season,
        added_at,
        updated_at;
    `;

    const item = itemRows[0];
    if (!item) {
      return NextResponse.json(
        { error: "Não foi possível salvar o título na biblioteca." },
        { status: 500 }
      );
    }

    item.media = existingMedia;

    /*
     * 5. Registrar no diário (safe / não-bloqueante)
     */
    try {
      if (!existingLibraryItem) {
        await sql`
          INSERT INTO public.activity_events (
            user_id,
            media_id,
            library_item_id,
            event_type,
            metadata
          )
          VALUES (
            ${userId},
            ${existingMedia.id},
            ${item.id},
            'library_added',
            ${{
              status: newStatus,
              media_type: mediaType,
              title: mediaTitle,
            }}
          );
        `;
      }

      if (isStartingRewatch && existingLibraryItem) {
        await sql`
          INSERT INTO public.activity_events (
            user_id,
            media_id,
            library_item_id,
            event_type,
            metadata
          )
          VALUES (
            ${userId},
            ${existingMedia.id},
            ${item.id},
            'rewatch_started',
            ${{
              rewatch_count: rewatchCount,
              title: mediaTitle,
            }}
          );
        `;
      }
    } catch (actErr: any) {
      console.warn("[activity_events] Registro de atividade não pôde ser completado:", actErr?.message);
    }

    return NextResponse.json(item as unknown as LibraryItem);
  } catch (error) {
    console.error("Erro ao atualizar biblioteca:", error);
    return respostaDeErro(error, "POST /api/library");
  }
}

/*
 * ==========================================
 * DELETE
 * ==========================================
 */
export async function DELETE(
  req: NextRequest
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "ID da biblioteca não informado." },
        { status: 400 }
      );
    }

    const sql = getDb();
    await sql`
      DELETE FROM public.library_items
      WHERE id = ${id} AND user_id = ${user.id};
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro em DELETE /api/library:", error);
    return respostaDeErro(error, "DELETE /api/library");
  }
}
