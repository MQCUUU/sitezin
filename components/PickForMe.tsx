"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useModal } from "@/hooks/useModal";
import Link from "next/link";

import {
  Check,
  ChevronDown,
  Clock3,
  Eye,
  EyeOff,
  Film,
  Filter,
  Heart,
  Loader2,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Star,
  Trash2,
  Tv,
  WandSparkles,
  X,
} from "lucide-react";

import {
  img,
} from "@/lib/tmdb";

import { useToast } from "@/components/ToastProvider";

const STATUS_OPTIONS = [
  ["want", "Quero assistir"],
  ["watching", "Assistindo"],
  ["watched", "Assistido"],
  ["paused", "Pausado"],
  ["dropped", "Abandonado"],
  ["rewatching", "Reassistindo"],
  ["rewatched", "Reassistido"],
] as const;

const COUNTRIES = [
  ["", "Qualquer país"],
  ["BR", "Brasil"],
  ["US", "Estados Unidos"],
  ["GB", "Reino Unido"],
  ["KR", "Coreia do Sul"],
  ["JP", "Japão"],
  ["FR", "França"],
  ["ES", "Espanha"],
  ["DE", "Alemanha"],
  ["IT", "Itália"],
  ["MX", "México"],
  ["CA", "Canadá"],
  ["IN", "Índia"],
] as const;

const DECADES = [
  ["", "Qualquer época"],
  ["2020", "2020–2029"],
  ["2010", "2010–2019"],
  ["2000", "2000–2009"],
  ["1990", "1990–1999"],
  ["1980", "1980–1989"],
  ["1970", "1970–1979"],
  ["1960", "1960–1969"],
  ["1950", "1950–1959"],
  ["1940", "1940–1949"],
  ["1930", "1930–1939"],
  ["1920", "1920–1929"],
  ["1910", "1910–1919"],
  ["1900", "1900–1909"],
] as const;

type MediaType =
  | "movie"
  | "tv";

type PickMode =
  | "safe"
  | "popular"
  | "discover"
  | "gems";

type PickResult = {
  id: number;
  media_type:
    MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  runtime?: number;
  episode_run_time?: number[];
  genres?: {
    id: number;
    name: string;
  }[];
  watch_providers?: any;
  in_library?: boolean;
  library_id?: string | null;
  library_status?: string | null;
  favorite?: boolean;
  personal_rating?: number | null;
  [key: string]: any;
};

type FilterMeta = {
  genres: {
    key: string;
    name: string;
    movie_id?: number;
    tv_id?: number;
    special?: "teen";
  }[];
  providers: {
    provider_id: number;
    provider_name: string;
    logo_path?: string | null;
  }[];
};

function titleOf(
  item:
    PickResult |
    null
) {
  return (
    item?.title ||
    item?.name ||
    "Sem título"
  );
}

function statusLabel(
  status?:
    string |
    null
) {
  return (
    STATUS_OPTIONS.find(
      ([value]) =>
        value ===
        status
    )?.[1] ||
    "Na biblioteca"
  );
}

function runtimeOf(
  item:
    PickResult |
    null
) {
  if (!item) {
    return null;
  }

  if (
    item.media_type ===
    "movie"
  ) {
    return Number(
      item.runtime ||
        0
    ) ||
      null;
  }

  const values =
    Array.isArray(
      item.episode_run_time
    )
      ? item.episode_run_time
          .map(
            Number
          )
          .filter(
            (
              value
            ) =>
              value >
              0
          )
      : [];

  return (
    values[
      0
    ] ||
    null
  );
}

function formatRuntime(
  minutes:
    number |
    null,
  isTv:
    boolean
) {
  if (
    !minutes
  ) {
    return "";
  }

  if (
    isTv
  ) {
    return `~${minutes} min/ep.`;
  }

  const hours =
    Math.floor(
      minutes /
      60
    );

  const rest =
    minutes %
    60;

  if (!hours) {
    return `${rest} min`;
  }

  return `${hours}h ${rest}min`;
}

