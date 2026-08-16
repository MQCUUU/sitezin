import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  cachedClientFetch,
} from "@/lib/client-request";

import { respostaDeErro } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

const ITEMS_PER_PAGE =
  27;

const TMDB_ITEMS_PER_PAGE =
  20;

type DiscoverType =
  | "movie"
  | "tv";

type DiscoverSort =
  | "popular"
  | "rating"
  | "newest";

function getSortBy(
  type: DiscoverType,
  sort: DiscoverSort
) {
  if (
    sort === "rating"
  ) {
    return "vote_average.desc";
  }

  if (
    sort === "newest"
  ) {
    return type === "movie"
      ? "primary_release_date.desc"
      : "first_air_date.desc";
  }

  return "popularity.desc";
}

function buildTmdbParams({
  apiKey,
  language,
  page,
  type,
  sort,
  genre,
  year,
  rating,
  country,
  provider,
}: {
  apiKey: string;
  language: string;
  page: number;
  type: DiscoverType;
  sort: DiscoverSort;
  genre: string;
  year: string;
  rating: string;
  country: string;
  provider: string;
}) {
  const params =
    new URLSearchParams({
      api_key:
        apiKey,

      language,

      page:
        String(page),

      include_adult:
        "false",

      sort_by:
        getSortBy(
          type,
          sort
        ),
    });

  if (genre) {
    params.set(
      "with_genres",
      genre
    );
  }

  if (
    rating &&
    Number.isFinite(
      Number(rating)
    )
  ) {
    params.set(
      "vote_average.gte",
      rating
    );

    /*
     * Evita notas muito altas
     * com pouquíssimos votos.
     */
    params.set(
      "vote_count.gte",
      "30"
    );
  } else if (
    sort === "rating"
  ) {
    params.set(
      "vote_count.gte",
      "200"
    );
  }

  if (
    year &&
    /^\d{4}$/.test(
      year
    )
  ) {
    params.set(
      type === "movie"
        ? "primary_release_year"
        : "first_air_date_year",
      year
    );
  }

  if (
    country &&
    /^[A-Z]{2}$/.test(
      country
    )
  ) {
    params.set(
      "with_origin_country",
      country
    );
  }

  if (
    provider &&
    /^\d+$/.test(
      provider
    )
  ) {
    params.set(
      "with_watch_providers",
      provider
    );

    params.set(
      "watch_region",
      "BR"
    );

    /*
     * Streaming por assinatura / gratuito
     * / com anúncios.
     */
    params.set(
      "with_watch_monetization_types",
      "flatrate|free|ads"
    );
  }

  if (
    type === "tv"
  ) {
    params.set(
      "include_null_first_air_dates",
      "false"
    );
  }

  return params;
}

async function fetchTmdbPage({
  apiKey,
  language,
  page,
  type,
  sort,
  genre,
  year,
  rating,
  country,
  provider,
}: {
  apiKey: string;
  language: string;
  page: number;
  type: DiscoverType;
  sort: DiscoverSort;
  genre: string;
  year: string;
  rating: string;
  country: string;
  provider: string;
}) {
  const params =
    buildTmdbParams({
      apiKey,
      language,
      page,
      type,
      sort,
      genre,
      year,
      rating,
      country,
      provider,
    });

  const response =
    await fetch(
      `${TMDB_BASE}/discover/${type}?${params.toString()}`,
      {
        headers: {
          accept:
            "application/json",
        },

        next: {
          revalidate:
            21600,
        },
      }
    );

  const data =
    await response.json();

  if (
    !response.ok
  ) {
    throw new Error(
      data?.status_message ||
        "Erro ao consultar TMDB."
    );
  }

  return data;
}

