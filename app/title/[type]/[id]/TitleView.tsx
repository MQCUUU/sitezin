"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Search } from "@/components/Search";
import { SmartBackButton } from "@/components/SmartBackButton";
import type { TitleDetails, TitleType } from "@/lib/title-details";
import { groupEditorialCrew } from "@/lib/title-credits";
import type { Status } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";
import { LIBRARY_ACTION_COPY } from "@/lib/library/remove";
import { fetchLibraryState, type LibraryLookupState } from "@/lib/library/lookup";
import { createMutationQueue, runLibraryAction } from "@/lib/library/actions";
import { apiFetch } from "@/lib/api-client";
import type { LibraryIntent } from "@/lib/auth/pending-action";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { mediaStatusLabel } from "@/lib/media-status";

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
  type RelatedItem,
  CONTENT_TABS,
} from "@/components/title";

const TAB_VALUES = new Set<string>(CONTENT_TABS.map(([value]) => value));

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
  /*
   * V3.1 — aba na URL (?tab=cast|reviews|related; "info" = sem parâmetro):
   * refresh e link direto preservam a aba. `replace` (não push): trocar de
   * aba não enche o histórico — voltar sai da página, como esperado.
   */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const contentTab: ContentTabValue = tabParam && TAB_VALUES.has(tabParam) ? (tabParam as ContentTabValue) : "info";
  const setContentTab = useCallback(
    (value: ContentTabValue) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value === "info") params.delete("tab");
      else params.set("tab", value);

      const query = params.toString();

      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const intentFor = useCallback(
    (kind: "add" | "favorite" | "status", nextStatus?: Status): LibraryIntent => {
      const base = {
        media_type: type,
        tmdb_id: Number(id),
        title: details?.title || details?.name || undefined,
      };

      return kind === "status" && nextStatus
        ? { kind: "status", status: nextStatus, ...base }
        : { kind: kind === "status" ? "add" : kind, ...base };
    },
    [type, id, details]
  );

  const [loading, setLoading] =
    useState(() => !initialDetails);

  const [error, setError] =
    useState<string | null>(null);

  const [saving, setSaving] =
    useState(false);

  /*
   * Fase 0 — estado da consulta à biblioteca. "Não está na biblioteca" só vale
   * depois de uma resposta confirmada ("ready" com item nulo). Enquanto a
   * consulta roda ("loading") ou se ela falhou ("error"), "Adicionar" e
   * "Curtir" não são oferecidos: uma falha de leitura nunca vira "ausente".
   */
  const [libraryLookup, setLibraryLookup] =
    useState<LibraryLookupState>("loading");

  /*
   * Fase 1 — sessão (carregando / visitante / autenticado) e tratamento de 401.
   * Mutações deste título passam por uma fila: a intenção mais recente roda por
   * último (status + Curtir rápidos não se atropelam nem apagam um ao outro).
   */
  const libraryAuth = useLibraryAuth();
  const enqueueMutation = useRef(createMutationQueue()).current;

  /*
   * V3.1 — relê o item da biblioteca (com `library_progress`/`progress`, o
   * mesmo progresso da Biblioteca/Home/Quick View). Usado depois de marcar
   * episódios, mudar status ou adicionar/restaurar: o painel "Seu progresso"
   * nunca calcula nada no client.
   */
  const reloadLibraryItem = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/library?tmdb_id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`,
        { cache: "no-store" }
      );

      if (!response.ok) return;

      const data = await response.json();

      setLibraryItem(data || null);
      if (data?.status) setStatus(data.status);
    } catch {
      /* mantém o estado atual */
    }
  }, [id, type]);

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

  /*
   * Fase 0: aplica um resultado CONFIRMADO da consulta (item ou nulo = ausente).
   * Nunca é chamado quando a consulta falha.
   */
  const applyLibraryResult = useCallback((found: LibraryItem | null) => {
    setLibraryItem(found);

    if (found) {
      setStatus(found.status as Status);

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
  }, []);

  const retryLibraryLookup = useCallback(async () => {
    setLibraryLookup("loading");

    try {
      applyLibraryResult(await fetchLibraryState<LibraryItem>(type, id));
      setLibraryLookup("ready");
    } catch (err) {
      console.error(err);
      setLibraryLookup("error");
    }
  }, [type, id, applyLibraryResult]);

  const load = useCallback(async () => {
    setError(null);

    if (!needsDetails) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/tmdb/${type}/${id}`);
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(
          data?.error || "Não foi possível carregar o título."
        );
      }

      setDetails(data);
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

  /*
   * Fase 1 (P2-03): o estado pessoal só é consultado com sessão. Enquanto a
   * sessão carrega, nada é pedido nem oferecido ("Verificando…"); visitante
   * confirmado não tem estado pessoal (sem GET que daria 401). Fase 0 segue
   * valendo: falha na consulta = "error", nunca "fora da biblioteca".
   */
  useEffect(() => {
    if (libraryAuth.state === "loading") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- espelha o estado da sessão (sistema externo)
      setLibraryLookup("loading");
      return;
    }

    if (libraryAuth.state === "guest") {
      applyLibraryResult(null);
      setLibraryLookup("ready");
      return;
    }

    void retryLibraryLookup();
  }, [libraryAuth.state, applyLibraryResult, retryLibraryLookup]);
  async function addToLibrary() {
    // Fase 0: só adiciona com o estado confirmado (nunca durante/depois de uma falha de leitura).
    if (
      !details ||
      saving ||
      libraryLookup !== "ready" ||
      libraryItem
    ) {
      return;
    }

    // Fase 1: visitante confirmado é convidado a entrar (a intenção é preservada).
    if (!libraryAuth.requireUser(intentFor("add"))) return;

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

      // Fase 1: apiFetch devolve o status HTTP no erro (401 = precisa entrar).
      const result =
        await apiFetch(
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

      /*
       * Fase 0: o servidor nunca altera um item que já existe (adicionado em
       * outra aba, por exemplo). A tela passa a mostrar o que está salvo.
       */
      if (result?.created === false) {
        applyLibraryResult(result);
        void reloadLibraryItem();

        toast.info(
          `${mediaTitle} já estava na sua biblioteca`,
          {
            description:
              "Nada foi alterado: status, curtida, nota e resenha continuam como estavam.",
          }
        );

        return;
      }

      setLibraryItem(
        result
      );
      void reloadLibraryItem();

      toast.success(
        `${mediaTitle} adicionado à biblioteca`,
        {
          description:
            "Status, curtida e nota foram salvos.",

          // V3.1: a ação REMOVE (o Diário registra a remoção) — não é "desfazer".
          actionLabel:
            LIBRARY_ACTION_COPY.addedRemoveLabel,

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
                LIBRARY_ACTION_COPY.addedRemoved
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

      libraryAuth.handleError(error, intentFor("add"), "Erro ao adicionar");
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
          // V3.1: readicionar é uma NOVA entrada (tags e notas por categoria não voltam) — não é "desfazer".
          description:
            LIBRARY_ACTION_COPY.removedDescription,

          actionLabel:
            LIBRARY_ACTION_COPY.readdLabel,

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
              void reloadLibraryItem();

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
                LIBRARY_ACTION_COPY.readded,
                { description: LIBRARY_ACTION_COPY.readdedDescription }
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

      const result =
        await apiFetch(
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

      setLibraryItem(
        (
          current:
            any
        ) => ({
          ...current,
          ...result,
        })
      );

      // Status muda o progresso exibido (ex.: Reassistindo): relê o canônico.
      if (field === "status") void reloadLibraryItem();

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

      // Fase 1: 401 = convite para entrar de novo (com a intenção), nunca "Não autenticado".
      const intent =
        field === "status"
          ? intentFor("status", value)
          : field === "favorite" && value === true
            ? intentFor("favorite")
            : undefined;

      libraryAuth.handleError(error, intent, "Não foi possível salvar");
    }
  }

  /*
   * Fase 1 (P1-05) — título fora da biblioteca: mudar o status ou curtir ADICIONA
   * o título e grava a escolha na hora (nada de rascunho invisível). Usa a
   * criação segura da Fase 0 + PATCH só do campo pedido (lib/library/actions.ts).
   * A tela muda na hora e volta ao estado anterior se a gravação falhar.
   */
  function persistIntentForNewItem(intent: LibraryIntent) {
    if (!libraryAuth.requireUser(intent)) return;

    const snapshot = { status, favorite };

    if (intent.kind === "favorite") setFavorite(true);
    if (intent.kind === "status") setStatus(intent.status as Status);

    void enqueueMutation(async () => {
      try {
        const { item } = await runLibraryAction(intent);

        applyLibraryResult(item as LibraryItem);
        void reloadLibraryItem();

        toast.success(
          intent.kind === "favorite"
            ? "Curtido e adicionado à biblioteca"
            : `Adicionado à biblioteca como ${mediaStatusLabel(item.status)}`
        );
      } catch (error) {
        console.error(error);
        setStatus(snapshot.status);
        setFavorite(snapshot.favorite);
        libraryAuth.handleError(error, intent, "Não foi possível salvar");
      }
    });
  }

  function handleToggleFavorite() {
    // Fase 0: sem estado confirmado, não há o que curtir (o hero também desabilita o botão).
    if (!libraryItem && libraryLookup !== "ready") return;

    const value = !favorite;

    if (!libraryItem) {
      if (value) persistIntentForNewItem(intentFor("favorite"));
      return;
    }

    setFavorite(value);
    void enqueueMutation(() => updateLibrary("favorite", value));
  }

  function handleStatusChange(value: Status) {
    if (!libraryItem && libraryLookup !== "ready") return;

    if (!libraryItem) {
      persistIntentForNewItem(intentFor("status", value));
      return;
    }

    setStatus(value);
    void enqueueMutation(() => updateLibrary("status", value));
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
    // Episódios marcados mudam o progresso: relê a verdade do servidor.
    void reloadLibraryItem();
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
   * DIREÇÃO / ROTEIRO / CRIADORES
   * ============================
   *
   * TV deliberadamente não ganha grupos de Direção/Roteiro nesta fase
   * (C4.3) — direção em TV é frequentemente episódica, e uma lista
   * agregada sem contexto seria ruidosa. TV continua só com creators.
   */
  const editorialCrew =
    type === "movie"
      ? groupEditorialCrew(details.credits?.crew || [])
      : { direction: [], writing: [] };

  const directors: CrewCredit[] = editorialCrew.direction.slice(0, 5);
  const writers: CrewCredit[] = editorialCrew.writing.slice(0, 5);

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
   *
   * C6: já normalizado por sanitizeTitleDetails (RelatedItem[]) — self
   * filter/dedupe/limite acontecem lá. Sem foto NÃO exclui o item (mesma
   * política do elenco desde a C4.2); MediaCard/Poster já tratam fallback.
   */
  const recommendations: RelatedItem[] = details.recommendations || [];

  const tabPanelIdsCtx = {
    hasDirectorsOrCreators: directors.length > 0 || writers.length > 0 || creators.length > 0,
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

      {/* V3.1: identidade e ações do título em TODAS as abas (antes só em "Visão geral" — as outras abas ficavam sem h1). */}
      <TitleHero
        type={type}
        details={details}
        libraryItem={libraryItem}
        favorite={favorite}
        saving={saving}
        libraryLookup={libraryLookup}
        onRetryLibraryLookup={retryLibraryLookup}
        onAddToLibrary={addToLibrary}
        onRemoveFromLibrary={removeFromLibrary}
        onToggleFavorite={handleToggleFavorite}
      />

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
          <TitleOverviewSection
            type={type}
            details={details}
            status={status}
            libraryItem={libraryItem}
            libraryLookup={libraryLookup}
            onStatusChange={handleStatusChange}
          />

          {type === "tv" && (
            <TitleTvSections
              details={details}
              libraryItem={libraryItem}
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
          writers={writers}
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
