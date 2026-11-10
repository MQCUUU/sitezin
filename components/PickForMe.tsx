"use client";


import { useConfirm } from "@/components/ConfirmProvider";
import "@/styles/features/pick-for-me.css";
import { removeFromLibrary } from "@/lib/library/actions";
import { removalConfirmOptions } from "@/lib/library/remove";
import { apiFetch } from "@/lib/api-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

import { Shuffle, X } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { ApiError } from "@/lib/api-client";
import { type LibraryIntent } from "@/lib/auth/pending-action";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { fetchDiscoverFilters } from "@/lib/discover/filters-client";
import { COUNTRIES, titleOf, runtimeOf, normalizeGenreName, safeJson, type MediaType, type PickMode, type PickResult, type FilterMeta } from "@/components/pick-for-me/shared";
import { PickFilterStep } from "@/components/pick-for-me/FilterStep";
import { PickResultStep } from "@/components/pick-for-me/ResultStep";
/*
 * V2.9 — em Descobrir, "Escolha pra mim" parte dos filtros da página (tipo,
 * gênero, streaming, país, nota mínima, exclusões) em vez de pedir tudo de novo.
 * Só o que o usuário DEFINIU em Descobrir é herdado; o resto mantém o padrão do
 * modal. Exclusivos do modal: estilo, duração, época. Aplicado uma vez por
 * abertura e mostrado no topo ("Usando seus filtros de Descobrir: …").
 */
export type PickInherit = {
  type: "all" | "movie" | "tv";
  genre: string;
  provider: string;
  country: string;
  rating: string;
  hideWatched: boolean;
  onlyNew: boolean;
};

/*
 * Fase 4 (P2-06): este componente é grande e só serve quando o usuário abre
 * "Escolha pra mim". As telas usam PickForMeLauncher (botão leve), que baixa
 * este módulo sob demanda e o monta com `hideTrigger`; `openRequest` (contador)
 * abre o painel a cada clique no botão do launcher. Uso direto continua igual.
 */
export type PickForMeProps = {
  inherit?: PickInherit;
  hideTrigger?: boolean;
  openRequest?: number;
  onMounted?: () => void;
};