export async function GET(
  req: NextRequest
) {
  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "TMDB_API_KEY não configurada",
      },
      {
        status: 500,
      }
    );
  }

  const url =
    new URL(req.url);

  const rawType =
    url.searchParams.get(
      "type"
    );

  const rawSort =
    url.searchParams.get(
      "sort"
    );

  const type:
    DiscoverType =
    rawType === "tv"
      ? "tv"
      : "movie";

  const sort:
    DiscoverSort =
    rawSort === "rating" ||
    rawSort === "newest"
      ? rawSort
      : "popular";

  const requestedPage =
    Number(
      url.searchParams.get(
        "page"
      ) || 1
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

  const genre =
    (
      url.searchParams.get(
        "genre"
      ) || ""
    ).trim();

  const year =
    (
      url.searchParams.get(
        "year"
      ) || ""
    ).trim();

  const rating =
    (
      url.searchParams.get(
        "rating"
      ) || ""
    ).trim();

  const country =
    (
      url.searchParams.get(
        "country"
      ) || ""
    )
      .trim()
      .toUpperCase();

  const provider =
    (
      url.searchParams.get(
        "provider"
      ) || ""
    ).trim();

  const hideWatched =
    url.searchParams.get(
      "hide_watched"
    ) === "1";

  const onlyNew =
    url.searchParams.get(
      "only_new"
    ) === "1";

  const language =
    process.env.TMDB_LANGUAGE ||
    "pt-BR";

  try {
    const globalStartIndex =
      (page - 1) *
      ITEMS_PER_PAGE;

    const firstTmdbPage =
      Math.floor(
        globalStartIndex /
          TMDB_ITEMS_PER_PAGE
      ) + 1;

    const startIndexInsideFirstPage =
      globalStartIndex %
      TMDB_ITEMS_PER_PAGE;

    const requiredItems =
      startIndexInsideFirstPage +
      ITEMS_PER_PAGE;

    const tmdbPagesNeeded =
      Math.ceil(
        requiredItems /
          TMDB_ITEMS_PER_PAGE
      );

    const baseArgs = {
      apiKey,
      language,
      type,
      sort,
      genre,
      year,
      rating,
      country,
      provider,
    };

    const firstData =
      await fetchTmdbPage({
        ...baseArgs,

        page:
          firstTmdbPage,
      });

    const totalResults =
      Number(
        firstData
          ?.total_results ||
          0
      );

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          totalResults /
            ITEMS_PER_PAGE
        )
      );

    if (
      page >
      totalPages
    ) {
      return NextResponse.json(
        {
          page,
          total_pages:
            totalPages,
          total_results:
            totalResults,
          results:
            [],
          per_page:
            ITEMS_PER_PAGE,
        }
      );
    }

    const tmdbPages:
      any[] =
      [firstData];

    if (
      tmdbPagesNeeded >
      1
    ) {
      const extraPageNumbers =
        Array.from(
          {
            length:
              tmdbPagesNeeded -
              1,
          },
          (
            _,
            index
          ) =>
            firstTmdbPage +
            index +
            1
        );

      const extraPages =
        await Promise.all(
          extraPageNumbers.map(
            (
              tmdbPage
            ) =>
              fetchTmdbPage({
                ...baseArgs,

                page:
                  tmdbPage,
              })
          )
        );

      tmdbPages.push(
        ...extraPages
      );
    }

    const combinedResults =
      tmdbPages.flatMap(
        (
          tmdbPage
        ) =>
          Array.isArray(
            tmdbPage
              ?.results
          )
            ? tmdbPage.results
            : []
      );

    const pageResults =
      combinedResults.slice(
        startIndexInsideFirstPage,
        startIndexInsideFirstPage +
          ITEMS_PER_PAGE
      );

    /*
     * ==========================================
     * BIBLIOTECA — SOMENTE IDS VISÍVEIS
     * ==========================================
     */

    const s =
      await createClient();

    const {
      data: { user },
    } =
      await s.auth.getUser();

    const libraryMap =
      new Map<
        string,
        {
          library_id:
            string;
          favorite:
            boolean;
          status:
            string;
          personal_rating:
            number | null;
        }
      >();

    if (
      user &&
      pageResults.length >
        0
    ) {
      const tmdbIds =
        pageResults
          .map(
            (
              item: any
            ) =>
              Number(
                item.id
              )
          )
          .filter(
            (
              id: number
            ) =>
              Number.isFinite(
                id
              )
          );

      if (
        tmdbIds.length >
        0
      ) {
        const {
          data: mediaRows,
          error:
            mediaError,
        } =
          await s
            .from(
              "media"
            )
            .select(
              "id, tmdb_id, media_type"
            )
            .eq(
              "media_type",
              type
            )
            .in(
              "tmdb_id",
              tmdbIds
            );

        if (
          mediaError
        ) {
          console.error(
            "Erro ao consultar mídias da descoberta:",
            mediaError.message
          );
        }

        const mediaById =
          new Map<
            string,
            {
              tmdb_id:
                number;
              media_type:
                string;
            }
          >();

        const mediaIds:
          string[] =
          [];

        for (
          const media
          of (mediaRows ||
            []) as any[]
        ) {
          mediaById.set(
            String(
              media.id
            ),
            {
              tmdb_id:
                Number(
                  media.tmdb_id
                ),

              media_type:
                media.media_type,
            }
          );

          mediaIds.push(
            String(
              media.id
            )
          );
        }

        if (
          mediaIds.length >
          0
        ) {
          const {
            data:
              libraryRows,
            error:
              libraryError,
          } =
            await s
              .from(
                "library_items"
              )
              .select(
                "id, media_id, favorite, status, personal_rating"
              )
              .eq(
                "user_id",
                user.id
              )
              .in(
                "media_id",
                mediaIds
              );

          if (
            libraryError
          ) {
            console.error(
              "Erro ao consultar biblioteca na descoberta:",
              libraryError.message
            );
          }

          for (
            const item
            of (libraryRows ||
              []) as any[]
          ) {
            const media =
              mediaById.get(
                String(
                  item.media_id
                )
              );

            if (
              !media
            ) {
              continue;
            }

            libraryMap.set(
              `${media.media_type}-${media.tmdb_id}`,
              {
                library_id:
                  String(
                    item.id
                  ),

                favorite:
                  Boolean(
                    item.favorite
                  ),

                status:
                  String(
                    item.status ||
                      ""
                  ),

                personal_rating:
                  item.personal_rating ===
                    null ||
                  item.personal_rating ===
                    undefined
                    ? null
                    : Number(
                        item.personal_rating
                      ),
              }
            );
          }
        }
      }
    }

    let results =
      pageResults.map(
        (
          item: any
        ) => {
          const state =
            libraryMap.get(
              `${type}-${item.id}`
            );

          return {
            ...item,

            media_type:
              type,

            in_library:
              !!state,

            library_id:
              state?.library_id ??
              null,

            favorite:
              state?.favorite ??
              false,

            library_status:
              state?.status ??
              null,

            personal_rating:
              state?.personal_rating ??
              null,
          };
        }
      );

    /*
     * ==========================================
     * FILTROS PESSOAIS
     * ==========================================
     *
     * Esses filtros só podem ser aplicados
     * depois que sabemos o estado da biblioteca.
     */

    if (
      hideWatched
    ) {
      results =
        results.filter(
          (
            item: any
          ) =>
            item.library_status !==
              "watched" &&
            item.library_status !==
              "rewatched"
        );
    }

    if (
      onlyNew
    ) {
      results =
        results.filter(
          (
            item: any
          ) =>
            !item.in_library
        );
    }

    return NextResponse.json(
      {
        page,

        total_pages:
          totalPages,

        total_results:
          totalResults,

        results,

        per_page:
          ITEMS_PER_PAGE,

        personal_filters:
          hideWatched ||
          onlyNew,
      },
      {
        headers: {
  "Cache-Control":
    "private, no-store, max-age=0",
},
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Erro em /api/discover:",
      error
    );

    return respostaDeErro(
  error,
  "GET /api/discover",
  502,
);
  }
}