function normalizeGenreName(
  value:
    string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /&/g,
      " e "
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

async function safeJson(
  response:
    Response
) {
  const type =
    response.headers.get(
      "content-type"
    ) ||
    "";

  if (
    !type.includes(
      "application/json"
    )
  ) {
    throw new Error(
      `A rota não retornou JSON (${response.status}).`
    );
  }

  return response.json();
}

export function PickForMe() {
  const toast =
    useToast();

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    step,
    setStep,
  ] =
    useState<
      "filters" |
      "spinning" |
      "result"
    >(
      "filters"
    );

  const [
    type,
    setType,
  ] =
    useState<
      "any" |
      MediaType
    >(
      "any"
    );

  const [
    mode,
    setMode,
  ] =
    useState<PickMode>(
      "safe"
    );

  const [
    genres,
    setGenres,
  ] =
    useState<string[]>(
      []
    );

  const [
    providers,
    setProviders,
  ] =
    useState<string[]>(
      []
    );

  const [
    country,
    setCountry,
  ] =
    useState("");

  const [
    decade,
    setDecade,
  ] =
    useState("");

  const [
    minRating,
    setMinRating,
  ] =
    useState(
      "7"
    );

  const [
    duration,
    setDuration,
  ] =
    useState(
      "any"
    );

  const [
    excludeWatched,
    setExcludeWatched,
  ] =
    useState(
      true
    );

  const [
    excludeLibrary,
    setExcludeLibrary,
  ] =
    useState(
      false
    );

  const [
    filters,
    setFilters,
  ] =
    useState<FilterMeta>({
      genres:
        [],
      providers:
        [],
    });

  const [
    loadingFilters,
    setLoadingFilters,
  ] =
    useState(false);

  const [
    filtersLoaded,
    setFiltersLoaded,
  ] =
    useState(false);

  const [
    winner,
    setWinner,
  ] =
    useState<
      PickResult |
      null
    >(null);

  const [
    rollingItem,
    setRollingItem,
  ] =
    useState<
      PickResult |
      null
    >(null);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    rejected,
    setRejected,
  ] =
    useState<
      string[]
    >([]);

  const [
    processing,
    setProcessing,
  ] =
    useState(false);

  const [
    openStatus,
    setOpenStatus,
  ] =
    useState(false);

  const [
    removeConfirm,
    setRemoveConfirm,
  ] =
    useState(false);

  const [
    skipRemoveConfirm,
    setSkipRemoveConfirm,
  ] =
    useState(false);

  const refSorteio =
    useRef<HTMLElement | null>(
      null
    );

  useEffect(() => {
    try {
      const stored =
        sessionStorage.getItem(
          "mycatalog_pick_rejected"
        );

      if (
        stored
      ) {
        const parsed =
          JSON.parse(
            stored
          );

        if (
          Array.isArray(
            parsed
          )
        ) {
          setRejected(
            parsed
          );
        }
      }

      setSkipRemoveConfirm(
        localStorage.getItem(
          "mycatalog_skip_remove_confirm"
        ) ===
          "1"
      );
    } catch {}
  }, []);

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    const old =
      document.body
        .style.overflow;

    document.body
      .style.overflow =
      "hidden";

    function keydown(
      event:
        KeyboardEvent
    ) {
      if (
        event.key ===
          "Escape" &&
        step !==
          "spinning"
      ) {
        setOpen(
          false
        );
      }
    }

    window.addEventListener(
      "keydown",
      keydown
    );

    return () => {
      document.body
        .style.overflow =
        old;

      window.removeEventListener(
        "keydown",
        keydown
      );
    };
  }, [
    open,
    step,
  ]);

  useEffect(() => {
    if (
      !open ||
      filtersLoaded
    ) {
      return;
    }

    let cancelled =
      false;

    async function load() {
      try {
        setLoadingFilters(
          true
        );

        const [
          movies,
          tv,
        ] =
          await Promise.all([
            fetch(
              "/api/discover/filters?type=movie"
            ),
            fetch(
              "/api/discover/filters?type=tv"
            ),
          ]);

        const [
          movieData,
          tvData,
        ] =
          await Promise.all([
            movies.ok
              ? safeJson(
                  movies
                )
              : Promise.resolve({
                  genres:
                    [],
                  providers:
                    [],
                }),

            tv.ok
              ? safeJson(
                  tv
                )
              : Promise.resolve({
                  genres:
                    [],
                  providers:
                    [],
                }),
          ]);

        if (
          cancelled
        ) {
          return;
        }

        /*
         * IMPORTANTE:
         * Movie e TV podem ter IDs diferentes
         * para o mesmo gênero no TMDB.
         *
         * Exemplo:
         * Ação (movie) != Action & Adventure (tv).
         *
         * Guardamos os dois IDs por nome para a opção
         * "Qualquer" continuar funcionando corretamente.
         */
        const genreMap =
          new Map<
            string,
            {
              key:
                string;
              name:
                string;
              movie_id?:
                number;
              tv_id?:
                number;
            }
          >();

        for (
          const item
          of (
            movieData.genres ||
            []
          )
        ) {
          if (
            !item?.name ||
            !item?.id
          ) {
            continue;
          }

          const key =
            normalizeGenreName(
              String(
                item.name
              )
            );

          genreMap.set(
            key,
            {
              ...(genreMap.get(
                key
              ) || {
                key,
                name:
                  item.name,
              }),

              movie_id:
                Number(
                  item.id
                ),
            }
          );
        }

        for (
          const item
          of (
            tvData.genres ||
            []
          )
        ) {
          if (
            !item?.name ||
            !item?.id
          ) {
            continue;
          }

          const key =
            normalizeGenreName(
              String(
                item.name
              )
            );

          genreMap.set(
            key,
            {
              ...(genreMap.get(
                key
              ) || {
                key,
                name:
                  item.name,
              }),

              tv_id:
                Number(
                  item.id
                ),
            }
          );
        }

        /*
         * ==========================================
         * EQUIVALÊNCIAS MOVIE -> TV
         * ==========================================
         *
         * O TMDB separa alguns gêneros em filmes,
         * mas junta esses mesmos gêneros em séries.
         *
         * Exemplos:
         * - Filme: Fantasia + Ficção científica
         * - TV: Sci-Fi & Fantasy
         *
         * Sem esta ponte, selecionar Fantasia no modo
         * "Qualquer" deixava a busca de séries sem
         * gênero e podia entrar até comédia pura.
         */

        const tvGenres =
          Array.isArray(
            tvData.genres
          )
            ? tvData.genres
            : [];

        function findTvGenre(
          preferredId:
            number,
          terms:
            string[]
        ) {
          return (
            tvGenres.find(
              (
                item:
                  any
              ) =>
                Number(
                  item?.id
                ) ===
                preferredId
            ) ||
            tvGenres.find(
              (
                item:
                  any
              ) => {
                const name =
                  normalizeGenreName(
                    String(
                      item?.name ||
                        ""
                    )
                  );

                return terms.every(
                  (
                    term
                  ) =>
                    name.includes(
                      term
                    )
                );
              }
            ) ||
            null
          );
        }

        const sciFiFantasyTv =
          findTvGenre(
            10765,
            [
              "fantasy",
            ]
          );

        const actionAdventureTv =
          findTvGenre(
            10759,
            [
              "action",
              "adventure",
            ]
          );

        const warPoliticsTv =
          findTvGenre(
            10768,
            [
              "war",
            ]
          );

        function attachTvAlias(
          possibleKeys:
            string[],
          tvGenre:
            any
        ) {
          if (
            !tvGenre?.id
          ) {
            return;
          }

          for (
            const rawKey
            of possibleKeys
          ) {
            const key =
              normalizeGenreName(
                rawKey
              );

            const existing =
              genreMap.get(
                key
              );

            if (
              existing
            ) {
              genreMap.set(
                key,
                {
                  ...existing,
                  tv_id:
                    Number(
                      tvGenre.id
                    ),
                }
              );
            }
          }
        }

        attachTvAlias(
          [
            "Fantasia",
            "Fantasy",
            "Ficção científica",
            "Science Fiction",
            "Sci-Fi",
          ],
          sciFiFantasyTv
        );

        attachTvAlias(
          [
            "Ação",
            "Action",
            "Aventura",
            "Adventure",
          ],
          actionAdventureTv
        );

        attachTvAlias(
          [
            "Guerra",
            "War",
          ],
          warPoliticsTv
        );

        /*
         * Teen não é um gênero oficial do TMDB.
         * Ele entra como uma categoria inteligente
         * baseada em keywords do próprio TMDB.
         */
        genreMap.set(
          "__teen__",
          {
            key:
              "__teen__",

            name:
              "Teen",
          }
        );

        const providerMap =
          new Map<
            number,
            any
          >();

        for (
          const item
          of [
            ...(movieData.providers ||
              []),
            ...(tvData.providers ||
              []),
          ]
        ) {
          if (
            item?.provider_id
          ) {
            providerMap.set(
              Number(
                item.provider_id
              ),
              item
            );
          }
        }

        setFilters({
          genres:
            Array.from(
              genreMap.values()
            ).sort(
              (
                a,
                b
              ) =>
                a.name.localeCompare(
                  b.name,
                  "pt-BR"
                )
            ),

          providers:
            Array.from(
              providerMap.values()
            ).sort(
              (
                a,
                b
              ) =>
                String(
                  a.provider_name
                ).localeCompare(
                  String(
                    b.provider_name
                  ),
                  "pt-BR"
                )
            ),
        });

        setFiltersLoaded(
          true
        );
      } catch (
        error
      ) {
        console.error(
          "Erro ao carregar filtros da roleta:",
          error
        );

        if (
          !cancelled
        ) {
          setFilters({
            genres:
              [],
            providers:
              [],
          });

          /*
           * Não trava o select eternamente se a API falhar.
           */
          setFiltersLoaded(
            true
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setLoadingFilters(
            false
          );
        }
      }
    }

    load();

    return () => {
      cancelled =
        true;
    };
  }, [
    open,
    filtersLoaded,
  ]);

  useEffect(() => {
    if (
      !openStatus
    ) {
      return;
    }

    function outside(
      event:
        MouseEvent
    ) {
      const target =
        event.target;

      if (
        !(
          target instanceof
          Element
        )
      ) {
        return;
      }

      if (
        target.closest(
          ".pick-status-wrap"
        )
      ) {
        return;
      }

      setOpenStatus(
        false
      );
    }

    document.addEventListener(
      "mousedown",
      outside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        outside
      );
  }, [
    openStatus,
  ]);

  const activeFilters =
    useMemo(
      () =>
        [
          type !==
            "any",
          genres.length >
            0,
          providers.length >
            0,
          country,
          decade,
          minRating !==
            "7",
          duration !==
            "any",
          excludeWatched,
          excludeLibrary,
        ].filter(
          Boolean
        ).length,
      [
        type,
        genres.length,
        providers.length,
        country,
        decade,
        minRating,
        duration,
        excludeWatched,
        excludeLibrary,
      ]
    );

  const selectedGenres =
    useMemo(
      () =>
        filters.genres.filter(
          (
            item
          ) =>
            genres.includes(
              item.key
            )
        ),
      [
        filters.genres,
        genres,
      ]
    );

  const [
    genreMatch,
    setGenreMatch,
  ] =
    useState<
      "all" |
      "any"
    >("all");

  function reset() {
    setType(
      "any"
    );

    setMode(
      "safe"
    );

    setGenres(
      []
    );

    setGenreMatch(
      "all"
    );

    setProviders(
      []
    );

    setCountry(
      ""
    );

    setDecade(
      ""
    );

    setMinRating(
      "7"
    );

    setDuration(
      "any"
    );

    setExcludeWatched(
      true
    );

    setExcludeLibrary(
      false
    );
  }

  function persistRejected(
    next:
      string[]
  ) {
    setRejected(
      next
    );

    try {
      sessionStorage.setItem(
        "mycatalog_pick_rejected",
        JSON.stringify(
          next
        )
      );
    } catch {}
  }

  async function pick(
    surprise =
      false
  ) {
    try {
      setError(
        ""
      );

      setStep(
        "spinning"
      );

      setOpenStatus(
        false
      );

      const params =
        new URLSearchParams({
          type,
          mode,

          genre_movie:
            selectedGenres
              .map(
                (
                  item
                ) =>
                  item.movie_id
              )
              .filter(
                Boolean
              )
              .join(
                ","
              ),

          genre_match:
            genreMatch,

          genre_tv:
            selectedGenres
              .map(
                (
                  item
                ) =>
                  item.tv_id
              )
              .filter(
                Boolean
              )
              .join(
                ","
              ),

          smart_genres:
            selectedGenres
              .filter(
                (
                  item
                ) =>
                  item.special
              )
              .map(
                (
                  item
                ) =>
                  item.special
              )
              .join(
                ","
              ),

          providers:
            providers.join(
              ","
            ),

          country,
          decade,
          min_rating:
            minRating,
          duration,
          exclude_watched:
            excludeWatched
              ? "1"
              : "0",
          exclude_library:
            excludeLibrary
              ? "1"
              : "0",
          surprise:
            surprise
              ? "1"
              : "0",
          exclude:
            rejected.join(
              ","
            ),
        });

      const response =
        await fetch(
          `/api/pick-for-me?${params.toString()}`
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Não consegui escolher."
        );
      }

      const roulette:
        PickResult[] =
        Array.isArray(
          data.roulette
        )
          ? data.roulette
          : [];

      if (
        roulette.length >
        0
      ) {
        /*
         * Animação com desaceleração.
         */
        const sequence =
          [
            ...roulette,
            ...roulette.slice(
              0,
              5
            ),
            data.winner,
          ];

        for (
          let index =
            0;
          index <
            sequence.length;
          index++
        ) {
          setRollingItem(
            sequence[
              index
            ]
          );

          const progress =
            index /
            Math.max(
              1,
              sequence.length -
                1
            );

          const delay =
            55 +
            Math.pow(
              progress,
              2.4
            ) *
              220;

          await new Promise(
            (
              resolve
            ) =>
              setTimeout(
                resolve,
                delay
              )
          );
        }
      }

      setWinner(
        data.winner
      );

      setRollingItem(
        data.winner
      );

      setStep(
        "result"
      );
    } catch (
      error
    ) {
      setError(
        error instanceof Error
          ? error.message
          : "Erro ao escolher."
      );

      setStep(
        "filters"
      );
    }
  }

  function rejectWinner() {
    if (
      !winner
    ) {
      return;
    }

    const key =
      `${winner.media_type}-${winner.id}`;

    if (
      !rejected.includes(
        key
      )
    ) {
      persistRejected([
        ...rejected,
        key,
      ]);
    }

    pick(
      false
    );
  }

  async function markNotInterested() {
    if (
      !winner
    ) {
      return;
    }

    const target = {
      ...winner,
    };

    const key =
      `${target.media_type}-${target.id}`;

    try {
      setProcessing(
        true
      );

      const response =
        await fetch(
          "/api/not-interested",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                tmdb_id:
                  target.id,

                media_type:
                  target.media_type,

                reason:
                  "not_interested",
              }),
          }
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Não foi possível salvar sua preferência."
        );
      }

      if (
        !rejected.includes(
          key
        )
      ) {
        persistRejected([
          ...rejected,
          key,
        ]);
      }

      toast.success(
        "Não vamos mais recomendar esse título",
        {
          description:
            `${titleOf(
              target
            )} foi removido das suas recomendações.`,

          actionLabel:
            "Desfazer",

          duration:
            8000,

          onAction:
            async () => {
              const params =
                new URLSearchParams({
                  tmdb_id:
                    String(
                      target.id
                    ),

                  media_type:
                    target.media_type,
                });

              const undo =
                await fetch(
                  `/api/not-interested?${params.toString()}`,
                  {
                    method:
                      "DELETE",
                  }
                );

              const undoData =
                await safeJson(
                  undo
                );

              if (
                !undo.ok ||
                undoData?.error
              ) {
                throw new Error(
                  undoData?.error ||
                    "Não foi possível desfazer."
                );
              }

              persistRejected(
                rejected.filter(
                  (
                    item
                  ) =>
                    item !==
                    key
                )
              );
            },
        }
      );

      await pick(
        false
      );
    } catch (
      error
    ) {
      toast.error(
        "Erro ao ocultar título",
        {
          description:
            error instanceof Error
              ? error.message
              : "Tente novamente.",
        }
      );
    } finally {
      setProcessing(
        false
      );
    }
  }

  async function addToLibrary() {
    if (
      !winner ||
      winner.in_library
    ) {
      return;
    }

    try {
      setProcessing(
        true
      );

      const response =
        await fetch(
          "/api/library",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                media: {
                  ...winner,

                  media_type:
                    winner.media_type,

                  title:
                    winner.title ||
                    winner.name,

                  original_title:
                    winner.original_title ||
                    winner.original_name ||
                    winner.title ||
                    winner.name,

                  genres:
                    winner.genres ||
                    [],
                },

                status:
                  "want",

                favorite:
                  false,
              }),
          }
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro ao adicionar."
        );
      }

      setWinner(
        (
          current
        ) =>
          current
            ? {
                ...current,
                in_library:
                  true,
                library_id:
                  String(
                    data.id
                  ),
                library_status:
                  data.status ||
                  "want",
                favorite:
                  Boolean(
                    data.favorite
                  ),
                personal_rating:
                  data.personal_rating ??
                  null,
              }
            : current
      );
    } finally {
      setProcessing(
        false
      );
    }
  }

  async function patchLibrary(
    patch:
      Record<
        string,
        any
      >
  ) {
    if (
      !winner
        ?.library_id
    ) {
      return null;
    }

    try {
      setProcessing(
        true
      );

      const response =
        await fetch(
          `/api/library/${winner.library_id}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                patch
              ),
          }
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro ao atualizar biblioteca."
        );
      }

      return data;
    } finally {
      setProcessing(
        false
      );
    }
  }

  async function updateStatus(
    status:
      string
  ) {
    const data =
      await patchLibrary({
        status,
      });

    if (
      data
    ) {
      setWinner(
        (
          current
        ) =>
          current
            ? {
                ...current,
                library_status:
                  data.status ||
                  status,
              }
            : current
      );

      setOpenStatus(
        false
      );
    }
  }

  async function toggleFavorite() {
    if (
      !winner
    ) {
      return;
    }

    const next =
      !winner.favorite;

    const data =
      await patchLibrary({
        favorite:
          next,
      });

    if (
      data
    ) {
      setWinner(
        (
          current
        ) =>
          current
            ? {
                ...current,
                favorite:
                  data.favorite ??
                  next,
              }
            : current
      );
    }
  }

  async function updateRating(
    personal_rating:
      number |
      null
  ) {
    const data =
      await patchLibrary({
        personal_rating,
      });

    if (
      data
    ) {
      setWinner(
        (
          current
        ) =>
          current
            ? {
                ...current,
                personal_rating,
              }
            : current
      );
    }
  }

  async function remove() {
    if (
      !winner
        ?.library_id
    ) {
      return;
    }

    try {
      setProcessing(
        true
      );

      const response =
        await fetch(
          `/api/library/${winner.library_id}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro ao remover."
        );
      }

      setWinner(
        (
          current
        ) =>
          current
            ? {
                ...current,
                in_library:
                  false,
                library_id:
                  null,
                library_status:
                  null,
                favorite:
                  false,
                personal_rating:
                  null,
              }
            : current
      );

      setRemoveConfirm(
        false
      );
    } finally {
      setProcessing(
        false
      );
    }
  }

  function requestRemove() {
    if (
      skipRemoveConfirm
    ) {
      remove();

      return;
    }

    setRemoveConfirm(
      true
    );
  }

  const current =
    step ===
      "spinning"
      ? rollingItem
      : winner;

  const runtime =
    runtimeOf(
      current
    );

  const yearLabel =
    (
      current
        ?.release_date ||
      current
        ?.first_air_date ||
      ""
    ).slice(
      0,
      4
    );

  return (
    <>
      <button
        type="button"
        className="btn pick-trigger"
        onClick={() => {
          setOpen(
            true
          );

          setStep(
            winner
              ? "result"
              : "filters"
          );
        }}
      >
        <Shuffle
          size={16}
        />

        Escolha pra mim
      </button>

      {open && (
        <div
          className="pick-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
                event.currentTarget &&
              step !==
                "spinning"
            ) {
              setOpen(
                false
              );
            }
          }}
        >
          <section
  ref={refSorteio as React.RefObject<HTMLElement>}
  className="pick-modal"
  role="dialog"
  aria-modal="true"
  aria-label="Escolher um título para assistir"
