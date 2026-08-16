import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

type MediaType =
  | "movie"
  | "tv";

type PickMode =
  | "safe"
  | "popular"
  | "discover"
  | "gems";

function num(
  value:
    string |
    null,
  fallback:
    number
) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;
}

function randomBetween(
  min:
    number,
  max:
    number
) {
  return (
    Math.floor(
      Math.random() *
        (
          max -
          min +
          1
        )
    ) +
    min
  );
}

function weightedPick(
  items:
    any[]
) {
  if (
    items.length ===
    0
  ) {
    return null;
  }

  const total =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Math.max(
          .01,
          Number(
            item._weight ||
              0
          )
        ),
      0
    );

  let roll =
    Math.random() *
    total;

  for (
    const item
    of items
  ) {
    roll -=
      Math.max(
        .01,
        Number(
          item._weight ||
            0
        )
      );

    if (
      roll <=
      0
    ) {
      return item;
    }
  }

  return items[
    items.length -
    1
  ];
}

function confidenceScore(
  item:
    any,
  mode:
    PickMode
) {
  const rating =
    Number(
      item.vote_average ||
        0
    );

  const votes =
    Number(
      item.vote_count ||
        0
    );

  const popularity =
    Number(
      item.popularity ||
        0
    );

  /*
   * Confiança estatística:
   * uma nota 9 com 20 votos não supera
   * automaticamente um 8.2 com 80 mil.
   */
  const voteConfidence =
    Math.min(
      1,
      Math.log10(
        votes +
        1
      ) /
        4
    );

  const trustedRating =
    rating *
      (
        .58 +
        voteConfidence *
          .42
      );

  const popularityScore =
    Math.min(
      10,
      Math.log10(
        popularity +
        1
      ) *
        2.3
    );

  let score =
    trustedRating *
      8 +
    Math.log10(
      votes +
      1
    ) *
      7 +
    popularityScore *
      2;

  if (
    mode ===
    "safe"
  ) {
    score +=
      Math.min(
        18,
        Math.log10(
          votes +
          1
        ) *
          5
      );
  }

  if (
    mode ===
    "popular"
  ) {
    score +=
      popularityScore *
      4;
  }

  if (
    mode ===
    "discover"
  ) {
    /*
     * Premia coisas medianamente conhecidas:
     * não obscuras demais, mas também não só
     * blockbusters.
     */
    if (
      votes >=
        150 &&
      votes <=
        12000
    ) {
      score +=
        10;
    }

    if (
      popularity >=
        10 &&
      popularity <=
        180
    ) {
      score +=
        7;
    }
  }

  if (
    mode ===
    "gems"
  ) {
    if (
      votes >=
        120 &&
      votes <=
        6000 &&
      rating >=
        7
    ) {
      score +=
        18;
    }

    /*
     * Evita que o modo joias escondidas vire
     * "mais populares de novo".
     */
    score -=
      Math.max(
        0,
        popularity -
          150
      ) *
        .025;
  }

  return score;
}

function qualityThresholds(
  mode:
    PickMode
) {
  if (
    mode ===
    "safe"
  ) {
    return {
      minRating:
        6.8,
      minVotesMovie:
        700,
      minVotesTv:
        250,
    };
  }

  if (
    mode ===
    "popular"
  ) {
    return {
      minRating:
        6.3,
      minVotesMovie:
        500,
      minVotesTv:
        180,
    };
  }

  if (
    mode ===
    "gems"
  ) {
    return {
      minRating:
        6.9,
      minVotesMovie:
        100,
      minVotesTv:
        60,
    };
  }

  return {
    minRating:
      6.5,
    minVotesMovie:
      180,
    minVotesTv:
      80,
  };
}

export async function GET(
  req:
    NextRequest
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
        status:
          500,
      }
    );
  }

  const s =
    await createClient();

  const {
    data: {
      user,
    },
  } =
    await s.auth.getUser();

  const url =
    new URL(
      req.url
    );

  const rawType =
    url.searchParams.get(
      "type"
    );

  const type:
    "any" |
    MediaType =
    rawType ===
      "movie" ||
    rawType ===
      "tv"
      ? rawType
      : "any";

  const rawMode =
    url.searchParams.get(
      "mode"
    );

  const mode:
    PickMode =
    rawMode ===
      "popular" ||
    rawMode ===
      "discover" ||
    rawMode ===
      "gems"
      ? rawMode
      : "safe";

  const genreMovie =
    (
      url.searchParams.get(
        "genre_movie"
      ) ||
      url.searchParams.get(
        "genre"
      ) ||
      ""
    )
      .split(
        ","
      )
      .map(
        (
          value
        ) =>
          value.trim()
      )
      .filter(
        Boolean
      );

  const genreTv =
    (
      url.searchParams.get(
        "genre_tv"
      ) ||
      url.searchParams.get(
        "genre"
      ) ||
      ""
    )
      .split(
        ","
      )
      .map(
        (
          value
        ) =>
          value.trim()
      )
      .filter(
        Boolean
      );

  const uniqueGenreMovie =
    Array.from(
      new Set(
        genreMovie
      )
    );

  const uniqueGenreTv =
    Array.from(
      new Set(
        genreTv
      )
    );

  const smartGenres =
    new Set(
      (
        url.searchParams.get(
          "smart_genres"
        ) ||
        ""
      )
        .split(
          ","
        )
        .map(
          (
            value
          ) =>
            value.trim()
        )
        .filter(
          Boolean
        )
    );