export function PickForMe({ inherit, hideTrigger = false, openRequest = 0, onMounted }: PickForMeProps = {}) {
  const toast =
    useToast();

  // Fase 1: visitante é convidado a entrar; 401 nunca vira "Não autenticado".
  const libraryAuth = useLibraryAuth();

  function runGuarded(intent: LibraryIntent | undefined, fallback: string, run: () => Promise<unknown>) {
    if (!libraryAuth.requireUser(intent)) return;

    void run().catch((error) => {
      console.error(error);
      libraryAuth.handleError(error, intent, fallback);
    });
  }

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

  const confirm = useConfirm();

  const [inheritedSummary, setInheritedSummary] = useState<string[]>([]);
  const inheritAppliedRef = useRef(false);

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

    } catch {
      // Intencional: armazenamento local indisponível (modo privado/cheio) — só perde a preferência.
    }
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

        // Fase 2 (P3-11): mesma resposta já carregada pelo Descobrir (sem repetir a requisição).
          const empty = { genres: [], providers: [] };
          const [movieData, tvData] = await Promise.all([
            fetchDiscoverFilters("/api/discover/filters?type=movie").catch(() => empty),
            fetchDiscoverFilters("/api/discover/filters?type=tv").catch(() => empty),
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

  /* V2.9 — herança dos filtros de Descobrir: uma vez por abertura, depois dos metadados */
  useEffect(() => {
    if (!open) {
      inheritAppliedRef.current = false;
      return;
    }

    if (!inherit || !filtersLoaded || inheritAppliedRef.current) return;

    inheritAppliedRef.current = true;

    const summary: string[] = [];

    if (inherit.type !== "all") {
      setType(inherit.type);
      summary.push(inherit.type === "movie" ? "Filmes" : "Séries");
    }

    if (inherit.genre) {
      const id = Number(inherit.genre);
      const genre = filters.genres.find((item) => item.movie_id === id || item.tv_id === id);

      if (genre) {
        setGenres([genre.key]);
        summary.push(genre.name);
      }
    }

    if (/^\d+$/.test(inherit.provider)) {
      const chosen = filters.providers.find((item) => String(item.provider_id) === inherit.provider);

      setProviders([inherit.provider]);
      summary.push(chosen?.provider_name || "streaming escolhido");
    }

    if (inherit.country) {
      setCountry(inherit.country);
      summary.push(COUNTRIES.find(([code]) => code === inherit.country)?.[1] ?? inherit.country);
    }

    if (inherit.rating) {
      setMinRating(inherit.rating);
      summary.push(`nota ${inherit.rating}+`);
    }

    if (inherit.hideWatched) {
      setExcludeWatched(true);
      summary.push("sem assistidos");
    }

    if (inherit.onlyNew) {
      setExcludeLibrary(true);
      summary.push("só fora da Biblioteca");
    }

    setInheritedSummary(summary);
  }, [open, filtersLoaded, inherit, filters]);

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
    } catch {
      // Intencional: armazenamento local indisponível (modo privado/cheio) — só perde a preferência.
    }
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

      const data = await apiFetch(`/api/pick-for-me?${params.toString()}`);

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

      setWinner({
        ...data.winner,
        _reasons: Array.isArray(data.reasons) ? data.reasons : [],
        _personalized: Boolean(data.personalized),
      });

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

      await apiFetch("/api/not-interested", { method: "POST", json: {
                tmdb_id:
                  target.id,

                media_type:
                  target.media_type,

                reason:
                  "not_interested",
              } });

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

              await apiFetch(`/api/not-interested?${params.toString()}`, { method: "DELETE" });

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

      if (!response.ok || data?.error) {
        throw new ApiError(data?.error || "Erro ao adicionar.", { status: response.status });
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

      if (!response.ok || data?.error) {
        throw new ApiError(data?.error || "Erro ao atualizar biblioteca.", { status: response.status });
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

      await removeFromLibrary(winner.library_id);

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

    } finally {
      setProcessing(
        false
      );
    }
  }

  async function requestRemove() {
    const ok = await confirm(removalConfirmOptions(titleOf(winner)));

    if (!ok) return;

    await remove();
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

  function openPicker() {
    setOpen(
      true
    );

    setStep(
      winner
        ? "result"
        : "filters"
    );
  }

  // Fase 4: cada clique no botão do launcher incrementa `openRequest` e abre o painel.
  const lastOpenRequest = useRef(0);

  useEffect(() => {
    if (!openRequest || openRequest === lastOpenRequest.current) return;
    lastOpenRequest.current = openRequest;
    openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a um novo pedido de abertura
  }, [openRequest]);

  useEffect(() => {
    onMounted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avisa uma vez, na montagem
  }, []);

  return (
    <>
      {!hideTrigger && (
        <Button
          type="button"
          className="pick-trigger"
          onClick={openPicker}
        >
          <Shuffle
            size={16}
          />

          Escolha pra mim
        </Button>
      )}

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
  data-rec-tool="pick"
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
              <PickFilterStep
                values={{ type, mode, genres, genreMatch, providers, country, decade, minRating, duration, excludeWatched, excludeLibrary }}
                setters={{
                  setType,
                  setMode,
                  setGenres,
                  setGenreMatch,
                  setProviders,
                  setCountry,
                  setDecade,
                  setMinRating,
                  setDuration,
                  setExcludeWatched,
                  setExcludeLibrary,
                }}
                filters={filters}
                loadingFilters={loadingFilters}
                error={error}
                activeFilters={activeFilters}
                inheritedSummary={inheritedSummary}
                reset={reset}
                pick={pick}
              />
            ) : (
              <PickResultStep
                step={step}
                current={current}
                winner={winner}
                processing={processing}
                openStatus={openStatus}
                runtime={runtime}
                yearLabel={yearLabel}
                actions={{
                  setStep,
                  setOpenStatus,
                  runGuarded,
                  pick,
                  rejectWinner,
                  markNotInterested,
                  addToLibrary,
                  updateStatus,
                  toggleFavorite,
                  updateRating,
                  requestRemove,
                }}
              />
            )}
          </section>
        </div>
      )}

    </>
  );
}