>
            <button
              type="button"
              className="pick-close"
              disabled={
                step ===
                "spinning"
              }
              onClick={() =>
                setOpen(
                  false
                )
              }
            >
              <X
                size={18}
              />
            </button>

            {step ===
            "filters" ? (
              <>
                <div className="pick-heading">
                  <div className="pick-heading-icon">
                    <Shuffle
                      size={21}
                    />
                  </div>

                  <div>
                    <div className="eyebrow">
                      ESCOLHA PRA MIM
                    </div>

                    <h2>
                      O que vamos assistir?
                    </h2>

                    <p>
                      Você escolhe o clima. O MyCatalog elimina opções ruins e sorteia entre as melhores candidatas.
                    </p>
                  </div>
                </div>

                <div className="pick-type-tabs">
                  <button
                    type="button"
                    className={
                      type ===
                        "any"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setType(
                        "any"
                      )
                    }
                  >
                    <Sparkles
                      size={15}
                    />
                    Qualquer
                  </button>

                  <button
                    type="button"
                    className={
                      type ===
                        "movie"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setType(
                        "movie"
                      )
                    }
                  >
                    <Film
                      size={15}
                    />
                    Filme
                  </button>

                  <button
                    type="button"
                    className={
                      type ===
                        "tv"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setType(
                        "tv"
                      )
                    }
                  >
                    <Tv
                      size={15}
                    />
                    Série
                  </button>
                </div>

                <div className="pick-form-grid">
                  <div className="pick-field">
                    <span>
                      Gêneros
                    </span>

                    <MultiPicker
                      disabled={
                        loadingFilters
                      }
                      placeholder="Qualquer gênero"
                      searchPlaceholder="Buscar gênero..."
                      selected={
                        genres
                      }
                      onChange={
                        setGenres
                      }
                      options={
                        filters.genres.map(
                          (
                            item
                          ) => ({
                            value:
                              item.key,

                            label:
                              item.name,

                            badge:
                              item.special ===
                              "teen"
                                ? "SMART"
                                : undefined,
                          })
                        )
                      }
                    />

                    {genres.length > 1 && (
                      <div
                        className="pick-genre-match"
                        role="group"
                        aria-label="Como combinar os gêneros"
                      >
                        <button
                          type="button"
                          className={`chip${
                            genreMatch === "all" ? " active" : ""
                          }`}
                          aria-pressed={genreMatch === "all"}
                          onClick={() => setGenreMatch("all")}
                        >
                          Todos os gêneros
                        </button>

                        <button
                          type="button"
                          className={`chip${
                            genreMatch === "any" ? " active" : ""
                          }`}
                          aria-pressed={genreMatch === "any"}
                          onClick={() => setGenreMatch("any")}
                        >
                          Qualquer um
                        </button>

                        <p className="pick-genre-match-hint">
                          {genreMatch === "all"
                            ? "O título precisa ter todos os gêneros escolhidos."
                            : "Basta o título ter um dos gêneros escolhidos."}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pick-field">
                    <span>
                      Onde assistir
                    </span>

                    <MultiPicker
                      disabled={
                        loadingFilters
                      }
                      placeholder="Qualquer streaming"
                      searchPlaceholder="Buscar streaming..."
                      selected={
                        providers
                      }
                      onChange={
                        setProviders
                      }
                      options={
                        filters.providers.map(
                          (
                            item
                          ) => ({
                            value:
                              String(
                                item.provider_id
                              ),

                            label:
                              item.provider_name,

                            logo:
                              item.logo_path ||
                              null,
                          })
                        )
                      }
                    />
                  </div>

                  <label>
                    <span>
                      Nota mínima
                    </span>

                    <select
                      value={
                        minRating
                      }
                      onChange={(
                        event
                      ) =>
                        setMinRating(
                          event.target
                            .value
                        )
                      }
                    >
                      <option value="6">
                        6+
                      </option>

                      <option value="6.5">
                        6.5+
                      </option>

                      <option value="7">
                        7+
                      </option>

                      <option value="7.5">
                        7.5+
                      </option>

                      <option value="8">
                        8+
                      </option>
                    </select>
                  </label>

                  <label>
                    <span>
                      Duração
                    </span>

                    <select
                      value={
                        duration
                      }
                      onChange={(
                        event
                      ) =>
                        setDuration(
                          event.target
                            .value
                        )
                      }
                    >
                      <option value="any">
                        Qualquer
                      </option>

                      <option value="short">
                        Curto
                      </option>

                      <option value="medium">
                        Médio
                      </option>

                      <option value="long">
                        Longo
                      </option>
                    </select>
                  </label>

                  <label>
                    <span>
                      País
                    </span>

                    <select
                      value={
                        country
                      }
                      onChange={(
                        event
                      ) =>
                        setCountry(
                          event.target
                            .value
                        )
                      }
                    >
                      {COUNTRIES.map(
                        (
                          [
                            value,
                            label,
                          ]
                        ) => (
                          <option
                            key={
                              value ||
                              "all"
                            }
                            value={
                              value
                            }
                          >
                            {
                              label
                            }
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    <span>
                      Época
                    </span>

                    <select
                      value={
                        decade
                      }
                      onChange={(
                        event
                      ) =>
                        setDecade(
                          event.target
                            .value
                        )
                      }
                    >
                      {DECADES.map(
                        (
                          [
                            value,
                            label,
                          ]
                        ) => (
                          <option
                            key={
                              value ||
                              "all"
                            }
                            value={
                              value
                            }
                          >
                            {
                              label
                            }
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>

                <div className="pick-mode-title">
                  Estilo da escolha
                </div>

                <div className="pick-mode-grid">
                  <button
                    type="button"
                    className={
                      mode ===
                        "safe"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setMode(
                        "safe"
                      )
                    }
                  >
                    <strong>
                      Seguro
                    </strong>

                    <span>
                      Mais confiável e bem consolidado
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      mode ===
                        "popular"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setMode(
                        "popular"
                      )
                    }
                  >
                    <strong>
                      Popular
                    </strong>

                    <span>
                      Favorece títulos conhecidos
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      mode ===
                        "discover"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setMode(
                        "discover"
                      )
                    }
                  >
                    <strong>
                      Descobrir
                    </strong>

                    <span>
                      Sai um pouco do óbvio sem baixar a qualidade
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      mode ===
                        "gems"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setMode(
                        "gems"
                      )
                    }
                  >
                    <strong>
                      Joias escondidas
                    </strong>

                    <span>
                      Menos populares, mas bem avaliados
                    </span>
                  </button>
                </div>

                <div className="pick-toggle-grid">
                  <button
                    type="button"
                    className={
                      excludeWatched
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setExcludeWatched(
                        (
                          value
                        ) =>
                          !value
                      )
                    }
                  >
                    <span>
                      {excludeWatched
                        ? "✓"
                        : ""}
                    </span>

                    <div>
                      <strong>
                        Não repetir assistidos
                      </strong>

                      <small>
                        Evita coisas que você já concluiu
                      </small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={
                      excludeLibrary
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setExcludeLibrary(
                        (
                          value
                        ) =>
                          !value
                      )
                    }
                  >
                    <span>
                      {excludeLibrary
                        ? "✓"
                        : ""}
                    </span>

                    <div>
                      <strong>
                        Só fora da biblioteca
                      </strong>

                      <small>
                        A escolha vira uma descoberta nova
                      </small>
                    </div>
                  </button>
                </div>

                {error && (
                  <div className="pick-error">
                    {
                      error
                    }
                  </div>
                )}

                <div className="pick-filter-footer">
                  <button
                    type="button"
                    className="pick-reset"
                    onClick={
                      reset
                    }
                  >
                    <RotateCcw
                      size={14}
                    />

                    Restaurar
                  </button>

                  <span>
                    {activeFilters}{" "}
                    {activeFilters ===
                    1
                      ? "filtro ativo"
                      : "filtros ativos"}
                  </span>
                </div>

                <div className="pick-main-actions">
                  <button
                    type="button"
                    className="btn pick-surprise"
                    onClick={() =>
                      pick(
                        true
                      )
                    }
                  >
                    <WandSparkles
                      size={17}
                    />

                    Surpreenda-me
                  </button>

                  <button
                    type="button"
                    className="btn primary pick-go"
                    onClick={() =>
                      pick(
                        false
                      )
                    }
                  >
                    <Shuffle
                      size={18}
                    />

                    Escolher pra mim
                  </button>
                </div>
              </>
            ) : (
              <div
                className={
                  "pick-result-layout " +
                  (step ===
                    "spinning"
                    ? "spinning"
                    : "")
                }
              >
                <div className="pick-result-visual">
                  <div className="pick-result-poster">
                    {current
                      ?.poster_path ? (
                      <img loading="lazy" decoding="async"
                        src={img(
                          current.poster_path,
                          "w500"
                        )}
                        alt={
                          titleOf(
                            current
                          )
                        }
                      />
                    ) : (
                      <div className="pick-empty-poster">
                        {current
                          ?.media_type ===
                        "tv" ? (
                          <Tv
                            size={40}
                          />
                        ) : (
                          <Film
                            size={40}
                          />
                        )}
                      </div>
                    )}

                    {step ===
                      "spinning" && (
                      <div className="pick-spin-overlay">
                        <Shuffle
                          size={28}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="pick-result-copy">
                  {step ===
                  "spinning" ? (
                    <div className="pick-spinning-copy">
                      <div className="eyebrow">
                        GIRANDO...
                      </div>

                      <h2>
                        {titleOf(
                          current
                        )}
                      </h2>

                      <p>
                        Filtrando a bagunça e procurando uma escolha que valha seu tempo.
                      </p>

                      <div className="pick-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="pick-winner-label">
                        <Sparkles
                          size={15}
                        />

                        ESCOLHIDO PARA VOCÊ
                      </div>

                      <h2>
                        {titleOf(
                          winner
                        )}
                      </h2>

                      <div className="pick-result-meta">
                        <span>
                          {winner
                            ?.media_type ===
                          "tv"
                            ? "Série"
                            : "Filme"}
                        </span>

                        {yearLabel && (
                          <span>
                            {
                              yearLabel
                            }
                          </span>
                        )}

                        {runtime && (
                          <span>
                            <Clock3
                              size={12}
                            />
                            {formatRuntime(
                              runtime,
                              winner
                                ?.media_type ===
                                "tv"
                            )}
                          </span>
                        )}

                        {Number(
                          winner
                            ?.vote_average ||
                            0
                        ) >
                          0 && (
                          <span className="rating">
                            <Star
                              size={13}
                              fill="currentColor"
                            />

                            {Number(
                              winner
                                ?.vote_average
                            ).toFixed(
                              1
                            )}
                          </span>
                        )}
                      </div>

                      {winner
                        ?.genres &&
                        winner.genres
                          .length >
                          0 && (
                        <div className="pick-genres">
                          {winner.genres
                            .slice(
                              0,
                              5
                            )
                            .map(
                              (
                                item
                              ) => (
                                <span
                                  key={
                                    item.id
                                  }
                                >
                                  {
                                    item.name
                                  }
                                </span>
                              )
                            )}
                        </div>
                      )}

                      <WatchProviders
                        winner={
                          winner
                        }
                      />

                      {winner
                        ?.in_library && (
                        <div className="pick-personal-rating">
                          <div>
                            <span>
                              Minha nota
                            </span>

                            <strong>
                              {winner.personal_rating !==
                                null &&
                              winner.personal_rating !==
                                undefined
                                ? Number(
                                    winner.personal_rating
                                  ).toFixed(
                                    1
                                  )
                                : "Sem nota"}
                            </strong>
                          </div>

                          <div className="pick-rating-buttons">
                            {[1,2,3,4,5,6,7,8,9,10].map(
                              (
                                value
                              ) => (
                                <button
                                  type="button"
                                  key={
                                    value
                                  }
                                  className={
                                    Number(
                                      winner.personal_rating
                                    ) ===
                                    value
                                      ? "active"
                                      : ""
                                  }
                                  disabled={
                                    processing
                                  }
                                  onClick={() =>
                                    updateRating(
                                      value
                                    )
                                  }
                                >
                                  {
                                    value
                                  }
                                </button>
                              )
                            )}

                            <button
                              type="button"
                              className="clear"
                              disabled={
                                processing
                              }
                              onClick={() =>
                                updateRating(
                                  null
                                )
                              }
                            >
                              Limpar
                            </button>
                          </div>
                        </div>
                      )}

                      <p className="pick-overview">
                        {winner
                          ?.overview
                          ?.trim() ||
                          "Ainda não há sinopse disponível para este título."}
                      </p>

                      <div className="pick-library-actions">
                        {!winner
                          ?.in_library ? (
                          <button
                            type="button"
                            className="btn primary"
                            disabled={
                              processing
                            }
                            onClick={
                              addToLibrary
                            }
                          >
                            {processing ? (
                              <Loader2
                                size={16}
                                className="spin"
                              />
                            ) : (
                              <Plus
                                size={16}
                              />
                            )}

                            Quero assistir
                          </button>
                        ) : (
                          <>
                            <div className="pick-status-wrap">
                              <button
                                type="button"
                                className="btn pick-status-button"
                                disabled={
                                  processing
                                }
                                onClick={() =>
                                  setOpenStatus(
                                    (
                                      value
                                    ) =>
                                      !value
                                  )
                                }
                              >
                                <Check
                                  size={15}
                                />

                                {statusLabel(
                                  winner.library_status
                                )}

                                <ChevronDown
                                  size={13}
                                />
                              </button>

                              {openStatus && (
                                <div className="pick-status-menu">
                                  {STATUS_OPTIONS.map(
                                    (
                                      [
                                        value,
                                        label,
                                      ]
                                    ) => (
                                      <button
                                        type="button"
                                        key={
                                          value
                                        }
                                        className={
                                          winner.library_status ===
                                          value
                                            ? "active"
                                            : ""
                                        }
                                        onClick={() =>
                                          updateStatus(
                                            value
                                          )
                                        }
                                      >
                                        <span>
                                          {
                                            label
                                          }
                                        </span>

                                        {winner.library_status ===
                                          value && (
                                          <Check
                                            size={13}
                                          />
                                        )}
                                      </button>
                                    )
                                  )}

                                  <div />

                                  <button
                                    type="button"
                                    className="remove"
                                    onClick={
                                      requestRemove
                                    }
                                  >
                                    <Trash2
                                      size={14}
                                    />

                                    Remover
                                  </button>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              className={
                                "btn pick-favorite " +
                                (winner.favorite
                                  ? "active"
                                  : "")
                              }
                              disabled={
                                processing
                              }
                              onClick={
                                toggleFavorite
                              }
                            >
                              <Heart
                                size={16}
                                fill={
                                  winner.favorite
                                    ? "currentColor"
                                    : "none"
                                }
                              />

                              {winner.favorite
                                ? "Curtido"
                                : "Curtir"}
                            </button>
                          </>
                        )}

                        <Link
                          href={`/title/${winner?.media_type}/${winner?.id}`}
                          className="btn"
                        >
                          <Eye
                            size={16}
                          />

                          Ver detalhes
                        </Link>
                      </div>

                      <div className="pick-reroll-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            setStep(
                              "filters"
                            )
                          }
                        >
                          <Filter
                            size={15}
                          />

                          Alterar filtros
                        </button>

                        <button
                          type="button"
                          className="btn pick-not-interested"
                          disabled={
                            processing
                          }
                          onClick={
                            markNotInterested
                          }
                        >
                          <EyeOff
                            size={15}
                          />

                          Não tenho interesse
                        </button>

                        <button
                          type="button"
                          className="btn"
                          onClick={
                            rejectWinner
                          }
                        >
                          <X
                            size={15}
                          />

                          Não quero esse
                        </button>

                        <button
                          type="button"
                          className="btn primary"
                          onClick={() =>
                            pick(
                              false
                            )
                          }
                        >
                          <Shuffle
                            size={16}
                          />

                          Girar novamente
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {removeConfirm && (
        <div
          className="mycatalog-confirm-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setRemoveConfirm(
                false
              );
            }
          }}
        >
          <div
            className="mycatalog-confirm-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="mycatalog-confirm-icon danger">
              <Trash2
                size={20}
              />
            </div>

            <div>
              <div className="eyebrow">
                REMOVER DA BIBLIOTECA
              </div>

              <h3>
                Remover “{
                  titleOf(
                    winner
                  )
                }”?
              </h3>

              <p className="muted">
                Você poderá adicionar o título novamente depois.
              </p>
            </div>

            <label className="mycatalog-confirm-option">
              <input
                type="checkbox"
                checked={
                  skipRemoveConfirm
                }
                onChange={(
                  event
                ) => {
                  const checked =
                    event.target
                      .checked;

                  setSkipRemoveConfirm(
                    checked
                  );

                  try {
                    localStorage.setItem(
                      "mycatalog_skip_remove_confirm",
                      checked
                        ? "1"
                        : "0"
                    );
                  } catch {}
                }}
              />

              <span>
                Não mostrar novamente
              </span>
            </label>

            <div className="mycatalog-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setRemoveConfirm(
                    false
                  )
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn danger"
                disabled={
                  processing
                }
                onClick={
                  remove
                }
              >
                <Trash2
                  size={15}
                />
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type MultiPickerOption = {
  value:
    string;

  label:
    string;

  logo?:
    string |
    null;

  badge?:
    string;
};

function MultiPicker({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder,
  disabled,
}: {
  options:
    MultiPickerOption[];

  selected:
    string[];

  onChange:
    (
      values:
        string[]
    ) =>
      void;

  placeholder:
    string;

  searchPlaceholder:
    string;

  disabled?:
    boolean;
}) {
  const [
    open,
    setOpen,
  ] =
    useState(false);

  useModal(
    open,
    () =>
      setOpen(
        false
      ),
    false
  );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const ref =
    useRef<HTMLDivElement>(
      null
    );

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    function outside(
      event:
        MouseEvent
    ) {
      if (
        ref.current &&
        !ref.current.contains(
          event.target as Node
        )
      ) {
        setOpen(
          false
        );
      }
    }

    document.addEventListener(
      "mousedown",
      outside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        outside
      );
  }, [
    open,
  ]);

  const visible =
    useMemo(
      () => {
        const q =
          search
            .trim()
            .toLocaleLowerCase(
              "pt-BR"
            );

        if (!q) {
          return options;
        }

        return options.filter(
          (
            option
          ) =>
            option.label
              .toLocaleLowerCase(
                "pt-BR"
              )
              .includes(
                q
              )
        );
      },
      [
        options,
        search,
      ]
    );

  const selectedOptions =
    options.filter(
      (
        option
      ) =>
        selected.includes(
          option.value
        )
    );

  function toggle(
    value:
      string
  ) {
    onChange(
      selected.includes(
        value
      )
        ? selected.filter(
            (
              current
            ) =>
              current !==
              value
          )
        : [
            ...selected,
            value,
          ]
    );
  }

  return (
    <div
      className={
        "pick-multi " +
        (open
          ? "open"
          : "")
      }
      ref={
        ref
      }
    >
      <button
        type="button"
        className="pick-multi-trigger"
        disabled={
          disabled
        }
        onClick={() =>
          setOpen(
            (
              value
            ) =>
              !value
          )
        }
      >
        <span>
          {selectedOptions.length ===
          0
            ? placeholder
            : selectedOptions.length ===
                1
              ? selectedOptions[
                  0
                ].label
              : `${selectedOptions.length} selecionados`}
        </span>

        <ChevronDown
          size={14}
        />
      </button>

      {selectedOptions.length >
        0 && (
        <div className="pick-multi-chips">
          {selectedOptions
            .slice(
              0,
              4
            )
            .map(
              (
                option
              ) => (
                <button
                  type="button"
                  key={
                    option.value
                  }
                  title={`Remover ${option.label}`}
                  onClick={() =>
                    toggle(
                      option.value
                    )
                  }
                >
                  {
                    option.label
                  }
                  <X
                    size={10}
                  />
                </button>
              )
            )}

          {selectedOptions.length >
            4 && (
            <span>
              +{
                selectedOptions.length -
                4
              }
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="pick-multi-popover">
          <div className="pick-multi-search">
            <input
              value={
                search
              }
              autoFocus
              placeholder={
                searchPlaceholder
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
            />

            {selected.length >
              0 && (
              <button
                type="button"
                onClick={() =>
                  onChange(
                    []
                  )
                }
              >
                Limpar
              </button>
            )}
          </div>

          <div className="pick-multi-options">
            {visible.map(
              (
                option
              ) => {
                const active =
                  selected.includes(
                    option.value
                  );

                return (
                  <button
                    type="button"
                    key={
                      option.value
                    }
                    className={
                      active
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      toggle(
                        option.value
                      )
                    }
                  >
                    {option.logo ? (
                      <img loading="lazy" decoding="async"
                        src={img(
                          option.logo,
                          "w92"
                        )}
                        alt=""
                      />
                    ) : (
                      <span className="pick-multi-check">
                        {active
                          ? "✓"
                          : ""}
                      </span>
                    )}

                    <strong>
                      {
                        option.label
                      }
                    </strong>

                    {option.badge && (
                      <small>
                        {
                          option.badge
                        }
                      </small>
                    )}
                  </button>
                );
              }
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WatchProviders({
  winner,
}: {
  winner:
    PickResult |
    null;
}) {
  const br =
    winner
      ?.watch_providers
      ?.results
      ?.BR ||
    null;

  if (!br) {
    return null;
  }

  const subscription =
    [
      ...(Array.isArray(
        br.flatrate
      )
        ? br.flatrate
        : []),
      ...(Array.isArray(
        br.free
      )
        ? br.free
        : []),
      ...(Array.isArray(
        br.ads
      )
        ? br.ads
        : []),
    ].filter(
      (
        provider:
          any,
        index:
          number,
        all:
          any[]
      ) =>
        all.findIndex(
          (
            current
          ) =>
            current.provider_id ===
            provider.provider_id
        ) ===
        index
    );

  const rent =
    Array.isArray(
      br.rent
    )
      ? br.rent
      : [];

  const buy =
    Array.isArray(
      br.buy
    )
      ? br.buy
      : [];

  if (
    subscription.length ===
      0 &&
    rent.length ===
      0 &&
    buy.length ===
      0
  ) {
    return null;
  }

  return (
    <div className="pick-watch">
      <strong>
        Onde assistir no Brasil
      </strong>

      {subscription.length >
        0 && (
        <ProviderLine
          label="Streaming"
          providers={
            subscription
          }
        />
      )}

      {rent.length >
        0 && (
        <ProviderLine
          label="Aluguel"
          providers={
            rent
          }
        />
      )}

      {buy.length >
        0 && (
        <ProviderLine
          label="Compra"
          providers={
            buy
          }
        />
      )}
    </div>
  );
}

function ProviderLine({
  label,
  providers,
}: {
  label:
    string;
  providers:
    any[];
}) {
  return (
    <div className="pick-provider-line">
      <span>
        {
          label
        }
      </span>

      <div>
        {providers.map(
          (
            provider
          ) => (
            <div
              key={
                provider.provider_id
              }
              title={
                provider.provider_name
              }
            >
              {provider.logo_path ? (
                <img loading="lazy" decoding="async"
                  src={img(
                    provider.logo_path,
                    "w92"
                  )}
                  alt={
                    provider.provider_name
                  }
                />
              ) : (
                <span>
                  {String(
                    provider.provider_name ||
                      "?"
                  ).slice(
                    0,
                    1
                  )}
                </span>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
