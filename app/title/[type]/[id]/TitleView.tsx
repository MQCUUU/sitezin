"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Link from "next/link";

import { Search } from "@/components/Search";
import { SmartBackButton } from "@/components/SmartBackButton";
import { img } from "@/lib/tmdb";
import type { TitleDetails, TitleType } from "@/lib/title-details";

import {
  Heart,
  Star,
  Plus,
  Trash2,
  CalendarDays,
  Clock3,
  Film,
  Tv,
  Play,
  Users,
  UserRound,
  Building2,
  Globe2,
  TrendingUp,
  MessageSquare,
  ExternalLink,
} from "lucide-react";

import type { Status } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { ReviewPanel } from "@/components/ReviewPanel";
import { SeasonProgress } from "@/components/SeasonProgress";
import { WatchHistory } from "@/components/WatchHistory";
import { SeriesSchedule } from "@/components/SeriesSchedule";
import { EpisodeBrowser } from "@/components/EpisodeBrowser";
import { useToast } from "@/components/ToastProvider";
import { CarouselRail } from "@/components/CarouselRail";

interface LibraryItem {
  id: string;
  media: {
    tmdb_id: number;
    media_type: string;
    seasons_count?: number;
    [key: string]: any;
  };
  status: Status;
  favorite: boolean;
  personal_rating: number | null;
  review: string;
  [key: string]: any;
}

interface SeasonProgressUpdate {
  status?: Status;
  [key: string]: any;
}

export type TitleViewProps = {
  type: TitleType;
  id: string;
  initialDetails: TitleDetails | null;
};

const CONTENT_TABS = [
  ["info", "Visão geral"],
  ["cast", "Elenco e equipe"],
  ["reviews", "Avaliações e resenhas"],
  ["related", "Relacionados e mídia"],
] as const;

/*
 * O conteúdo de cada aba ainda está espalhado em múltiplas seções
 * top-level fisicamente intercaladas entre si (histórico da
 * B2/B3 — ex. o painel de histórico de "reviews" fica, no JSX,
 * entre dois painéis de "cast"). Reagrupar isso num único
 * wrapper por aba exigiria mover blocos grandes, fora do escopo
 * da C1.1.6.
 *
 * C1.1.6: em vez de uma lista estática de ids (alguns dos quais
 * nunca chegam a existir no DOM, a depender de guest/auth/dados),
 * `aria-controls` agora é computado a cada render com base nas
 * mesmas condições que decidem o que é de fato renderizado —
 * contém só ids que existem naquele momento. Nenhuma referência
 * órfã.
 */
function getContentTabPanelIds(
  value: (typeof CONTENT_TABS)[number][0],
  ctx: {
    hasDirectorsOrCreators: boolean;
    hasCast: boolean;
    hasCompanies: boolean;
    hasLibraryItem: boolean;
    hasRecommendations: boolean;
  }
): string {
  switch (value) {
    case "info":
      return "title-tabpanel-info";
    case "cast": {
      const ids: string[] = [];
      if (ctx.hasDirectorsOrCreators) ids.push("title-tabpanel-cast-1");
      if (ctx.hasCast) ids.push("title-tabpanel-cast-2");
      if (ctx.hasCompanies) ids.push("title-tabpanel-cast-3");
      /*
       * Espelha exatamente a condição do painel cast-4 no JSX:
       * ele aparece quando não há elenco/diretores/criadores,
       * independente de haver produtoras — os dois painéis
       * podem coexistir.
       */
      if (!ctx.hasCast && !ctx.hasDirectorsOrCreators) {
        ids.push("title-tabpanel-cast-4");
      }
      return ids.join(" ");
    }
    case "reviews":
      return ctx.hasLibraryItem
        ? "title-tabpanel-reviews-1 title-tabpanel-reviews-3"
        : "title-tabpanel-reviews-2";
    case "related":
      return ctx.hasRecommendations
        ? "title-tabpanel-related-2"
        : "title-tabpanel-related-1";
    default:
      return "";
  }
}

