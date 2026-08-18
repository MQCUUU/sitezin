import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { respostaDeErro } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";
import { completeSeriesProgress, resetSeriesProgress, restoreSeriesProgress } from "@/lib/complete-series-progress";

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

  counts: Record<
    string,
    number
  >;

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

interface MediaUpsertData {
  tmdb_id: number;
  media_type: string;

  title: string | null;
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

interface LibraryItemUpsertData {
  user_id: string;

  media_id: number;

  status: string;

  favorite: boolean;

  personal_rating: number | null;

  review?: string | null;

  rewatch_count: number;

  current_season: number | null;

  completed_seasons: number;

  stopped_season: number | null;
}

/*
 * ==========================================
 * STATUS PERMITIDOS
 * ==========================================
 */

const VALID_STATUSES = [
  "want",
  "watching",
  "watched",
  "paused",
  "dropped",
  "rewatching",
  "rewatched",
];

/*
 * ==========================================
 * NORMALIZAR GÊNEROS
 * ==========================================
 */

function normalizeGenres(
  genres: any[] | undefined
): string[] {
  if (!Array.isArray(genres)) {
    return [];
  }

  return genres
    .map((genre) => {
      if (typeof genre === "string") {
        return genre;
      }

      if (
        genre &&
        typeof genre === "object"
      ) {
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
    LibraryItem |
      LibraryItem[] |
      PaginatedLibraryResponse |
      null |
      ErrorResponse
  >
> {
  const s =
    await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Não autenticado",
      },
      {
        status: 401,
      }
    );
  }

  const url =
    new URL(req.url);

  const tmdbIdParam =
    url.searchParams.get(
      "tmdb_id"
    );

  const typeParam =
    url.searchParams.get(
      "type"
    );

  /*
   * ==========================================
   * CONSULTA INDIVIDUAL
   * ==========================================
   *
   * Mantém compatibilidade com:
   *
   * /api/library?tmdb_id=123&type=tv
   */

  if (
    tmdbIdParam !== null
  ) {
    const tmdbId =
      Number(
        tmdbIdParam
      );

    if (
      !tmdbIdParam ||
      !Number.isFinite(
        tmdbId
      )
    ) {
      return NextResponse.json(
        {
          error:
            "tmdb_id inválido.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeParam !== "movie" &&
      typeParam !== "tv"
    ) {
      return NextResponse.json(
        {
          error:
            "type deve ser movie ou tv.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: media,
      error: mediaError,
    } = await s
      .from("media")
      .select("id")
      .eq(
        "tmdb_id",
        tmdbId
      )
      .eq(
        "media_type",
        typeParam
      )
      .maybeSingle();

    if (mediaError) {
  return respostaDeErro(
    mediaError,
    "GET /api/library media",
  );
}

    if (!media) {
      return NextResponse.json(
        null
      );
    }

    const {
      data,
      error,
    } = await s
      .from("library_items")
      .select(
        `
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
        updated_at,
        media:media_id(*)
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "media_id",
        media.id
      )
      .maybeSingle();

    if (error) {
  return respostaDeErro(
    error,
    "GET /api/library item",
  );
}

    return NextResponse.json(
      data
        ? (
            data as unknown as LibraryItem
          )
        : null
    );
  }

  /*
   * ==========================================
   * MODO PAGINADO DA BIBLIOTECA
   * ==========================================
   *
   * /api/library?paginated=true&page=1&limit=27
   *
   * O GET antigo sem "paginated=true"
   * continua existindo para Home, Stats,
   * Ranking e qualquer outra tela.
   */

  const paginated =
    url.searchParams.get(
      "paginated"
    ) === "true";

  if (paginated) {
    const requestedPage =
      Number(
        url.searchParams.get(
          "page"
        ) || 1
      );

    const requestedLimit =
      Number(
        url.searchParams.get(
          "limit"
        ) || 27
      );

    const page =
      Number.isFinite(
        requestedPage
      )
        ? Math.max(
            1,
            Math.floor(
              requestedPage
            )
          )
        : 1;

    const limit =
      Number.isFinite(
        requestedLimit
      )
        ? Math.min(
            100,
            Math.max(
              1,
              Math.floor(
                requestedLimit
              )
            )
          )
        : 27;

    const search =
      (
        url.searchParams.get(
          "search"
        ) || ""
      )
        .trim()
        .toLowerCase();

    const mediaType =
      url.searchParams.get(
        "media_type"
      );

    const status =
      url.searchParams.get(
        "status"
      );

    const genre =
      (
        url.searchParams.get(
          "genre"
        ) || ""
      )
        .trim()
        .toLowerCase();

    const year =
      (
        url.searchParams.get(
          "year"
        ) || ""
      ).trim();

    const favoriteOnly =
      url.searchParams.get(
        "favorite"
      ) === "true";

    const minRating =
      Number(
        url.searchParams.get(
          "min_rating"
        ) || ""
      );

    const minTmdbRating =
      Number(
        url.searchParams.get(
          "min_tmdb_rating"
        ) || ""
      );

    const sort =
      (
        url.searchParams.get(
          "sort"
        ) || "added"
      ).trim();

    /*
     * Primeira consulta:
     * somente os campos necessários para
     * filtrar, ordenar, contar e paginar.
     *
     * Assim não transportamos overview,
     * raw, elenco etc. da biblioteca inteira.
     */

    const {
      data: indexRows,
      error: indexError,
    } = await s
      .from("library_items")
      .select(
        `
        id,
        status,
        favorite,
        personal_rating,
        added_at,
        updated_at,
        media:media_id(
          id,
          media_type,
          title,
          original_title,
          release_date,
          first_air_date,
          genres,
          tmdb_rating
        )
        `
      )
      .eq(
        "user_id",
        user.id
      );

    if (indexError) {
  return respostaDeErro(
    indexError,
    "GET /api/library index",
  );
}

    const allRows =
      Array.isArray(
        indexRows
      )
        ? (
            indexRows as any[]
          )
        : [];

    /*
     * ==========================================
     * FACETAS / CONTADORES GLOBAIS
     * ==========================================
     */

    const counts:
      Record<
        string,
        number
      > = {
        all:
          allRows.length,

        want: 0,
        watching: 0,
        watched: 0,
        paused: 0,
        dropped: 0,
        rewatching: 0,
        rewatched: 0,
        favorites: 0,
      };

    const genreSet =
      new Set<string>();

    const yearSet =
      new Set<string>();

    for (
      const row
      of allRows
    ) {
      if (
        row.status
      ) {
        counts[
          row.status
        ] =
          (
            counts[
              row.status
            ] || 0
          ) + 1;
      }

      if (
        row.favorite
      ) {
        counts.favorites +=
          1;
      }

      const media =
        row.media;

      const genres =
        Array.isArray(
          media?.genres
        )
          ? media.genres
          : [];

      for (
        const itemGenre
        of genres
      ) {
        if (
          typeof itemGenre ===
            "string" &&
          itemGenre.trim()
        ) {
          genreSet.add(
            itemGenre.trim()
          );
        } else if (
          itemGenre &&
          typeof itemGenre ===
            "object" &&
          typeof itemGenre.name ===
            "string"
        ) {
          genreSet.add(
            itemGenre.name.trim()
          );
        }
      }

      const date =
        media?.media_type ===
          "tv"
          ? media?.first_air_date
          : media?.release_date;

      if (date) {
        const parsedYear =
          new Date(
            date
          )
            .getFullYear();

        if (
          Number.isFinite(
            parsedYear
          )
        ) {
          yearSet.add(
            String(
              parsedYear
            )
          );
        }
      }
    }

    /*
     * ==========================================
     * FILTRAR
     * ==========================================
     */

    const filteredRows =
      allRows.filter(
        (
          row: any
        ) => {
          const media =
            row.media;

          if (!media) {
            return false;
          }

          if (
            search
          ) {
            const title =
              String(
                media.title ||
                  ""
              )
                .toLowerCase();

            const originalTitle =
              String(
                media.original_title ||
                  ""
              )
                .toLowerCase();

            if (
              !title.includes(
                search
              ) &&
              !originalTitle.includes(
                search
              )
            ) {
              return false;
            }
          }

          if (
            mediaType ===
              "movie" ||
            mediaType ===
              "tv"
          ) {
            if (
              media.media_type !==
              mediaType
            ) {
              return false;
            }
          }

          if (
            status &&
            status !== "all" &&
            row.status !==
              status
          ) {
            return false;
          }

          if (
            genre
          ) {
            const genres =
              Array.isArray(
                media.genres
              )
                ? media.genres
                : [];

            const matchesGenre =
              genres.some(
                (
                  itemGenre: any
                ) => {
                  const name =
                    typeof itemGenre ===
                    "string"
                      ? itemGenre
                      : itemGenre
                          ?.name;

                  return (
                    typeof name ===
                      "string" &&
                    name
                      .trim()
                      .toLowerCase() ===
                      genre
                  );
                }
              );

            if (
              !matchesGenre
            ) {
              return false;
            }
          }

          if (
            year &&
            /^\d{4}$/.test(
              year
            )
          ) {
            const date =
              media.media_type ===
                "tv"
                ? media.first_air_date
                : media.release_date;

            const itemYear =
              date
                ? String(
                    new Date(
                      date
                    ).getFullYear()
                  )
                : "";

            if (
              itemYear !==
              year
            ) {
              return false;
            }
          }

          if (
            favoriteOnly &&
            !row.favorite
          ) {
            return false;
          }

          if (
            Number.isFinite(
              minRating
            ) &&
            minRating > 0 &&
            Number(
              row.personal_rating ||
                0
            ) <
              minRating
          ) {
            return false;
          }

          if (
            Number.isFinite(
              minTmdbRating
            ) &&
            minTmdbRating > 0 &&
            Number(
              media.tmdb_rating ||
                0
            ) <
              minTmdbRating
          ) {
            return false;
          }

          return true;
        }
      );

    /*
     * ==========================================
     * ORDENAR
     * ==========================================
     */

    filteredRows.sort(
      (
        a: any,
        b: any
      ) => {
        if (
          sort ===
          "rating"
        ) {
          return (
            Number(
              b.personal_rating ??
                -1
            ) -
            Number(
              a.personal_rating ??
                -1
            )
          );
        }

        if (
          sort ===
          "rating-low"
        ) {
          return (
            Number(
              a.personal_rating ??
                999
            ) -
            Number(
              b.personal_rating ??
                999
            )
          );
        }

        if (
          sort ===
          "tmdb"
        ) {
          return (
            Number(
              b.media
                ?.tmdb_rating ??
                -1
            ) -
            Number(
              a.media
                ?.tmdb_rating ??
                -1
            )
          );
        }

        if (
          sort === "az"
        ) {
          return String(
            a.media?.title ||
              ""
          ).localeCompare(
            String(
              b.media?.title ||
                ""
            ),
            "pt-BR"
          );
        }

        if (
          sort === "za"
        ) {
          return String(
            b.media?.title ||
              ""
          ).localeCompare(
            String(
              a.media?.title ||
                ""
            ),
            "pt-BR"
          );
        }

        if (
          sort ===
            "newest" ||
          sort ===
            "oldest"
        ) {
          const getDate =
            (
              row: any
            ) => {
              const media =
                row.media;

              const date =
                media?.media_type ===
                  "tv"
                  ? media
                      ?.first_air_date
                  : media
                      ?.release_date;

              return date
                ? new Date(
                    date
                  ).getTime()
                : 0;
            };

          return sort ===
            "newest"
            ? getDate(
                b
              ) -
                getDate(
                  a
                )
            : getDate(
                a
              ) -
                getDate(
                  b
                );
        }

        if (
          sort ===
          "updated"
        ) {
          return (
            new Date(
              b.updated_at
            ).getTime() -
            new Date(
              a.updated_at
            ).getTime()
          );
        }

        return (
          new Date(
            b.added_at
          ).getTime() -
          new Date(
            a.added_at
          ).getTime()
        );
      }
    );

    const totalResults =
      filteredRows.length;

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          totalResults /
            limit
        )
      );

    const safePage =
      Math.min(
        page,
        totalPages
      );

    const start =
      (
        safePage - 1
      ) * limit;

    const pageRows =
      filteredRows.slice(
        start,
        start + limit
      );

    const pageIds =
      pageRows.map(
        (
          row: any
        ) =>
          String(
            row.id
          )
      );

    let pageItems:
      LibraryItem[] =
      [];

    /*
     * Segunda consulta:
     * agora sim buscamos os dados completos
     * somente dos 27 itens da página atual.
     */

    if (
      pageIds.length >
      0
    ) {
      const {
        data: fullRows,
        error: fullError,
      } = await s
        .from("library_items")
        .select(
          `
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
          updated_at,
          media:media_id(*)
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .in(
          "id",
          pageIds
        );

      if (fullError) {
  return respostaDeErro(
    fullError,
    "GET /api/library page",
  );
}

      const orderMap =
        new Map<
          string,
          number
        >();

      pageIds.forEach(
        (
          id,
          index
        ) => {
          orderMap.set(
            id,
            index
          );
        }
      );

      pageItems =
        (
          (
            fullRows ||
            []
          ) as unknown as LibraryItem[]
        ).sort(
          (
            a,
            b
          ) =>
            (
              orderMap.get(
                String(
                  a.id
                )
              ) ?? 9999
            ) -
            (
              orderMap.get(
                String(
                  b.id
                )
              ) ?? 9999
            )
        );
    }

    return NextResponse.json(
      {
        items:
          pageItems,

        page:
          safePage,

        per_page:
          limit,

        total_pages:
          totalPages,

        total_results:
          totalResults,

        total_library:
          allRows.length,

        counts,

        genres:
          Array.from(
            genreSet
          ).sort(
            (
              a,
              b
            ) =>
              a.localeCompare(
                b,
                "pt-BR"
              )
          ),

        years:
          Array.from(
            yearSet
          ).sort(
            (
              a,
              b
            ) =>
              Number(
                b
              ) -
              Number(
                a
              )
          ),
      } satisfies PaginatedLibraryResponse,
      {
        headers: {
          "Cache-Control":
            "private, no-store",
        },
      }
    );
  }

  /*
   * ==========================================
   * GET ANTIGO — COMPATIBILIDADE
   * ==========================================
   */

  const {
    data,
    error,
  } = await s
    .from("library_items")
    .select(
      `
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
      updated_at,
      media:media_id(*)
      `
    )
    .eq(
      "user_id",
      user.id
    )
    .order(
      "added_at",
      {
        ascending:
          false,
      }
    );

  if (error) {
  return respostaDeErro(
    error,
    "GET /api/library",
  );
}

  return NextResponse.json(
    (
      data ?? []
    ) as unknown as LibraryItem[]
  );
}

/*
 * ==========================================
 * POST
 * ==========================================
 */

export async function POST(
  req: Request
): Promise<
  NextResponse<
    LibraryItem |
      ErrorResponse |
      SuccessResponse
  >
> {
  const s = await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Não autenticado",
      },
      {
        status: 401,
      }
    );
  }

  try {
    const body: PostRequestBody =
      await req.json();

    const media = body.media;

    if (!media?.id) {
      return NextResponse.json(
        {
          error:
            "Dados do título inválidos.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ==========================================
     * VALIDAR STATUS
     * ==========================================
     */

    if (
      body.status &&
      !VALID_STATUSES.includes(
        body.status
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Status inválido.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ==========================================
     * NORMALIZAR TIPO
     * ==========================================
     */

    const mediaType =
      media.media_type === "tv"
        ? "tv"
        : "movie";

    const mediaTitle =
      media.title ??
      media.name ??
      "Sem título";

    /*
     * ==========================================
     * SALVAR / ATUALIZAR MÍDIA
     * ==========================================
     */

    const {
      data: existingMedia,
      error: mediaError,
    } = await s
      .from("media")
      .upsert<MediaUpsertData>(
        {
          tmdb_id: media.id,

          media_type:
            mediaType,

          title:
            mediaTitle,

          original_title:
            media.original_title ??
            media.original_name ??
            null,

          overview:
            media.overview ??
            null,

          poster_path:
            media.poster_path ??
            null,

          backdrop_path:
            media.backdrop_path ??
            null,

          release_date:
            media.release_date ??
            null,

          first_air_date:
            media.first_air_date ??
            null,

          genres:
            normalizeGenres(
              media.genres
            ),

          tmdb_rating:
            media.vote_average ??
            media.tmdb_rating ??
            null,

          tmdb_vote_count:
            media.vote_count ??
            null,

          runtime:
            media.runtime ??
            null,

          seasons_count:
            media.number_of_seasons ??
            null,

          episodes_count:
            media.number_of_episodes ??
            null,

          creator_names:
            media.creator_names ||
            [],

          cast_names:
            media.cast_names ||
            [],

          raw:
            media as Record<
              string,
              unknown
            >,
        },
        {
          onConflict:
            "tmdb_id,media_type",
        }
      )
      .select()
      .single();

    if (
  mediaError ||
  !existingMedia
) {
  if (mediaError) {
    return respostaDeErro(
      mediaError,
      "POST /api/library media",
    );
  }

  return NextResponse.json(
    {
      error:
        "Não foi possível salvar os dados do título.",
    },
    {
      status: 500,
    },
  );
}

    /*
     * ==========================================
     * PROCURAR NA BIBLIOTECA
     * ==========================================
     */

    const {
      data: existingLibraryItem,
      error: existingLibraryError,
    } = await s
      .from("library_items")
      .select(
        `
        id,
        status,
        favorite,
        personal_rating,
        review,
        rewatch_count,
        current_season,
        completed_seasons,
        stopped_season
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "media_id",
        existingMedia.id
      )
      .maybeSingle();

    if (existingLibraryError) {
  return respostaDeErro(
    existingLibraryError,
    "POST /api/library existing",
  );
}

    /*
     * ==========================================
     * REASSISTIDAS
     * ==========================================
     */

    let rewatchCount =
      Number(
        existingLibraryItem
          ?.rewatch_count || 0
      );

    const isStartingRewatch =
      body.status === "rewatching" &&
      existingLibraryItem?.status !==
        "rewatching";

    const isDirectlyCompletingRewatch =
      body.status === "rewatched" &&
      existingLibraryItem?.status !== "rewatching" &&
      existingLibraryItem?.status !== "rewatched";

    if (
      isStartingRewatch ||
      isDirectlyCompletingRewatch
    ) {
      rewatchCount += 1;
    }

    /*
     * ==========================================
     * STATUS
     * ==========================================
     */

    const newStatus =
      body.status ??
      existingLibraryItem?.status ??
      "want";

    /*
     * ==========================================
     * FAVORITO
     * ==========================================
     */

    const newFavorite =
      body.favorite ??
      existingLibraryItem?.favorite ??
      false;

    /*
     * ==========================================
     * NOTA
     * ==========================================
     */

    const personalRating =
      body.personal_rating !==
      undefined
        ? body.personal_rating
        : existingLibraryItem
            ?.personal_rating ??
          null;

    /*
     * ==========================================
     * REVIEW
     * ==========================================
     */

    const review =
      body.review !== undefined
        ? body.review
        : existingLibraryItem
            ?.review ??
          null;

    /*
     * ==========================================
     * PROGRESSO INICIAL DA SÉRIE
     * ==========================================
     */

    let currentSeason =
      existingLibraryItem
        ?.current_season ??
      null;

    let completedSeasons =
      Number(
        existingLibraryItem
          ?.completed_seasons || 0
      );

    let stoppedSeason =
      existingLibraryItem
        ?.stopped_season ??
      null;

    /*
     * Se for uma série nova,
     * começa na temporada 1.
     */

    if (
      mediaType === "tv" &&
      !existingLibraryItem
    ) {
      currentSeason = 1;
      completedSeasons = 0;
      stoppedSeason = null;
    }

    /*
     * Filme não usa temporadas.
     */

    if (mediaType === "movie") {
      currentSeason = null;
      completedSeasons = 0;
      stoppedSeason = null;
    }

    if (mediaType === "tv" && isStartingRewatch) {
      await resetSeriesProgress({
        supabase: s,
        userId: user.id,
        mediaId: existingMedia.id,
      });
      completedSeasons = 0;
      currentSeason = 1;
      stoppedSeason = null;
    }

    /* Reassistido em série sempre representa a obra completa. */
    if (mediaType === "tv" && newStatus === "rewatched") {
      const totalSeasons = Number(existingMedia.seasons_count || 0);
      if (existingLibraryItem?.status === "rewatching") {
        await restoreSeriesProgress({ supabase: s, userId: user.id, mediaId: existingMedia.id });
      } else {
        await completeSeriesProgress({
          supabase: s,
          userId: user.id,
          mediaId: existingMedia.id,
          tmdbId: Number(existingMedia.tmdb_id),
          seasonsCount: totalSeasons,
        });
      }
      completedSeasons = totalSeasons;
      currentSeason = totalSeasons || 1;
      stoppedSeason = null;
    }

    /*
     * ==========================================
     * SALVAR NA BIBLIOTECA
     * ==========================================
     */

    const {
      data: item,
      error: itemError,
    } = await s
      .from("library_items")
      .upsert<LibraryItemUpsertData>(
        {
          user_id:
            user.id,

          media_id:
            existingMedia.id,

          status:
            newStatus,

          favorite:
            newFavorite,

          personal_rating:
            personalRating,

          review,

          rewatch_count:
            rewatchCount,

          current_season:
            currentSeason,

          completed_seasons:
            completedSeasons,

          stopped_season:
            stoppedSeason,
        },
        {
          onConflict:
            "user_id,media_id",
        }
      )
      .select(
        `
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
        updated_at,
        media:media_id(*)
        `
      )
      .single();

    if (
  itemError ||
  !item
) {
  if (itemError) {
    return respostaDeErro(
      itemError,
      "POST /api/library item",
    );
  }

  return NextResponse.json(
    {
      error:
        "Não foi possível salvar o título na biblioteca.",
    },
    {
      status: 500,
    },
  );
}

    /*
     * ==========================================
     * REGISTRAR NO DIÁRIO
     * ==========================================
     *
     * Só registra "adicionado"
     * se ainda não existia.
     */

    if (!existingLibraryItem) {
      const {
        error: activityError,
      } = await s
        .from(
          "activity_events"
        )
        .insert({
          user_id:
            user.id,

          media_id:
            existingMedia.id,

          library_item_id:
            item.id,

          event_type:
            "library_added",

          metadata: {
            status:
              newStatus,

            media_type:
              mediaType,

            title:
              mediaTitle,
          },
        });

      if (activityError) {
        console.error(
          "Erro ao registrar atividade:",
          activityError.message
        );
      }
    }

    /*
     * ==========================================
     * REGISTRAR REASSISTIDA
     * ==========================================
     */

    if (
      isStartingRewatch &&
      existingLibraryItem
    ) {
      const {
        error: rewatchActivityError,
      } = await s
        .from(
          "activity_events"
        )
        .insert({
          user_id:
            user.id,

          media_id:
            existingMedia.id,

          library_item_id:
            item.id,

          event_type:
            "rewatch_started",

          metadata: {
            rewatch_count:
              rewatchCount,

            title:
              mediaTitle,
          },
        });

      if (
        rewatchActivityError
      ) {
        console.error(
          "Erro ao registrar reassistida:",
          rewatchActivityError.message
        );
      }
    }

    /*
     * ==========================================
     * RETORNO
     * ==========================================
     */

    return NextResponse.json(
      item as unknown as LibraryItem
    );
  } catch (error) {
    console.error(
      "Erro ao atualizar biblioteca:",
      error
    );

    return respostaDeErro(
  error,
  "POST /api/library",
);
  }
}

/*
 * ==========================================
 * DELETE
 * ==========================================
 */

export async function DELETE(
  req: NextRequest
): Promise<
  NextResponse<
    SuccessResponse | ErrorResponse
  >
> {
  const s =
    await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Não autenticado",
      },
      {
        status: 401,
      }
    );
  }

  const url =
    new URL(req.url);

  const id =
    url.searchParams.get(
      "id"
    );

  if (!id) {
    return NextResponse.json(
      {
        error:
          "ID da biblioteca não informado.",
      },
      {
        status: 400,
      }
    );
  }

  /*
   * ==========================================
   * DELETAR
   * ==========================================
   */

  const {
    error,
  } = await s
    .from("library_items")
    .delete()
    .eq("id", id)
    .eq(
      "user_id",
      user.id
    );

  if (error) {
  return respostaDeErro(
    error,
    "DELETE /api/library",
  );
}

  return NextResponse.json({
    success: true,
  });
}
