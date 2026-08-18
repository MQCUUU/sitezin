import {
  NextRequest,
  NextResponse,
} from "next/server";

import { respostaDeErro } from "@/lib/api-error";

import {
  createClient,
} from "@/lib/supabase/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

type MediaType =
  | "movie"
  | "tv";

type Shelf = {
  id: string;
  title: string;
  subtitle?: string;
  icon:
    | "sparkles"
    | "star"
    | "film"
    | "tv"
    | "gem"
    | "trending"
    | "calendar";
  results: any[];
};

function numberParam(
  value: string | null,
  fallback: number
) {
  const n =
    Number(value);

  return Number.isFinite(
    n
  )
    ? n
    : fallback;
}

function libraryScore(
  item: any
) {
  return (
    Number(
      item.personal_rating ||
        0
    ) *
      2 +
    (
      item.favorite
        ? 5
        : 0
    ) +
    (
      item.status ===
        "rewatched" ||
      item.status ===
        "rewatching"
        ? 2
        : 0
    )
  );
}

function mediaGenres(
  media: any
) {
  if (
    !Array.isArray(
      media?.genres
    )
  ) {
    return [];
  }

  return media.genres
    .map(
      (
        genre: any
      ) =>
        typeof genre ===
        "string"
          ? genre
          : genre?.name
    )
    .filter(
      Boolean
    );
}

function releaseYear(
  item: any
) {
  return Number(
    (
      item.release_date ||
      item.first_air_date ||
      ""
    ).slice(
      0,
      4
    )
  );
}

