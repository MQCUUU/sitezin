"use client";

import { useCallback, useEffect, useState } from "react";

import { Search } from "@/components/Search";
import { SmartBackButton } from "@/components/SmartBackButton";
import type { TitleDetails, TitleType } from "@/lib/title-details";
import type { Status } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";

import {
  TitleCastSection,
  TitleContentTabs,
  TitleErrorState,
  TitleHero,
  TitleLoadingState,
  TitleMissingState,
  TitleOverviewSection,
  TitleReviewsSection,
  TitleRelatedSection,
  TitleStatsSection,
  TitleTrailer,
  TitleTvSections,
  TitleWatchProviders,
  type CastCredit,
  type ContentTabValue,
  type CrewCredit,
  type LibraryItem,
  type LibraryItemUpdate,
  type PersonCredit,
} from "@/components/title";

export type TitleViewProps = {
  type: TitleType;
  id: string;
  initialDetails: TitleDetails | null;
};

export default function TitlePage({
  type,
  id,
  initialDetails,
}: TitleViewProps) {
  const toast =
    useToast();

  const [details, setDetails] = useState<any>(initialDetails);
  const [libraryItem, setLibraryItem] =
    useState<LibraryItem | null>(null);

  const [status, setStatus] =
    useState<Status>("want");

  const [rating, setRating] =
    useState("");

  const [review, setReview] =
    useState("");

  const [favorite, setFavorite] =
    useState(false);
  const [contentTab, setContentTab] = useState<ContentTabValue>("info");

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
                  PersonCredit
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
                    CastCredit
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

  function handleToggleFavorite() {
    const value = !favorite;
    setFavorite(value);

    if (libraryItem) {
      updateLibrary("favorite", value);
    }
  }

  function handleStatusChange(value: Status) {
    setStatus(value);

    if (libraryItem) {
      updateLibrary("status", value);
    }
  }

  /*
   * Usado por SeasonProgress e EpisodeBrowser: ambos só precisam
   * mesclar o item retornado e, se ele trouxer `status`, sincronizar
   * o select de status — exatamente o que os dois faziam inline
   * antes da C1.2.
   */
  function handleLibraryItemMerge(item: LibraryItemUpdate) {
    setLibraryItem((current) => ({ ...(current as any), ...item }));
    if (item?.status) setStatus(item.status);
  }

  /*
   * WatchHistory também sincroniza `rating` quando o item retornado
   * traz personal_rating — os outros consumidores de
   * onLibraryItemChange não precisam disso.
   */
  function handleWatchHistoryChange(item: LibraryItemUpdate) {
    setLibraryItem((current) => ({ ...(current as any), ...item }));

    if (item?.status) {
      setStatus(item.status);
    }

    if (item?.personal_rating !== null && item?.personal_rating !== undefined) {
      setRating(String(item.personal_rating));
    }
  }

  if (loading) {
    return <TitleLoadingState />;
  }

  if (error) {
    return <TitleErrorState message={error} onRetry={load} />;
  }

  if (!details?.id) {
    /*
     * Não deveria acontecer em uso normal — type/id inválidos já
     * caem em notFound() no Server Component (page.tsx). Isto é
     * só uma rede de segurança contra um payload inesperado, para
     * nunca deixar a tela presa sem nenhuma indicação ao usuário.
     */
    return <TitleMissingState />;
  }

  /*
   * ============================
   * ELENCO
   * ============================
   */

  /*
   * A ausência de foto NÃO exclui alguém do elenco exibido (C4.2) —
   * `profile_path` só decide foto vs. fallback dentro do card, nunca
   * quem aparece nem a ordem (que continua a do payload sanitizado).
   */
  const cast: CastCredit[] =
    details.credits?.cast
      ?.slice(0, 12) || [];

  /*
   * ============================
   * DIRETOR / CRIADORES
   * ============================
   */

  const directors: CrewCredit[] =
    type === "movie"
      ? details.credits?.crew
          ?.filter(
            (person: CrewCredit) =>
              person.job ===
              "Director"
          )
          ?.slice(0, 5) || []
      : [];

  const creators: PersonCredit[] =
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

      <TitleContentTabs
        contentTab={contentTab}
        onContentTabChange={setContentTab}
        panelIdsCtx={tabPanelIdsCtx}
      />

      {contentTab === "info" && (
        <div
          role="tabpanel"
          id="title-tabpanel-info"
          aria-labelledby="title-tab-info"
        >
          <TitleHero
            type={type}
            details={details}
            libraryItem={libraryItem}
            favorite={favorite}
            saving={saving}
            onAddToLibrary={addToLibrary}
            onRemoveFromLibrary={removeFromLibrary}
            onToggleFavorite={handleToggleFavorite}
          />

          <TitleOverviewSection
            type={type}
            details={details}
            status={status}
            libraryItem={libraryItem}
            onStatusChange={handleStatusChange}
            episodeProgress={episodeProgress}
            onSeasonProgressChange={handleLibraryItemMerge}
          />

          {type === "tv" && (
            <TitleTvSections
              details={details}
              libraryItem={libraryItem}
              onProgressChange={handleEpisodeProgress}
              onLibraryChange={handleLibraryItemMerge}
            />
          )}

          <TitleWatchProviders details={details} />

          <TitleTrailer details={details} />

          <TitleStatsSection details={details} />
        </div>
      )}

      {contentTab === "cast" && (
        <TitleCastSection
          directors={directors}
          creators={creators}
          cast={cast}
          companies={companies}
        />
      )}

      {contentTab === "reviews" && (
        <TitleReviewsSection
          type={type}
          libraryItem={libraryItem}
          onWatchHistoryChange={handleWatchHistoryChange}
          onRatingChange={(value) =>
            setRating(value === null ? "" : String(value))
          }
          onReviewChange={setReview}
        />
      )}

      {contentTab === "related" && (
        <TitleRelatedSection type={type} recommendations={recommendations} />
      )}
    </>
  );
}