/*
   * Como combinar os gêneros selecionados:
   *   "all" -> vírgula -> o título precisa ter TODOS
   *   "any" -> barra   -> basta ter UM deles
   *
   * Ambos são sintaxe nativa do Discover do TMDB.
   * Default "all" para não mudar o comportamento de quem já usa.
   */
  const genreMatch =
    url.searchParams.get("genre_match") === "any" ? "any" : "all";

  const genreSeparator = genreMatch === "any" ? "|" : ",";

  const providers =
    (
      url.searchParams.get(
        "providers"
      ) ||
      url.searchParams.get(
        "provider"
      ) ||
      ""
    )
      .split(
        ","
      )
      .map(
        (
          value
        ) =>
          value.trim()
      )
      .filter(
        Boolean
      );

  const country =
    (
      url.searchParams.get(
        "country"
      ) ||
      ""
    )
      .trim()
      .toUpperCase();

  const decade =
    (
      url.searchParams.get(
        "decade"
      ) ||
      ""
    ).trim();

  const decadeStart =
    /^\d{4}$/.test(
      decade
    )
      ? Number(
          decade
        )
      : 0;

  const decadeEnd =
    decadeStart
      ? decadeStart +
        9
      : 0;

  const duration =
    (
      url.searchParams.get(
        "duration"
      ) ||
      "any"
    ).trim();

  const customRating =
    Math.max(
      0,
      Math.min(
        10,
        num(
          url.searchParams.get(
            "min_rating"
          ),
          0
        )
      )
    );

  const excludeLibrary =
    url.searchParams.get(
      "exclude_library"
    ) ===
    "1";

  const excludeWatched =
    url.searchParams.get(
      "exclude_watched"
    ) !==
    "0";

  const surprise =
    url.searchParams.get(
      "surprise"
    ) ===
    "1";

  const excludedFromSession =
    new Set(
      (
        url.searchParams.get(
          "exclude"
        ) ||
        ""
      )
        .split(
          ","
        )
        .map(
          (
            value
          ) =>
            value.trim()
        )
        .filter(
          Boolean
        )
    );

  const language =
    process.env.TMDB_LANGUAGE ||
    "pt-BR";

  const libraryMap =
    new Map<
      string,
      any
    >();

  const hiddenSet =
    new Set<
      string
    >();

  if (
    user
  ) {
    const {
      data:
        library,
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
            media_type
          )
        `)
        .eq(
          "user_id",
          user.id
        );

    for (
      const item
      of (
        library ||
        []
      ) as any[]
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
  }

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
      new URLSearchParams({
        api_key:
          apiKey || "",
        language,
        ...params,
      });

    const response =
      await fetch(
        `${TMDB_BASE}${path}?${search.toString()}`,
        {
          next: {
            revalidate:
              7200,
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
      !smartGenres.has(
        "teen"
      )
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

  const thresholds =
    qualityThresholds(
      mode
    );

  const types:
    MediaType[] =
    type ===
    "any"
      ? [
          "movie",
          "tv",
        ]
      : [
          type,
        ];

  /*
   * Para surpresa, ignoramos filtros estéticos,
   * mas NÃO ignoramos o filtro de qualidade.
   */
  const effectiveGenreMovie =
    surprise
      ? []
      : uniqueGenreMovie;

  const effectiveGenreTv =
    surprise
      ? []
      : uniqueGenreTv;

  const effectiveProviders =
    surprise
      ? []
      : providers;

  const effectiveTeenKeywords =
    surprise
      ? []
      : teenKeywordIds;

  const effectiveCountry =
    surprise
      ? ""
      : country;

  const effectiveDecadeStart =
    surprise
      ? 0
      : decadeStart;

  const effectiveDecadeEnd =
    surprise
      ? 0
      : decadeEnd;

  const effectiveDuration =
    surprise
      ? "any"
      : duration;

  const hasStandardGenreFilter =
    !surprise &&
    (
      uniqueGenreMovie.length >
        0 ||
      uniqueGenreTv.length >
        0
    );

  const candidates:
    any[] =
    [];

  /*
   * Misturamos páginas iniciais com algumas
   * páginas aleatórias. Isso mantém qualidade
   * e evita sempre os mesmos 20 resultados.
   */
  const pagePool =
    Array.from(
      new Set([
        1,
        2,
        3,
        randomBetween(
          1,
          8
        ),
        randomBetween(
          3,
          mode ===
          "gems"
            ? 25
            : 14
        ),
      ])
    );

  await Promise.all(
    types.flatMap(
      (
        mediaType
      ) =>
        pagePool.map(
          async (
            page
          ) => {
            const minimumVotes =
              mediaType ===
              "movie"
                ? thresholds
                    .minVotesMovie
                : thresholds
                    .minVotesTv;

            const effectiveGenre =
              mediaType ===
                "movie"
                ? effectiveGenreMovie
                : effectiveGenreTv;

            /*
             * Se o usuário escolheu gênero e esse tipo
             * de mídia não possui um mapeamento válido,
             * NÃO fazemos uma busca sem filtro.
             *
             * Era exatamente isso que permitia The Office
             * aparecer ao escolher Fantasia/Ficção científica.
             */
            if (
              hasStandardGenreFilter &&
              effectiveGenre.length ===
                0
            ) {
              return;
            }

            const params:
              Record<
                string,
                string
              > = {
                include_adult:
                  "false",

                page:
                  String(
                    page
                  ),

                sort_by:
                  mode ===
                  "gems"
                    ? "vote_average.desc"
                    : mode ===
                        "popular"
                      ? "popularity.desc"
                      : "popularity.desc",

                "vote_count.gte":
                  String(
                    minimumVotes
                  ),

                "vote_average.gte":
                  String(
                    Math.max(
                      thresholds
                        .minRating,
                      customRating
                    )
                  ),
              };

            if (
              effectiveGenre.length >
              0
            ) {
              /*
               * Vírgula = AND no Discover do TMDB.
               *
               * Se o usuário selecionar Fantasia + Drama,
               * o resultado precisa pertencer aos dois.
               * Para TV, Fantasia e Ficção científica podem
               * apontar para o mesmo gênero combinado; o Set
               * acima remove IDs duplicados antes daqui.
               */
              params.with_genres =
                effectiveGenre.join(
                  genreSeparator
                );
            }

            if (
              effectiveTeenKeywords.length >
              0
            ) {
              params.with_keywords =
                effectiveTeenKeywords.join(
                  "|"
                );
            }

            if (
              effectiveProviders.length >
              0
            ) {
              params.watch_region =
                "BR";

              /*
               * Qualquer um dos streamings escolhidos.
               */
              params.with_watch_providers =
                effectiveProviders.join(
                  "|"
                );
            }

            if (
              effectiveCountry
            ) {
              params.with_origin_country =
                effectiveCountry;
            }

            if (
              effectiveDecadeStart &&
              effectiveDecadeEnd
            ) {
              params[
                mediaType ===
                  "movie"
                  ? "primary_release_date.gte"
                  : "first_air_date.gte"
              ] =
                `${effectiveDecadeStart}-01-01`;

              params[
                mediaType ===
                  "movie"
                  ? "primary_release_date.lte"
                  : "first_air_date.lte"
              ] =
                `${effectiveDecadeEnd}-12-31`;
            }

            /*
             * Duração:
             * movie => runtime total.
             * tv => runtime média de episódio no Discover.
             */
            if (
              effectiveDuration ===
              "short"
            ) {
              params[
                "with_runtime.lte"
              ] =
                mediaType ===
                "movie"
                  ? "100"
                  : "35";
            }

            if (
              effectiveDuration ===
              "medium"
            ) {
              params[
                "with_runtime.gte"
              ] =
                mediaType ===
                "movie"
                  ? "90"
                  : "30";

              params[
                "with_runtime.lte"
              ] =
                mediaType ===
                "movie"
                  ? "140"
                  : "65";
            }

            if (
              effectiveDuration ===
              "long"
            ) {
              params[
                "with_runtime.gte"
              ] =
                mediaType ===
                "movie"
                  ? "135"
                  : "55";
            }

            const data =
              await tmdb(
                `/discover/${mediaType}`,
                params
              );

            for (
              const item
              of (
                Array.isArray(
                  data?.results
                )
                  ? data.results
                  : []
              )
            ) {
              const key =
                `${mediaType}-${item.id}`;

              if (
                excludedFromSession.has(
                  key
                ) ||
                hiddenSet.has(
                  key
                ) ||
                !item.poster_path ||
                Number(
                  item.vote_average ||
                    0
                ) <=
                  0
              ) {
                continue;
              }

              const libraryItem =
                libraryMap.get(
                  key
                );

              if (
                excludeLibrary &&
                libraryItem
              ) {
                continue;
              }

              if (
                excludeWatched &&
                libraryItem &&
                [
                  "watched",
                  "rewatched",
                ].includes(
                  libraryItem.status
                )
              ) {
                continue;
              }

              candidates.push({
                ...item,

                media_type:
                  mediaType,

                _score:
                  confidenceScore(
                    item,
                    mode
                  ),
              });
            }
          }
        )
    )
  );

  /*
   * Dedup.
   */
  const unique =
    new Map<
      string,
      any
    >();

  for (
    const item
    of candidates
  ) {
    const key =
      `${item.media_type}-${item.id}`;

    const current =
      unique.get(
        key
      );

    if (
      !current ||
      item._score >
        current._score
    ) {
      unique.set(
        key,
        item
      );
    }
  }

  let ranked =
    Array.from(
      unique.values()
    )
      .sort(
        (
          a,
          b
        ) =>
          b._score -
          a._score
      );

  if (
    ranked.length ===
    0
  ) {
    return NextResponse.json({
      error:
        "Não encontrei opções boas com esses filtros. Tente relaxar algum filtro.",
    }, {
      status:
        404,
    });
  }

  /*
   * Não sorteamos diretamente dos piores candidatos.
   * Pegamos o topo da cesta e aplicamos peso.
   */
  const poolSize =
    Math.min(
      mode ===
        "safe"
        ? 45
        : 70,
      ranked.length
    );

  ranked =
    ranked.slice(
      0,
      poolSize
    );

  const minScore =
    ranked[
      ranked.length -
      1
    ]?._score ||
    0;

  const maxScore =
    ranked[
      0
    ]?._score ||
    minScore +
      1;

  const weighted =
    ranked.map(
      (
        item
      ) => {
        const normalized =
          (
            item._score -
            minScore
          ) /
          Math.max(
            1,
            maxScore -
              minScore
          );

        return {
          ...item,

          /*
           * Todo mundo da cesta tem chance,
           * mas os melhores têm mais.
           */
          _weight:
            .45 +
            normalized *
              1.9,
        };
      }
    );

  const winnerBasic =
    weightedPick(
      weighted
    );

  if (
    !winnerBasic
  ) {
    return NextResponse.json(
      {
        error:
          "Não consegui escolher um título.",
      },
      {
        status:
          500,
      }
    );
  }

  /*
   * Busca detalhes completos do escolhido:
   * gêneros, duração e streaming.
   */
  const [
    winnerDetails,
    watchProviders,
  ] =
    await Promise.all([
      tmdb(
        `/${winnerBasic.media_type}/${winnerBasic.id}`
      ),

      tmdb(
        `/${winnerBasic.media_type}/${winnerBasic.id}/watch/providers`
      ),
    ]);

  const key =
    `${winnerBasic.media_type}-${winnerBasic.id}`;

  const libraryItem =
    libraryMap.get(
      key
    );

  const winner = {
    ...winnerBasic,
    ...(winnerDetails ||
      {}),

    id:
      winnerBasic.id,

    media_type:
      winnerBasic.media_type,

    watch_providers:
      watchProviders ||
      null,

    in_library:
      Boolean(
        libraryItem
      ),

    library_id:
      libraryItem?.id ||
      null,

    library_status:
      libraryItem?.status ||
      null,

    favorite:
      Boolean(
        libraryItem
          ?.favorite
      ),

    personal_rating:
      libraryItem
        ?.personal_rating ??
      null,
  };

  /*
   * Cards rápidos usados na animação.
   * Não precisa buscar detalhes deles.
   */
  const roulette =
    ranked
      .filter(
        (
          item
        ) =>
          !(
            item.id ===
              winner.id &&
            item.media_type ===
              winner.media_type
          )
      )
      .sort(
        () =>
          Math.random() -
          .5
      )
      .slice(
        0,
        11
      )
      .map(
        (
          item
        ) => {
          const {
            _score,
            _weight,
            ...clean
          } =
            item;

          return clean;
        }
      );

  roulette.push(
    winner
  );

  const {
    _score,
    _weight,
    ...cleanWinner
  } =
    winner as any;

  return NextResponse.json({
    winner:
      cleanWinner,

    roulette,

    pool_size:
      ranked.length,

    mode,

    quality: {
      score:
        Number(
          winnerBasic._score
        ).toFixed(
          1
        ),

      vote_average:
        Number(
          winner.vote_average ||
            0
        ),

      vote_count:
        Number(
          winner.vote_count ||
            0
        ),
    },
  });
}