export default function TitlePage({
  type,
  id,
  initialDetails,
}: TitleViewProps) {
  const toast =
    useToast();

  const [details, setDetails] = useState<any>(initialDetails);
  const [libraryItem, setLibraryItem] =
    useState<any>(null);

  const [status, setStatus] =
    useState<Status>("want");

  const [rating, setRating] =
    useState("");

  const [review, setReview] =
    useState("");

  const [favorite, setFavorite] =
    useState(false);
  const [contentTab, setContentTab] = useState<"info" | "cast" | "reviews" | "related">("info");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [loading, setLoading] =
    useState(() => !initialDetails);

  const [error, setError] =
    useState<string | null>(null);

  const [saving, setSaving] =
    useState(false);

  const [episodeProgress, setEpisodeProgress] = useState<Record<number, { watched: number; released: number }>>({});
  const handleEpisodeProgress = useCallback((value: { season: number; watched: number; released: number }) => {
    setEpisodeProgress((current) => ({
      ...current,
      [value.season]: { watched: value.watched, released: value.released },
    }));
  }, []);

  /*
   * C1.1: `initialDetails` já veio pronto do Server Component
   * (page.tsx) — não refazemos esse fetch aqui. `needsDetails`
   * só é true no caminho de fallback (o servidor não conseguiu
   * buscar, ex. TMDB fora do ar); nesse caso o client tenta de
   * novo, e é o único cenário em que uma falha de fetch aqui é
   * tratada como erro fatal da página (não há nada para
   * renderizar sem `details`).
   *
   * O fetch de biblioteca é sempre client-side (dado do usuário,
   * não pode vir de uma resposta cacheável do Server Component) e
   * uma falha nele NUNCA bloqueia a página: cai para o estado de
   * convidado (sem item na biblioteca), como já acontecia antes.
   */
  const needsDetails = !initialDetails;

  const load = useCallback(async () => {
    setError(null);

    if (needsDetails) {
      setLoading(true);
    }

    try {
      const [detailsResult, libraryResult] = await Promise.allSettled([
        needsDetails
          ? fetch(`/api/tmdb/${type}/${id}`).then(async (response) => {
              const data = await response.json();
              if (!response.ok || data?.error) {
                throw new Error(
                  data?.error || "Não foi possível carregar o título."
                );
              }
              return data;
            })
          : Promise.resolve(null),

        fetch(
          `/api/library?tmdb_id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`,
          { cache: "no-store" }
        ).then(async (response) => {
          const data = await response.json();
          if (!response.ok || data?.error) {
            throw new Error(data?.error || "Biblioteca indisponível.");
          }
          return data;
        }),
      ]);

      if (needsDetails) {
        if (detailsResult.status === "rejected") {
          throw detailsResult.reason;
        }

        setDetails(detailsResult.value);
      }

      /*
       * Falha aqui é só logada — o usuário ainda vê o título
       * inteiro, só sem saber se já está na biblioteca dele.
       */
      const found =
        libraryResult.status === "fulfilled"
          ? libraryResult.value || null
          : null;

      if (libraryResult.status === "rejected") {
        console.error(libraryResult.reason);
      }

      setLibraryItem(found);

      if (found) {
        setStatus(found.status);

        setRating(
          found.personal_rating !== null &&
            found.personal_rating !== undefined
            ? String(found.personal_rating)
            : ""
        );

        setReview(found.review || "");
        setFavorite(!!found.favorite);
      } else {
        /*
         * Importante ao navegar diretamente
         * de um título para outro sem remontar
         * toda a aplicação.
         */
        setStatus("want");
        setRating("");
        setReview("");
        setFavorite(false);
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar o título."
      );
    } finally {
      setLoading(false);
    }
  }, [type, id, needsDetails]);

  useEffect(() => {
    load();
  }, [load]);

  async function addToLibrary() {
    if (
      !details ||
      saving
    ) {
      return;
    }

    try {
      setSaving(
        true
      );

      const mediaTitle =
        details.title ||
        details.name ||
        "Título";

      const payload = {
        media: {
          ...details,

          id:
            details.id,

          media_type:
            type,

          title:
            mediaTitle,

          original_title:
            details.original_title ||
            details.original_name ||
            mediaTitle,

          genres:
            details.genres ||
            [],

          creator_names:
            (
              details.created_by ||
              []
            ).map(
              (
                person:
                  any
              ) =>
                person.name
            ),

          cast_names:
            (
              details.credits
                ?.cast ||
              []
            )
              .slice(
                0,
                10
              )
              .map(
                (
                  person:
                    any
                ) =>
                  person.name
              ),

          number_of_seasons:
            details.number_of_seasons ||
            null,

          number_of_episodes:
            details.number_of_episodes ||
            null,

          runtime:
            details.runtime ||
            null,

          vote_average:
            details.vote_average ||
            null,

          vote_count:
            details.vote_count ||
            null,
        },

        status,

        favorite,

        personal_rating:
          rating ===
            ""
            ? null
            : Number(
                rating
              ),

        review,
      };

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
              JSON.stringify(
                payload
              ),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Não foi possível adicionar à biblioteca."
        );
      }

      setLibraryItem(
        result
      );

      toast.success(
        `${mediaTitle} adicionado à biblioteca`,
        {
          description:
            "Status, curtida e nota foram salvos.",

          actionLabel:
            "Desfazer",

          onAction:
            async () => {
              const undo =
                await fetch(
                  `/api/library/${result.id}`,
                  {
                    method:
                      "DELETE",
                  }
                );

              const undoData =
                await undo.json();

              if (
                !undo.ok ||
                undoData?.error
              ) {
                throw new Error(
                  undoData?.error ||
                    "Não foi possível desfazer."
                );
              }

              setLibraryItem(
                null
              );

              toast.info(
                "Adição desfeita"
              );
            },
        }
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      toast.error(
        "Erro ao adicionar",
        {
          description:
            error instanceof Error
              ? error.message
              : "Não foi possível adicionar à biblioteca.",
        }
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  async function removeFromLibrary() {
    if (
      !libraryItem ||
      saving
    ) {
      return;
    }

    const snapshot = {
      ...libraryItem,
    };

    const mediaTitle =
      details.title ||
      details.name ||
      "Título";

    try {
      setSaving(
        true
      );

      const response =
        await fetch(
          `/api/library/${libraryItem.id}`,
          {
            method:
              "DELETE",
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Não foi possível remover da biblioteca."
        );
      }

      setLibraryItem(
        null
      );

      toast.success(
        `${mediaTitle} removido da biblioteca`,
        {
          description:
            "Você pode recuperar o item por alguns segundos.",

          actionLabel:
            "Desfazer",

          duration:
            8000,

          onAction:
            async () => {
              const restorePayload = {
                media: {
                  ...details,

                  id:
                    details.id,

                  media_type: type,

                  title:
                    mediaTitle,

                  original_title:
                    details.original_title ||
                    details.original_name ||
                    mediaTitle,

                  genres:
                    details.genres ||
                    [],

                  number_of_seasons:
                    details.number_of_seasons ||
                    null,

                  number_of_episodes:
                    details.number_of_episodes ||
                    null,

                  runtime:
                    details.runtime ||
                    null,

                  vote_average:
                    details.vote_average ||
                    null,

                  vote_count:
                    details.vote_count ||
                    null,
                },

                status:
                  snapshot.status ||
                  "want",

                favorite:
                  Boolean(
                    snapshot.favorite
                  ),

                personal_rating:
                  snapshot.personal_rating ??
                  null,

                review:
                  snapshot.review ||
                  "",
              };

              const undo =
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
                      JSON.stringify(
                        restorePayload
                      ),
                  }
                );

              const restored =
                await undo.json();

              if (
                !undo.ok ||
                restored?.error
              ) {
                throw new Error(
                  restored?.error ||
                    "Não foi possível restaurar o título."
                );
              }

              /*
               * Campos de progresso de série ficam
               * sincronizados novamente via PATCH,
               * porque o POST pode usar defaults.
               */
              if (
                restored?.id &&
                type === "tv"
              ) {
                const progressPatch:
                  Record<
                    string,
                    any
                  > = {};

                if (
                  snapshot.current_season !==
                  undefined
                ) {
                  progressPatch.current_season =
                    snapshot.current_season;
                }

                if (
                  snapshot.completed_seasons !==
                  undefined
                ) {
                  progressPatch.completed_seasons =
                    snapshot.completed_seasons;
                }

                if (
                  snapshot.stopped_season !==
                  undefined
                ) {
                  progressPatch.stopped_season =
                    snapshot.stopped_season;
                }

                if (
                  Object.keys(
                    progressPatch
                  ).length >
                  0
                ) {
                  const progressResponse =
                    await fetch(
                      `/api/library/${restored.id}`,
                      {
                        method:
                          "PATCH",

                        headers: {
                          "Content-Type":
                            "application/json",
                        },

                        body:
                          JSON.stringify(
                            progressPatch
                          ),
                      }
                    );

                  if (
                    progressResponse.ok
                  ) {
                    const updated =
                      await progressResponse.json();

                    setLibraryItem(
                      updated
                    );
                  } else {
                    setLibraryItem(
                      restored
                    );
                  }
                } else {
                  setLibraryItem(
                    restored
                  );
                }
              } else {
                setLibraryItem(
                  restored
                );
              }

              setStatus(
                snapshot.status ||
                "want"
              );

              setFavorite(
                Boolean(
                  snapshot.favorite
                )
              );

              setRating(
                snapshot.personal_rating !==
                  null &&
                snapshot.personal_rating !==
                  undefined
                  ? String(
                      snapshot.personal_rating
                    )
                  : ""
              );

              setReview(
                snapshot.review ||
                ""
              );

              toast.info(
                "Título restaurado"
              );
            },
        }
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      toast.error(
        "Erro ao remover",
        {
          description:
            error instanceof Error
              ? error.message
              : "Não foi possível remover da biblioteca.",
        }
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  async function updateLibrary(
    field:
      string,
    value:
      any
  ) {
    if (
      !libraryItem
    ) {
      return;
    }

    const oldValue =
      libraryItem[
        field
      ];

    const libraryId =
      libraryItem.id;

    try {
      /*
       * Optimistic update.
       */
      setLibraryItem(
        (
          current:
            any
        ) => ({
          ...current,
          [field]:
            value,
        })
      );

      const response =
        await fetch(
          `/api/library/${libraryId}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                [field]:
                  value,
              }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Erro ao atualizar."
        );
      }

      setLibraryItem(
        (
          current:
            any
        ) => ({
          ...current,
          ...result,
        })
      );

      const labels:
        Record<
          string,
          string
        > = {
          status:
            "Status atualizado",

          favorite:
            value
              ? "Adicionado aos curtidos"
              : "Removido dos curtidos",

          personal_rating:
            value ===
              null
              ? "Nota removida"
              : `Sua nota agora é ${Number(
                  value
                ).toFixed(
                  1
                )}`,

          review:
            "Opinião atualizada",
        };

      /*
       * Review normalmente é salva pelo ReviewPanel,
       * então evitamos toast a cada digitação.
       */
      if (
        field !==
        "review"
      ) {
        toast.success(
          labels[
            field
          ] ||
            "Biblioteca atualizada",
          {
            actionLabel:
              "Desfazer",

            onAction:
              async () => {
                const undo =
                  await fetch(
                    `/api/library/${libraryId}`,
                    {
                      method:
                        "PATCH",

                      headers: {
                        "Content-Type":
                          "application/json",
                      },

                      body:
                        JSON.stringify({
                          [field]:
                            oldValue,
                        }),
                    }
                  );

                const undone =
                  await undo.json();

                if (
                  !undo.ok ||
                  undone?.error
                ) {
                  throw new Error(
                    undone?.error ||
                      "Não foi possível desfazer."
                  );
                }

                setLibraryItem(
                  (
                    current:
                      any
                  ) => ({
                    ...current,
                    ...undone,
                  })
                );

                if (
                  field ===
                  "status"
                ) {
                  setStatus(
                    oldValue
                  );
                }

                if (
                  field ===
                  "favorite"
                ) {
                  setFavorite(
                    Boolean(
                      oldValue
                    )
                  );
                }

                if (
                  field ===
                  "personal_rating"
                ) {
                  setRating(
                    oldValue !==
                      null &&
                    oldValue !==
                      undefined
                      ? String(
                          oldValue
                        )
                      : ""
                  );
                }

                toast.info(
                  "Alteração desfeita"
                );
              },
          }
        );
      }
    } catch (
      error
    ) {
      console.error(
        error
      );

      /*
       * Rollback local se o PATCH falhar.
       */
      setLibraryItem(
        (
          current:
            any
        ) => ({
          ...current,
          [field]:
            oldValue,
        })
      );

      if (
        field ===
        "status"
      ) {
        setStatus(
          oldValue
        );
      }

      if (
        field ===
        "favorite"
      ) {
        setFavorite(
          Boolean(
            oldValue
          )
        );
      }

      if (
        field ===
        "personal_rating"
      ) {
        setRating(
          oldValue !==
            null &&
          oldValue !==
            undefined
            ? String(
                oldValue
              )
            : ""
        );
      }

      toast.error(
        "Não foi possível salvar",
        {
          description:
            error instanceof Error
              ? error.message
              : "A alteração foi revertida.",
        }
      );
    }
  }

  if (loading) {
    return (
      <>
        <div className="topbar">
          <Search />
        </div>

        <div className="empty">
          Carregando título...
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="topbar">
          <Search />
        </div>

        <div className="empty">
          <p>{error}</p>
          <button className="btn" onClick={load}>
            Tentar novamente
          </button>
        </div>
      </>
    );
  }

  if (!details?.id) {
    /*
     * Não deveria acontecer em uso normal — type/id inválidos já
     * caem em notFound() no Server Component (page.tsx). Isto é
     * só uma rede de segurança contra um payload inesperado, para
     * nunca deixar a tela presa sem nenhuma indicação ao usuário.
     */
    return (
      <>
        <div className="topbar">
          <Search />
        </div>

        <div className="empty">Título não encontrado.</div>
      </>
    );
  }

  const title =
    details.title ||
    details.name;

  const year = (
    details.first_air_date ||
    details.release_date ||
    ""
  ).slice(0, 4);

  const runtime =
    details.runtime ||
    null;

  const tmdbRating =
    Number(
      details.vote_average || 0
    ).toFixed(1);

  const genres =
    (details.genres || [])
      .map(
        (genre: any) =>
          genre.name
      )
      .join(" · ");

  /*
   * ============================
   * TRAILER
   * ============================
   */

  const trailer =
    details.videos?.results
      ?.filter(
        (video: any) =>
          video.site === "YouTube"
      )
      ?.find(
        (video: any) =>
          video.type === "Trailer" &&
          video.official === true
      ) ||
    details.videos?.results
      ?.filter(
        (video: any) =>
          video.site === "YouTube"
      )
      ?.find(
        (video: any) =>
          video.type === "Trailer"
      ) ||
    details.videos?.results
      ?.find(
        (video: any) =>
          video.site === "YouTube"
      );

  /*
   * ============================
   * ELENCO
   * ============================
   */

  const cast =
    details.credits?.cast
      ?.filter(
        (person: any) =>
          person.profile_path
      )
      ?.slice(0, 12) || [];

  /*
   * ============================
   * DIRETOR / CRIADORES
   * ============================
   */

  const directors =
    type === "movie"
      ? details.credits?.crew
          ?.filter(
            (person: any) =>
              person.job ===
              "Director"
          )
          ?.slice(0, 5) || []
      : [];

  const creators =
    details.created_by || [];

  /*
   * ============================
   * PRODUTORAS
   * ============================
   */

  const companies =
    details.production_companies
      ?.slice(0, 6) || [];

  /*
   * ============================
   * PAÍSES
   * ============================
   */

  const countries =
    details.production_countries ||
    [];

  /*
   * ============================
   * RECOMENDAÇÕES
   * ============================
   */

  const recommendations =
    details.recommendations
      ?.results
      ?.filter(
        (item: any) =>
          item.poster_path
      )
      ?.slice(0, 6) || [];

  /*
   * ============================
   * POPULARIDADE
   * ============================
   */

  const popularity =
    Number(
      details.popularity || 0
    ).toFixed(0);

  /*
   * ============================
   * ONDE ASSISTIR — BRASIL
   * ============================
   */

  const brazilWatch =
    details.watch_providers
      ?.results?.BR ||
    null;

  const streamingProviders =
    Array.isArray(
      brazilWatch?.flatrate
    )
      ? brazilWatch.flatrate
      : [];

  const freeProviders =
    Array.isArray(
      brazilWatch?.free
    )
      ? brazilWatch.free
      : [];

  const adsProviders =
    Array.isArray(
      brazilWatch?.ads
    )
      ? brazilWatch.ads
      : [];

  const rentProviders =
    Array.isArray(
      brazilWatch?.rent
    )
      ? brazilWatch.rent
      : [];

  const buyProviders =
    Array.isArray(
      brazilWatch?.buy
    )
      ? brazilWatch.buy
      : [];

  const subscriptionProviders =
    [
      ...streamingProviders,
      ...freeProviders,
      ...adsProviders,
    ].filter(
      (
        provider: any,
        index: number,
        all: any[]
      ) =>
        all.findIndex(
          (
            item
          ) =>
            item.provider_id ===
            provider.provider_id
        ) === index
    );

  const hasWatchProviders =
    subscriptionProviders.length >
      0 ||
    rentProviders.length >
      0 ||
    buyProviders.length >
      0;

  const tabPanelIdsCtx = {
    hasDirectorsOrCreators: directors.length > 0 || creators.length > 0,
    hasCast: cast.length > 0,
    hasCompanies: companies.length > 0,
    hasLibraryItem: !!libraryItem,
    hasRecommendations: recommendations.length > 0,
  };

  return (
    <>
      <div className="topbar title-topbar">
        <Search />
      </div>

      <div className="title-back-wrap">
        <SmartBackButton />
      </div>

      <nav
        className="title-content-tabs"
        role="tablist"
        aria-label="Seções do título"
      >
        {CONTENT_TABS.map(([value, label], index) => (
          <button
            key={value}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`title-tab-${value}`}
            aria-selected={contentTab === value}
            aria-controls={getContentTabPanelIds(value, tabPanelIdsCtx)}
            tabIndex={contentTab === value ? 0 : -1}
            className={contentTab === value ? "active" : ""}
            onClick={() => setContentTab(value)}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              let nextIndex: number | null = null;

              if (event.key === "ArrowRight") {
                nextIndex = (index + 1) % CONTENT_TABS.length;
              } else if (event.key === "ArrowLeft") {
                nextIndex =
                  (index - 1 + CONTENT_TABS.length) % CONTENT_TABS.length;
              } else if (event.key === "Home") {
                nextIndex = 0;
              } else if (event.key === "End") {
                nextIndex = CONTENT_TABS.length - 1;
              }

              if (nextIndex !== null) {
                event.preventDefault();
                setContentTab(CONTENT_TABS[nextIndex][0]);
                tabRefs.current[nextIndex]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {contentTab === "info" && (
      <div role="tabpanel" id="title-tabpanel-info" aria-labelledby="title-tab-info">

      {/* ============================
          HERO
          ============================ */}

      <section className="title-hero">

        <div
          className="title-hero-backdrop"
          style={{
            backgroundImage: `url(${img(
              details.backdrop_path,
              "w1280"
            )})`,
          }}
        />

        <div className="title-hero-overlay" />

        <div className="title-hero-content">

          <div className="title-poster-wrap">

            <img loading="lazy" decoding="async"
              src={img(
                details.poster_path
              )}
              alt={title}
              className="title-poster"
            />

            {libraryItem && (
              <div className="title-poster-status">
                <span className="status-dot" />
                Na biblioteca
              </div>
            )}

          </div>

          <div className="title-main">

            <div className="title-type">

              {type === "tv" ? (
                <Tv size={15} />
              ) : (
                <Film size={15} />
              )}

              {type === "tv"
                ? "Série"
                : "Filme"}

              {year && (
                <>
                  <span>•</span>
                  {year}
                </>
              )}

            </div>

            <h1>{title}</h1>

            {(details.original_title ||
              details.original_name) &&
              (details.original_title ||
                details.original_name) !== title && (
              <div className="title-original-name">
                {details.original_title ||
                  details.original_name}
              </div>
            )}

            {details.tagline && (
              <p className="title-tagline">
                “{details.tagline}”
              </p>
            )}

            <div className="title-quick-facts">
              {details.status && (
                <span>
                  {details.status}
                </span>
              )}

              {type === "movie" &&
                runtime && (
                <span>
                  {Math.floor(
                    Number(runtime) / 60
                  )}h{" "}
                  {Number(runtime) % 60}min
                </span>
              )}

              {type === "tv" &&
                details.number_of_seasons && (
                <span>
                  {details.number_of_seasons}{" "}
                  {Number(
                    details.number_of_seasons
                  ) === 1
                    ? "temporada"
                    : "temporadas"}
                </span>
              )}

              {details.original_language && (
                <span>
                  {String(
                    details.original_language
                  ).toUpperCase()}
                </span>
              )}
            </div>

            <div className="title-ratings">

              <div className="title-rating tmdb-rating">

                <Star
                  size={18}
                  fill="currentColor"
                />

                <div>
                  <strong>
                    {tmdbRating}
                  </strong>

                  <span>
                    TMDB
                  </span>
                </div>

              </div>

              {libraryItem &&
                libraryItem.personal_rating !==
                  null &&
                libraryItem.personal_rating !==
                  undefined && (
                  <div className="title-rating my-rating">

                    <Star
                      size={18}
                      fill="currentColor"
                    />

                    <div>
                      <strong>
                        {Number(
                          libraryItem.personal_rating
                        ).toFixed(1)}
                      </strong>

                      <span>
                        Minha nota
                      </span>
                    </div>

                  </div>
                )}

            </div>

            <div className="title-actions">

              {!libraryItem ? (
                <button
                  className="btn primary title-main-btn"
                  onClick={
                    addToLibrary
                  }
                  disabled={saving}
                >
                  <Plus size={18} />

                  {saving
                    ? "Adicionando..."
                    : "Adicionar à biblioteca"}
                </button>
              ) : (
                <button
                  className="btn title-main-btn"
                  onClick={
                    removeFromLibrary
                  }
                  disabled={saving}
                >
                  <Trash2 size={18} />

                  {saving
                    ? "Removendo..."
                    : "Remover da biblioteca"}
                </button>
              )}

              <button
                className={
                  favorite
                    ? "btn favorite-btn active"
                    : "btn favorite-btn"
                }
                onClick={() => {
                  const value =
                    !favorite;

                  setFavorite(value);

                  if (libraryItem) {
                    updateLibrary(
                      "favorite",
                      value
                    );
                  }
                }}
              >
                <Heart
                  size={18}
                  fill={
                    favorite
                      ? "currentColor"
                      : "none"
                  }
                />

                {favorite
                  ? "Curtido"
                  : "Curtir"}
              </button>

            </div>

          </div>
        </div>
      </section>

      {/* ============================
          INFORMAÇÕES
          ============================ */}

      <section className="title-info section">

        <div className="title-info-main">

          <div className="title-section-heading">
            <span>Sobre</span>

            <h2>
              {type === "tv"
                ? "Sobre a série"
                : "Sobre o filme"}
            </h2>
          </div>

          <p className="title-overview">
            {details.overview ||
              "Sem sinopse disponível."}
          </p>

          {genres && (
            <div className="title-genres">

              {(details.genres || [])
                .map(
                  (genre: any) => (
                    <span
                      key={genre.id}
                    >
                      {genre.name}
                    </span>
                  )
                )}

            </div>
          )}

          <div className="title-facts">

            <div className="title-fact">

              <CalendarDays
                size={18}
              />

              <div>
                <span>
                  Lançamento
                </span>

                <strong>
                  {(
                    details.first_air_date ||
                    details.release_date ||
                    "—"
                  )
                    .split("-")
                    .reverse()
                    .join("/")}
                </strong>
              </div>

            </div>

            {runtime && (
              <div className="title-fact">

                <Clock3 size={18} />

                <div>
                  <span>
                    Duração
                  </span>

                  <strong>
                    {Math.floor(
                      runtime / 60
                    ) > 0
                      ? `${Math.floor(
                          runtime / 60
                        )}h ${
                          runtime % 60
                        }min`
                      : `${runtime}min`}
                  </strong>
                </div>

              </div>
            )}

            {type === "tv" && (
              <div className="title-fact">

                <Play size={18} />

                <div>
                  <span>
                    Conteúdo
                  </span>

                  <strong>
                    {details.number_of_seasons ||
                      0}{" "}
                    {details.number_of_seasons ===
                    1
                      ? "temporada"
                      : "temporadas"}

                    {" · "}

                    {details.number_of_episodes ||
                      0}{" "}
                    episódios
                  </strong>
                </div>

              </div>
            )}

          </div>

        </div>

        {/* SIDEBAR */}

        <aside className="title-sidebar">

          <div className="title-status-card">

            <div className="title-section-heading">
              <span>
                Minha coleção
              </span>

              <h3>
                Status
              </h3>
            </div>

            <select
              className="title-status-select"
              value={status}
              onChange={(event) => {
                const value =
                  event.target.value as Status;

                setStatus(value);

                if (libraryItem) {
                  updateLibrary(
                    "status",
                    value
                  );
                }
              }}
            >
              {Object.entries(
                STATUS_LABELS
              ).map(
                ([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                )
              )}
            </select>

            {!libraryItem && (
              <p className="title-status-hint">
                Adicione à biblioteca
                para acompanhar o
                status.
              </p>
            )}

          </div>

          {type === "tv" && libraryItem && (
            <SeasonProgress
              libraryItem={libraryItem}
              totalSeasons={Number(details.number_of_seasons || libraryItem?.media?.seasons_count || 0)}
              tvId={Number(details.id)}
              episodeProgress={episodeProgress}
              onChange={(item) => {
                setLibraryItem((current: any) => ({ ...current, ...item }));
                if (item.status) setStatus(item.status);
              }}
            />
          )}

        </aside>

      </section>

      {/* ============================
          PRÓXIMOS EPISÓDIOS
          ============================ */}

      {type === "tv" && (
        <section className="section title-series-schedule-section">
          <SeriesSchedule
            tvId={
              details.id
            }
            libraryItem={
              libraryItem
            }
          />
        </section>
      )}

      {type === "tv" && (
        <section className="section">
          <EpisodeBrowser
            tvId={Number(details.id)}
            libraryItem={libraryItem}
            totalSeasons={Number(details.number_of_seasons || 1)}
            initialSeason={Number(libraryItem?.current_season || 1)}
            onProgressChange={handleEpisodeProgress}
            onLibraryChange={(item) => {
              setLibraryItem((current: any) => ({ ...current, ...item }));
              if (item.status) setStatus(item.status);
            }}
          />
        </section>
      )}

      {/* ============================
          ONDE ASSISTIR
          ============================ */}

      {hasWatchProviders && (
        <section className="section title-watch-section">

          <div className="title-section-heading">
            <span>
              Disponibilidade
            </span>

            <h2>
              Onde assistir no Brasil
            </h2>
          </div>

          <div className="title-watch-panel panel">

            {subscriptionProviders.length >
              0 && (
              <WatchProviderGroup
                title="Streaming"
                description="Incluído em assinatura, gratuito ou com anúncios"
                providers={
                  subscriptionProviders
                }
              />
            )}

            {rentProviders.length >
              0 && (
              <WatchProviderGroup
                title="Aluguel"
                description="Disponível para alugar digitalmente"
                providers={
                  rentProviders
                }
              />
            )}

            {buyProviders.length >
              0 && (
              <WatchProviderGroup
                title="Compra"
                description="Disponível para compra digital"
                providers={
                  buyProviders
                }
              />
            )}

            {brazilWatch?.link && (
              <div className="title-watch-footer">

                <span className="muted">
                  Disponibilidade fornecida pelo TMDB/JustWatch e pode mudar.
                </span>

                <a
                  href={
                    brazilWatch.link
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                >
                  Ver opções

                  <ExternalLink
                    size={15}
                  />
                </a>

              </div>
            )}

          </div>

        </section>
      )}

      {/* ============================
          TRAILER
          ============================ */}

      {trailer && (
        <section className="section">

          <div className="title-section-heading">
            <span>
              Vídeo
            </span>

            <h2>
              Trailer
            </h2>
          </div>

          <div
            className="panel"
            style={{
              overflow: "hidden",
              padding: 0,
              borderRadius: "16px",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16 / 9",
              }}
            >
              <iframe
                src={`https://www.youtube.com/embed/${trailer.key}`}
                title={trailer.name || "Trailer"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: 0,
                }}
              />
            </div>
          </div>

        </section>
      )}

      {/* ============================
          INFORMAÇÕES EXTRAS
          ============================ */}

      <section className="section">

        <div className="title-section-heading">
          <span>
            Detalhes
          </span>

          <h2>
            Informações
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >

          {/* POPULARIDADE */}

          <div
            className="panel"
            style={{
              padding: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <TrendingUp
                size={20}
              />

              <div>
                <span className="muted">
                  Popularidade
                </span>

                <strong
                  style={{
                    display: "block",
                    marginTop: "4px",
                    fontSize: "18px",
                  }}
                >
                  {popularity}
                </strong>
              </div>
            </div>
          </div>

          {/* VOTOS */}

          <div
            className="panel"
            style={{
              padding: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <MessageSquare
                size={20}
              />

              <div>
                <span className="muted">
                  Avaliações no TMDB
                </span>

                <strong
                  style={{
                    display: "block",
                    marginTop: "4px",
                    fontSize: "18px",
                  }}
                >
                  {Number(
                    details.vote_count || 0
                  ).toLocaleString(
                    "pt-BR"
                  )}
                </strong>
              </div>
            </div>
          </div>

          {/* PAÍS */}

          {countries.length > 0 && (
            <div
              className="panel"
              style={{
                padding: "18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <Globe2 size={20} />

                <div>
                  <span className="muted">
                    País de origem
                  </span>

                  <strong
                    style={{
                      display: "block",
                      marginTop: "4px",
                      fontSize: "16px",
                    }}
                  >
                    {countries
                      .map(
                        (country: any) =>
                          country.name
                      )
                      .join(", ")}
                  </strong>
                </div>
              </div>
            </div>
          )}

        </div>

      </section>

      </div>
      )}

      {/* ============================
          DIRETOR / CRIADORES
          ============================ */}

      {contentTab === "cast" && (directors.length > 0 ||
        creators.length > 0) && (
        <div role="tabpanel" id="title-tabpanel-cast-1" aria-labelledby="title-tab-cast">
        <section className="section">

          <div className="title-section-heading">
            <span>
              Produção
            </span>

            <h2>
              Quem está por trás
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >

            {directors.map(
              (person: any) => (
                <Link
                  key={`director-${person.id}`}
                  href={`/person/${person.id}`}
                  className="panel title-person-link"
                  style={{
                    padding: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  {person.profile_path ? (
                    <img loading="lazy" decoding="async"
                      src={img(
                        person.profile_path,
                        "w185"
                      )}
                      alt={person.name}
                      style={{
                        width: "58px",
                        height: "58px",
                        objectFit:
                          "cover",
                        borderRadius:
                          "12px",
                      }}
                    />
                  ) : (
                    <UserRound
                      size={28}
                    />
                  )}

                  <div>
                    <span className="muted">
                      Diretor
                    </span>

                    <strong
                      style={{
                        display:
                          "block",
                        marginTop:
                          "3px",
                      }}
                    >
                      {person.name}
                    </strong>
                  </div>
                </Link>
              )
            )}

            {creators.map(
              (person: any) => (
                <Link
                  key={`creator-${person.id}`}
                  href={`/person/${person.id}`}
                  className="panel title-person-link"
                  style={{
                    padding: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  {person.profile_path ? (
                    <img loading="lazy" decoding="async"
                      src={img(
                        person.profile_path,
                        "w185"
                      )}
                      alt={person.name}
                      style={{
                        width: "58px",
                        height: "58px",
                        objectFit:
                          "cover",
                        borderRadius:
                          "12px",
                      }}
                    />
                  ) : (
                    <UserRound
                      size={28}
                    />
                  )}

                  <div>
                    <span className="muted">
                      Criador
                    </span>

                    <strong
                      style={{
                        display:
                          "block",
                        marginTop:
                          "3px",
                      }}
                    >
                      {person.name}
                    </strong>
                  </div>
                </Link>
              )
            )}

          </div>

        </section>
        </div>
      )}

      {/* ============================
          ELENCO
          ============================ */}

      {contentTab === "cast" && cast.length > 0 && (
        <div role="tabpanel" id="title-tabpanel-cast-2" aria-labelledby="title-tab-cast">
        <section className="section">

          <div className="title-section-heading">
            <span>
              Elenco
            </span>

            <h2>
              Principais atores
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(130px, 1fr))",
              gap: "14px",
            }}
          >

            {cast.map(
              (person: any) => (
                <Link
                  key={person.id}
                  href={`/person/${person.id}`}
                  className="panel title-cast-card"
                  style={{
                    overflow: "hidden",
                    padding: 0,
                  }}
                >

                  {person.profile_path ? (
                    <img loading="lazy" decoding="async"
                      src={img(
                        person.profile_path,
                        "w185"
                      )}
                      alt={person.name}
                      style={{
                        width: "100%",
                        aspectRatio:
                          "2 / 3",
                        objectFit:
                          "cover",
                        display:
                          "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio:
                          "2 / 3",
                        display:
                          "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                      }}
                    >
                      <Users
                        size={32}
                      />
                    </div>
                  )}

                  <div
                    style={{
                      padding: "11px",
                    }}
                  >
                    <strong
                      style={{
                        display:
                          "block",
                        fontSize:
                          "14px",
                      }}
                    >
                      {person.name}
                    </strong>

                    <span className="title-person-open-hint">
                      Ver perfil
                    </span>

                    {person.character && (
                      <span
                        className="muted"
                        style={{
                          display:
                            "block",
                          marginTop:
                            "4px",
                          fontSize:
                            "12px",
                        }}
                      >
                        {person.character}
                      </span>
                    )}
                  </div>

                </Link>
              )
            )}

          </div>

        </section>
        </div>
      )}

      {/* ============================
          PRODUTORAS
          ============================ */}

      {contentTab === "cast" && companies.length > 0 && (
        <div role="tabpanel" id="title-tabpanel-cast-3" aria-labelledby="title-tab-cast">
        <section className="section">

          <div className="title-section-heading">
            <span>
              Produção
            </span>

            <h2>
              Produtoras
            </h2>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >

            {companies.map(
              (company: any) => (
                <div
                  key={company.id}
                  className="panel"
                  style={{
                    padding:
                      "12px 16px",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap: "9px",
                  }}
                >
                  <Building2
                    size={17}
                  />

                  <span>
                    {company.name}
                  </span>
                </div>
              )
            )}

          </div>

        </section>
        </div>
      )}

      {/* ============================
          HISTÓRICO DE VISUALIZAÇÕES
          ============================ */}

      {contentTab === "reviews" && libraryItem && (
        <div role="tabpanel" id="title-tabpanel-reviews-1" aria-labelledby="title-tab-reviews">
        <section className="section title-watch-history-section">
          <WatchHistory
            libraryId={
              libraryItem.id
            }
            mediaType={
              type === "tv"
                ? "tv"
                : "movie"
            }
            currentRating={
              libraryItem.personal_rating !==
                null &&
              libraryItem.personal_rating !==
                undefined
                ? Number(
                    libraryItem.personal_rating
                  )
                : null
            }
            onLibraryItemChange={(
              item
            ) => {
              setLibraryItem(
                (
                  current:
                    any
                ) => ({
                  ...current,
                  ...item,
                })
              );

              if (
                item?.status
              ) {
                setStatus(
                  item.status
                );
              }

              if (
                item?.personal_rating !==
                  null &&
                item?.personal_rating !==
                  undefined
              ) {
                setRating(
                  String(
                    item.personal_rating
                  )
                );
              }
            }}
          />
        </section>
        </div>
      )}

      {/* ============================
          AVALIAÇÃO
          ============================ */}

      {contentTab === "cast" && cast.length === 0 && directors.length === 0 && creators.length === 0 && (
        <div role="tabpanel" id="title-tabpanel-cast-4" aria-labelledby="title-tab-cast">
          <div className="empty">Nenhuma informação de elenco ou equipe disponível.</div>
        </div>
      )}

      {contentTab === "reviews" && !libraryItem && (
        <div role="tabpanel" id="title-tabpanel-reviews-2" aria-labelledby="title-tab-reviews">
          <div className="empty">Adicione este título à biblioteca para registrar sua avaliação e resenha.</div>
        </div>
      )}

      {contentTab === "reviews" && libraryItem && (
        <div role="tabpanel" id="title-tabpanel-reviews-3" aria-labelledby="title-tab-reviews">
        <section className="section title-review-section">

          <div className="title-section-heading">

            <span>
              Sua experiência
            </span>

            <h2>
              Avaliação e opinião
            </h2>

          </div>

          <ReviewPanel
            libraryId={
              libraryItem.id
            }

            initialRating={
              libraryItem.personal_rating !==
                null &&
              libraryItem.personal_rating !==
                undefined
                ? Number(
                    libraryItem.personal_rating
                  )
                : null
            }

            initialReview={
              libraryItem.review || ""
            }

            onRatingChange={(
              value
            ) => {
              setRating(
                value === null
                  ? ""
                  : String(value)
              );
            }}

            onReviewChange={(
              value
            ) => {
              setReview(value);
            }}
          />

        </section>
        </div>
      )}

      {/* ============================
          TÍTULOS SEMELHANTES
          ============================ */}

      {contentTab === "related" && recommendations.length === 0 && (
        <div role="tabpanel" id="title-tabpanel-related-1" aria-labelledby="title-tab-related">
          <div className="empty">Nenhum título relacionado disponível.</div>
        </div>
      )}

      {contentTab === "related" && recommendations.length > 0 && (
        <div role="tabpanel" id="title-tabpanel-related-2" aria-labelledby="title-tab-related">
        <section className="section">

          <div className="title-section-heading">
            <span>
              Recomendações
            </span>

            <h2>
              Você também pode gostar
            </h2>
          </div>

          <CarouselRail className="title-recommendation-carousel">

            {recommendations.map(
              (item: any) => (
                <Link
                  key={`${item.media_type}-${item.id}`}
                  href={`/title/${
                    item.media_type ||
                    type
                  }/${item.id}`}
                  className="panel title-recommendation-card"
                  style={{
                    overflow:
                      "hidden",
                    padding: 0,
                    textDecoration:
                      "none",
                  }}
                >

                  <img loading="lazy" decoding="async"
                    src={img(
                      item.poster_path
                    )}
                    alt={
                      item.title ||
                      item.name
                    }
                    style={{
                      width: "100%",
                      aspectRatio:
                        "2 / 3",
                      objectFit:
                        "cover",
                      display:
                        "block",
                    }}
                  />

                  <div
                    style={{
                      padding:
                        "11px",
                    }}
                  >

                    <strong
                      style={{
                        display:
                          "block",
                        fontSize:
                          "14px",
                      }}
                    >
                      {item.title ||
                        item.name}
                    </strong>

                    <div
                      className="muted"
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap: "4px",
                        marginTop:
                          "5px",
                        fontSize:
                          "12px",
                      }}
                    >
                      <Star
                        size={12}
                        fill="currentColor"
                      />

                      {Number(
                        item.vote_average ||
                          0
                      ).toFixed(1)}
                    </div>

                  </div>

                </Link>
              )
            )}

          </CarouselRail>

        </section>
        </div>
      )}

    </>
  );
}

function WatchProviderGroup({
  title,
  description,
  providers,
}: {
  title: string;
  description: string;
  providers: any[];
}) {
  return (
    <div className="title-watch-group">

      <div className="title-watch-group-head">
        <div>
          <strong>
            {title}
          </strong>

          <span>
            {description}
          </span>
        </div>

        <b>
          {providers.length}
        </b>
      </div>

      <div className="title-watch-providers">

        {providers.map(
          (
            provider: any
          ) => (
            <div
              key={
                provider.provider_id
              }
              className="title-watch-provider"
              title={
                provider.provider_name
              }
            >

              {provider.logo_path ? (
                <img
                  src={img(
                    provider.logo_path,
                    "w92"
                  )}
                  alt={
                    provider.provider_name
                  }
                  loading="lazy"
                />
              ) : (
                <div className="title-watch-provider-fallback">
                  {String(
                    provider.provider_name ||
                      "?"
                  ).slice(
                    0,
                    1
                  )}
                </div>
              )}

              <span>
                {
                  provider.provider_name
                }
              </span>

            </div>
          )
        )}

      </div>

    </div>
  );
}