export async function GET(
  req:
    NextRequest
) {
  const s =
    await createClient();

  const {
    data: {
      user,
    },
  } =
    await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Não autenticado",
      },
      {
        status:
          401,
      }
    );
  }

  const url =
    new URL(
      req.url
    );

  const page =
    Math.max(
      1,
      Math.floor(
        numberParam(
          url.searchParams.get(
            "page"
          ),
          1
        )
      )
    );

  const rawType =
    url.searchParams.get(
      "type"
    );

  const type:
    "all" |
    MediaType =
    rawType ===
      "movie" ||
    rawType ===
      "tv"
      ? rawType
      : "all";

  const genre =
    (
      url.searchParams.get(
        "genre"
      ) ||
      ""
    ).trim();

  const isTeenGenre =
    genre
      .trim()
      .toLowerCase() ===
    "teen";

  const provider =
    (
      url.searchParams.get(
        "provider"
      ) ||
      ""
    ).trim();

  const sort =
    (
      url.searchParams.get(
        "sort"
      ) ||
      "recommended"
    ).trim();

  const minRating =
    Math.max(
      0,
      Math.min(
        10,
        numberParam(
          url.searchParams.get(
            "min_rating"
          ),
          0
        )
      )
    );

  const year =
    Math.max(
      0,
      Math.floor(
        numberParam(
          url.searchParams.get(
            "year"
          ),
          0
        )
      )
    );

  const hideWatched =
    url.searchParams.get(
      "hide_watched"
    ) ===
    "1";

  const onlyNew =
    url.searchParams.get(
      "only_new"
    ) ===
    "1";

  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "TMDB_API_KEY não configurada",
      },
      {
        status:
          500,
      }
    );
  }

  const language =
    process.env.TMDB_LANGUAGE ||
    "pt-BR";

  /*
   * IMPORTANTE:
   * NÃO selecionamos vote_average da tabela media.
   * Essa coluna não existe no seu Supabase.
   */
  const {
    data:
      library,
    error,
  } =
    await s
      .from(
        "library_items"
      )
      .select(`
        id,
        status,
        favorite,
        personal_rating,
        media:media_id(
          tmdb_id,
          media_type,
          title,
          genres
        )
      `)
      .eq(
        "user_id",
        user.id
      );

  if (error) {
  return respostaDeErro(
    error,
    "GET /api/for-you",
  );
}

  const items =
    Array.isArray(
      library
    )
      ? library
      : [];

  const libraryMap =
    new Map<
      string,
      any
    >();

  const hiddenSet =
    new Set<
      string
    >();

  for (
    const item
    of items as any[]
  ) {
    if (
      !item.media
        ?.tmdb_id ||
      !item.media
        ?.media_type
    ) {
      continue;
    }

    libraryMap.set(
      `${item.media.media_type}-${item.media.tmdb_id}`,
      item
    );
  }

  const {
    data:
      hidden,
    error:
      hiddenError,
  } =
    await s
      .from(
        "user_hidden_titles"
      )
      .select(
        "tmdb_id, media_type"
      )
      .eq(
        "user_id",
        user.id
      );

  if (
    hiddenError
  ) {
    console.warn(
      "Não foi possível carregar títulos ocultos:",
      hiddenError.message
    );
  } else {
    for (
      const item
      of (
        hidden ||
        []
      ) as any[]
    ) {
      hiddenSet.add(
        `${item.media_type}-${item.tmdb_id}`
      );
    }
  }

  const seeds =
    items
      .filter(
        (
          item:
            any
        ) =>
          item.media
            ?.tmdb_id &&
          item.media
            ?.media_type &&
          (
            Number(
              item.personal_rating ||
                0
            ) >=
              7 ||
            item.favorite
          )
      )
      .sort(
        (
          a:
            any,
          b:
            any
        ) =>
          libraryScore(
            b
          ) -
          libraryScore(
            a
          )
      );

  /*
   * Caso o usuário ainda não tenha notas/favoritos,
   * usamos assistidos como semente de fallback.
   */
  const fallbackSeeds =
    items
      .filter(
        (
          item:
            any
        ) =>
          item.media
            ?.tmdb_id &&
          item.media
            ?.media_type &&
          [
            "watched",
            "rewatched",
          ].includes(
            item.status
          )
      )
      .slice(
        0,
        20
      );

  const allSeeds =
    seeds.length >
      0
      ? seeds
      : fallbackSeeds;

  const offset =
    (
      page -
      1
    ) *
    4;

  let activeSeeds =
    allSeeds.slice(
      offset,
      offset +
        4
    );

  if (
    activeSeeds.length ===
      0
  ) {
    activeSeeds =
      allSeeds.slice(
        0,
        4
      );
  }

  const genreWeights =
    new Map<
      string,
      number
    >();

  for (
    const seed
    of allSeeds
  ) {
    const weight =
      Math.max(
        1,
        libraryScore(
          seed
        )
      );

    for (
      const name
      of mediaGenres(
        seed.media
      )
    ) {
      genreWeights.set(
        name,
        (
          genreWeights.get(
            name
          ) ||
          0
        ) +
          weight
      );
    }
  }

  const favoriteGenres =
    Array.from(
      genreWeights.entries()
    )
      .sort(
        (
          a,
          b
        ) =>
          b[1] -
          a[1]
      )
      .map(
        (
          [
            name,
          ]
        ) =>
          name
      );

  async function tmdb(
    path:
      string,
    params:
      Record<
        string,
        string
      > = {}
  ) {
    const search =
      new URLSearchParams();

    search.set(
      "api_key",
      apiKey ?? ""
    );
    search.set(
      "language",
      language
    );

    Object.entries(
      params
    ).forEach(
      ([
        key,
        value,
      ]) => {
        if (
          value !==
            undefined
        ) {
          search.set(
            key,
            value
          );
        }
      }
    );

    const response =
      await fetch(
        `${TMDB_BASE}${path}?${search.toString()}`,
        {
          next: {
            revalidate:
              21600,
          },
        }
      );

    if (
      !response.ok
    ) {
      return null;
    }

    return response.json();
  }

  async function resolveTeenKeywords() {
    if (
      !isTeenGenre
    ) {
      return [];
    }

    const terms = [
      "teenager",
      "high school",
      "coming of age",
      "teenage romance",
    ];

    const groups =
      await Promise.all(
        terms.map(
          async (
            term
          ) => {
            const data =
              await tmdb(
                "/search/keyword",
                {
                  query:
                    term,
                }
              );

            return Array.isArray(
              data?.results
            )
              ? data.results
                  .slice(
                    0,
                    3
                  )
                  .map(
                    (
                      item:
                        any
                    ) =>
                      String(
                        item.id
                      )
                  )
              : [];
          }
        )
      );

    return Array.from(
      new Set(
        groups.flat()
      )
    );
  }

  const teenKeywordIds =
    await resolveTeenKeywords();

  const [
    movieGenresData,
    tvGenresData,
    providersData,
  ] =
    await Promise.all([
      tmdb(
        "/genre/movie/list"
      ),

      tmdb(
        "/genre/tv/list"
      ),

      tmdb(
        "/watch/providers/movie",
        {
          watch_region:
            "BR",
        }
      ),
    ]);

  const movieGenres =
    Array.isArray(
      movieGenresData?.genres
    )
      ? movieGenresData
          .genres
      : [];

  const tvGenres =
    Array.isArray(
      tvGenresData?.genres
    )
      ? tvGenresData
          .genres
      : [];

  function findGenreId(
    mediaType:
      MediaType,
    name:
      string
  ) {
    const source =
      mediaType ===
      "movie"
        ? movieGenres
        : tvGenres;

    return source.find(
      (
        item:
          any
      ) =>
        String(
          item.name
        ).toLowerCase() ===
        name.toLowerCase()
    )?.id;
  }

  const used =
    new Set<
      string
    >();

  function allowed(
    item:
      any,
    mediaType:
      MediaType
  ) {
    const key =
      `${mediaType}-${item.id}`;

    const libraryItem =
      libraryMap.get(
        key
      );

    if (
      hiddenSet.has(
        key
      )
    ) {
      return false;
    }

    if (
      type !==
        "all" &&
      type !==
        mediaType
    ) {
      return false;
    }

    if (
      minRating >
        0 &&
      Number(
        item.vote_average ||
          0
      ) <
        minRating
    ) {
      return false;
    }

    if (
      year >
        0 &&
      releaseYear(
        item
      ) !==
        year
    ) {
      return false;
    }

    if (
      hideWatched &&
      libraryItem &&
      [
        "watched",
        "rewatched",
      ].includes(
        libraryItem.status
      )
    ) {
      return false;
    }

    if (
      onlyNew &&
      libraryItem
    ) {
      return false;
    }

    if (
      genre &&
      !isTeenGenre
    ) {
      const genreId =
        findGenreId(
          mediaType,
          genre
        );

      if (
        genreId &&
        Array.isArray(
          item.genre_ids
        ) &&
        !item.genre_ids.includes(
          genreId
        )
      ) {
        return false;
      }
    }

    return true;
  }

  function order(
    list:
      any[]
  ) {
    const result =
      [
        ...list,
      ];

    if (
      sort ===
      "rating"
    ) {
      result.sort(
        (
          a,
          b
        ) =>
          Number(
            b.vote_average ||
              0
          ) -
          Number(
            a.vote_average ||
              0
          )
      );
    } else if (
      sort ===
      "popular"
    ) {
      result.sort(
        (
          a,
          b
        ) =>
          Number(
            b.popularity ||
              0
          ) -
          Number(
            a.popularity ||
              0
          )
      );
    } else if (
      sort ===
      "newest"
    ) {
      result.sort(
        (
          a,
          b
        ) =>
          releaseYear(
            b
          ) -
          releaseYear(
            a
          )
      );
    } else if (
      sort ===
      "hidden"
    ) {
      result.sort(
        (
          a,
          b
        ) =>
          Number(
            a.popularity ||
              0
          ) -
          Number(
            b.popularity ||
              0
          )
      );
    }

    return result;
  }

  function finish(
    list:
      any[],
    mediaType:
      MediaType,
    reason:
      string,
    limit =
      10
  ) {
    const results:
      any[] =
      [];

    for (
      const item
      of order(
        list
      )
    ) {
      const key =
        `${mediaType}-${item.id}`;

      if (
        used.has(
          key
        ) ||
        !allowed(
          item,
          mediaType
        )
      ) {
        continue;
      }

      const libraryItem =
        libraryMap.get(
          key
        );

      results.push({
        ...item,

        media_type:
          mediaType,

        in_library:
          Boolean(
            libraryItem
          ),

        status:
          libraryItem?.status ||
          null,

        favorite:
          Boolean(
            libraryItem
              ?.favorite
          ),

        reason:
          item.reason ||
          reason,
      });

      used.add(
        key
      );

      if (
        results.length >=
        limit
      ) {
        break;
      }
    }

    return results;
  }

  async function makeBecauseShelf(
    seed:
      any,
    index:
      number
  ): Promise<
    Shelf |
    null
  > {
    const media =
      seed.media;

    if (
      type !==
        "all" &&
      type !==
        media.media_type
    ) {
      return null;
    }

    const data =
      await tmdb(
        `/${media.media_type}/${media.tmdb_id}/recommendations`,
        {
          page:
            String(
              Math.min(
                page,
                500
              )
            ),
        }
      );

    const results =
      finish(
        Array.isArray(
          data?.results
        )
          ? data.results
          : [],
        media.media_type,
        `Porque você gostou de ${media.title}`,
        10
      );

    if (
      results.length ===
      0
    ) {
      return null;
    }

    return {
      id:
        `because-${media.media_type}-${media.tmdb_id}-${page}-${index}`,

      title:
        `Porque você gostou de ${media.title}`,

      subtitle:
        seed.favorite
          ? "Um dos seus curtidos inspirou esta seleção."
          : Number(
              seed.personal_rating ||
                0
            ) >=
              8
            ? `Você deu nota ${Number(
                seed.personal_rating
              ).toFixed(
                1
              )} para este título.`
            : "Baseado no que você já assistiu.",

      icon:
        "sparkles",

      results,
    };
  }

  async function makeDiscoverShelf({
    id,
    title,
    subtitle,
    icon,
    mediaType,
    params,
    reason,
  }: {
    id:
      string;
    title:
      string;
    subtitle:
      string;
    icon:
      Shelf["icon"];
    mediaType:
      MediaType;
    params:
      Record<
        string,
        string
      >;
    reason:
      string;
  }): Promise<
    Shelf |
    null
  > {
    if (
      type !==
        "all" &&
      type !==
        mediaType
    ) {
      return null;
    }

    const finalParams:
      Record<
        string,
        string
      > = {
        include_adult:
          "false",
        page:
          String(
            Math.min(
              page,
              500
            )
          ),
        ...params,
      };

    if (
      provider
    ) {
      finalParams.watch_region =
        "BR";

      finalParams.with_watch_providers =
        provider;
    }

    if (
      genre &&
      !isTeenGenre
    ) {
      const id =
        findGenreId(
          mediaType,
          genre
        );

      if (id) {
        finalParams.with_genres =
          String(id);
      }
    }

    if (
      isTeenGenre &&
      teenKeywordIds.length >
        0
    ) {
      finalParams.with_keywords =
        teenKeywordIds.join(
          "|"
        );
    }

    const data =
      await tmdb(
        `/discover/${mediaType}`,
        finalParams
      );

    const results =
      finish(
        Array.isArray(
          data?.results
        )
          ? data.results
          : [],
        mediaType,
        reason,
        10
      );

    if (
      results.length ===
      0
    ) {
      return null;
    }

    return {
      id:
        `${id}-${page}`,
      title,
      subtitle,
      icon,
      results,
    };
  }

  const shelves:
    Shelf[] =
    [];

  const because =
    isTeenGenre
      ? []
      : await Promise.all(
          activeSeeds.map(
            makeBecauseShelf
          )
        );

  for (
    const shelf
    of because
  ) {
    if (shelf) {
      shelves.push(
        shelf
      );
    }
  }

  const profileGenre =
    (
      isTeenGenre
        ? ""
        : genre
    ) ||
    favoriteGenres[
      (
        page -
        1
      ) %
        Math.max(
          favoriteGenres.length,
          1
        )
    ] ||
    "";

  if (
    profileGenre
  ) {
    const movieGenreId =
      findGenreId(
        "movie",
        profileGenre
      );

    if (
      movieGenreId
    ) {
      const shelf =
        await makeDiscoverShelf({
          id:
            "profile-genre-movie",

          title:
            `${profileGenre} para você`,

          subtitle:
            "Um gênero que aparece bastante entre as coisas que você mais gosta.",

          icon:
            "film",

          mediaType:
            "movie",

          params: {
            sort_by:
              "popularity.desc",

            with_genres:
              String(
                movieGenreId
              ),

            "vote_count.gte":
              "100",
          },

          reason:
            `Combina com seu gosto por ${profileGenre}.`,
        });

      if (shelf) {
        shelves.push(
          shelf
        );
      }
    }
  }

  const highRated =
    await makeDiscoverShelf({
      id:
        "high-rated",

      title:
        "Bem avaliados que você ainda não viu",

      subtitle:
        "Títulos com notas fortes e bastante avaliações.",

      icon:
        "star",

      mediaType:
        page %
          2 ===
          0
          ? "tv"
          : "movie",

      params: {
        sort_by:
          "vote_average.desc",

        "vote_count.gte":
          page %
            2 ===
            0
            ? "250"
            : "800",

        "vote_average.gte":
          String(
            Math.max(
              7,
              minRating
            )
          ),
      },

      reason:
        "Muito bem avaliado e ainda fora da sua biblioteca.",
    });

  if (
    highRated
  ) {
    shelves.push(
      highRated
    );
  }

  const gems =
    await makeDiscoverShelf({
      id:
        "gems",

      title:
        "Joias escondidas no seu estilo",

      subtitle:
        "Boas opções que não dependem só dos títulos mais populares.",

      icon:
        "gem",

      mediaType:
        page %
          2 ===
          0
          ? "movie"
          : "tv",

      params: {
        sort_by:
          "vote_average.desc",

        "vote_count.gte":
          "80",

        "vote_count.lte":
          "2500",

        "vote_average.gte":
          "7",
      },

      reason:
        "Uma escolha menos óbvia que pode combinar com você.",
    });

  if (
    gems
  ) {
    shelves.push(
      gems
    );
  }

  const popular =
    await makeDiscoverShelf({
      id:
        "popular",

      title:
        page %
          2 ===
          0
          ? "Séries populares para você"
          : "Filmes populares para você",

      subtitle:
        "Títulos fortes no catálogo que ainda podem entrar na sua lista.",

      icon:
        "trending",

      mediaType:
        page %
          2 ===
          0
          ? "tv"
          : "movie",

      params: {
        sort_by:
          "popularity.desc",

        "vote_count.gte":
          "150",
      },

      reason:
        "Popular e compatível com seus filtros.",
    });

  if (
    popular
  ) {
    shelves.push(
      popular
    );
  }

  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10
      );

  const recentType:
    MediaType =
    page %
      2 ===
      0
      ? "tv"
      : "movie";

  const recent =
    await makeDiscoverShelf({
      id:
        "recent",

      title:
        recentType ===
        "movie"
          ? "Lançamentos para você"
          : "Séries recentes para descobrir",

      subtitle:
        "Coisas novas sem abandonar o seu perfil.",

      icon:
        "calendar",

      mediaType:
        recentType,

      params: {
        sort_by:
          recentType ===
          "movie"
            ? "primary_release_date.desc"
            : "first_air_date.desc",

        ...(recentType ===
        "movie"
          ? {
              "primary_release_date.gte":
                `${new Date().getUTCFullYear() - 1}-01-01`,

              "primary_release_date.lte":
                today,
            }
          : {
              "first_air_date.gte":
                `${new Date().getUTCFullYear() - 1}-01-01`,

              "first_air_date.lte":
                today,
            }),

        "vote_count.gte":
          "20",
      },

      reason:
        "Lançamento recente que pode combinar com você.",
    });

  if (
    recent
  ) {
    shelves.push(
      recent
    );
  }

  const providers =
    Array.isArray(
      providersData?.results
    )
      ? providersData
          .results
          .filter(
            (
              item:
                any
            ) =>
              item.provider_id &&
              item.provider_name
          )
          .slice(
            0,
            80
          )
          .map(
            (
              item:
                any
            ) => ({
              id:
                String(
                  item.provider_id
                ),

              name:
                item.provider_name,
            })
          )
      : [];

  const genres =
    Array.from(
      new Set([
        "Teen",

        ...movieGenres.map(
          (
            item:
              any
          ) =>
            item.name
        ),

        ...tvGenres.map(
          (
            item:
              any
          ) =>
            item.name
        ),
      ])
    ).sort(
      (
        a:
          any,
        b:
          any
      ) =>
        String(a)
          .localeCompare(
            String(b),
            "pt-BR"
          )
    );

  return NextResponse.json({
    page,

    has_more:
      page <
      20,

    based_on:
      allSeeds
        .slice(
          0,
          6
        )
        .map(
          (
            seed:
              any
          ) =>
            seed.media.title
        ),

    profile: {
      favorite_genres:
        favoriteGenres.slice(
          0,
          6
        ),

      seed_count:
        allSeeds.length,
    },

    filters: {
      genres,
      providers,
    },

    shelves:
      shelves.filter(
        (
          shelf
        ) =>
          shelf.results.length >
          0
      ),
  });
}
