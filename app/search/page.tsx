"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import {
  Search,
} from "@/components/Search";

import {
  Check,
  ChevronDown,
  Eye,
  Film,
  Heart,
  Loader2,
  Plus,
  Star,
  Trash2,
  Tv,
  UserRound,
  X,
  Layers3,
  SlidersHorizontal,
  Clapperboard,
} from "lucide-react";

import {
  img,
} from "@/lib/tmdb";

import Link from "next/link";
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

type SearchItem = {
  id: number;
  media_type:
    | "movie"
    | "tv";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?:
    | string
    | null;
  backdrop_path?:
    | string
    | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  genre_ids?: number[];
  genres?: any[];
  popularity?: number;
  reason?: string;
  [key: string]: any;
};

type LibraryState = {
  library_id: string;
  tmdb_id: number;
  media_type:
    | "movie"
    | "tv";
  favorite: boolean;
  status:
    string | null;
  personal_rating:
    number | null;
};

type AdvancedMeta = {
  used:
    boolean;
  mode:
    | "person"
    | "director"
    | "collection"
    | "filters"
    | "character"
    | "";
  title:
    string;
  subtitle:
    string;
  person?:
    any;
  collection?:
    any;
};

function normalizeText(
  value: string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function getTitle(
  item:
    SearchItem
) {
  return (
    item.title ||
    item.name ||
    "Sem título"
  );
}

function getStatusLabel(
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

function findStrongPersonMatch(
  query: string,
  rawResults: any[]
) {
  const normalizedQuery =
    normalizeText(
      query
    );

  const people =
    rawResults.filter(
      (
        item
      ) =>
        item.media_type ===
        "person"
    );

  const exact =
    people.find(
      (
        person
      ) =>
        normalizeText(
          person.name ||
            ""
        ) ===
        normalizedQuery
    );

  if (
    exact
  ) {
    return exact;
  }

  const words =
    normalizedQuery
      .split(" ")
      .filter(Boolean);

  if (
    words.length >=
    2
  ) {
    return (
      people.find(
        (
          person
        ) => {
          const name =
            normalizeText(
              person.name ||
                ""
            );

          return (
            name.includes(
              normalizedQuery
            ) ||
            normalizedQuery.includes(
              name
            )
          );
        }
      ) ||
      null
    );
  }

  return null;
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
    const text =
      await response.text();

    throw new Error(
      `A rota ${response.url} não retornou JSON (${response.status}). ${
        text.startsWith(
          "<!DOCTYPE"
        )
          ? "Provavelmente retornou uma página 404/HTML."
          : ""
      }`
    );
  }

  return response.json();
}

const SEARCH_CACHE_TTL =
  30 * 60 * 1000;

type StoredSearchResponse = {
  expiresAt: number;
  data: any;
};

type UserSearchResult = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/*
 * sessionStorage sobrevive ao F5, ao contrário de um cache React/em memória.
 * Os endpoints abaixo só devolvem dados públicos do catálogo, portanto é
 * seguro reaproveitá-los durante a sessão da aba.
 */
async function cachedSearchJson(
  url: string,
  signal: AbortSignal,
) {
  const key = `mycatalog:search:v1:${url}`;

  try {
    const stored =
      sessionStorage.getItem(key);

    if (stored) {
      const cached = JSON.parse(
        stored,
      ) as StoredSearchResponse;

      if (
        cached.expiresAt > Date.now()
      ) {
        return cached.data;
      }

      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage bloqueado/cheio não pode impedir a pesquisa.
  }

  const response = await fetch(url, {
    signal,
  });
  const data = await safeJson(response);

  if (response.ok) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          expiresAt:
            Date.now() + SEARCH_CACHE_TTL,
          data,
        } satisfies StoredSearchResponse),
      );
    } catch {
      // O resultado continua válido mesmo sem cache local.
    }
  }

  return data;
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="section">
          <div className="empty">
            <Loader2
              className="spin"
              size={24}
            />
            Carregando pesquisa...
          </div>
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const toast = useToast();
  const searchParams =
    useSearchParams();

  const query =
    searchParams
      .get("q")
      ?.trim() ||
    "";

  const [
    results,
    setResults,
  ] =
    useState<
      SearchItem[]
    >([]);

  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);

  const [
    library,
    setLibrary,
  ] =
    useState<
      LibraryState[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    personLoading,
    setPersonLoading,
  ] =
    useState(false);

  const [
    processing,
    setProcessing,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    person,
    setPerson,
  ] =
    useState<any>(
      null
    );

  const [
    personCredits,
    setPersonCredits,
  ] =
    useState<
      SearchItem[]
    >([]);

  const [
    advancedMeta,
    setAdvancedMeta,
  ] =
    useState<AdvancedMeta>({
      used:
        false,
      mode:
        "",
      title:
        "",
      subtitle:
        "",
    });

  const [
    advancedLoading,
    setAdvancedLoading,
  ] =
    useState(
      false
    );

  /*
   * ==========================================
   * AÇÕES DOS CARDS
   * ==========================================
   */

  const [
    openLibraryMenu,
    setOpenLibraryMenu,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    previewItem,
    setPreviewItem,
  ] =
    useState<
      SearchItem |
      null
    >(null);

  const [
    previewDetails,
    setPreviewDetails,
  ] =
    useState<any>(
      null
    );

  const [
    previewDetailsLoading,
    setPreviewDetailsLoading,
  ] =
    useState(false);

  const [
    removeTarget,
    setRemoveTarget,
  ] =
    useState<
      SearchItem |
      null
    >(null);

  const [
    skipRemoveConfirm,
    setSkipRemoveConfirm,
  ] =
    useState(false);

  useEffect(() => {
    try {
      setSkipRemoveConfirm(
        localStorage.getItem(
          "mycatalog_skip_remove_confirm"
        ) ===
          "1"
      );
    } catch {
      // localStorage indisponível
    }
  }, []);

  /*
   * Fecha menu de status clicando
   * em qualquer outro lugar da tela.
   */
  useEffect(() => {
    if (
      openLibraryMenu ===
      null
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
          ".discover-library-menu-button"
        ) ||
        target.closest(
          ".discover-library-status-menu"
        )
      ) {
        return;
      }

      setOpenLibraryMenu(
        null
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
    openLibraryMenu,
  ]);

  /*
   * Preview:
   * fecha ESC e trava scroll do body.
   */
  useEffect(() => {
    if (
      !previewItem
    ) {
      return;
    }

    const previous =
      document.body
        .style.overflow;

    document.body
      .style.overflow =
      "hidden";

    function onKeyDown(
      event:
        KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setPreviewItem(
          null
        );
      }
    }

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      document.body
        .style.overflow =
        previous;

      window.removeEventListener(
        "keydown",
        onKeyDown
      );
    };
  }, [
    previewItem,
  ]);

  /*
   * Streaming, gêneros e detalhes
   * só carregam ao abrir o olhinho.
   */
  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      if (
        !previewItem
      ) {
        setPreviewDetails(
          null
        );

        return;
      }

      try {
        setPreviewDetailsLoading(
          true
        );

        const response =
          await fetch(
            `/api/tmdb/${previewItem.media_type}/${previewItem.id}`
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
              "Erro ao carregar detalhes."
          );
        }

        if (
          !cancelled
        ) {
          setPreviewDetails(
            data
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Preview:",
          error
        );

        if (
          !cancelled
        ) {
          setPreviewDetails(
            null
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setPreviewDetailsLoading(
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
    previewItem?.id,
    previewItem?.media_type,
  ]);

  /*
   * ==========================================
   * CARREGAMENTO DA PESQUISA
   * ==========================================
   */

  useEffect(() => {
  const controller =
    new AbortController();

  async function loadLibrary() {
    try {
      const response = await fetch(
        "/api/library",
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        return;
      }

      const data =
        await safeJson(response);

      if (!Array.isArray(data)) {
        return;
      }

      setLibrary(
        data
          .filter(
            (item: any) =>
              item.media?.tmdb_id &&
              item.media?.media_type,
          )
          .map((item: any) => ({
            library_id: String(item.id),
            tmdb_id: Number(
              item.media.tmdb_id,
            ),
            media_type:
              item.media.media_type,
            favorite: Boolean(
              item.favorite,
            ),
            status:
              item.status || null,
            personal_rating:
              item.personal_rating ===
                null ||
              item.personal_rating ===
                undefined
                ? null
                : Number(
                    item.personal_rating,
                  ),
          })),
      );
    } catch (error) {
      if (
        !(
          error instanceof DOMException &&
          error.name === "AbortError"
        )
      ) {
        console.error(
          "Biblioteca da pesquisa:",
          error,
        );
      }
    }
  }

  loadLibrary();

  return () => {
    controller.abort();
  };
}, []);

  useEffect(() => {
  let cancelled =
    false;

  const controller =
    new AbortController();

    if (!query) {
      setResults([]);
      setUserResults([]);
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setPersonLoading(false);
        setPerson(null);
        setPersonCredits([]);
        setAdvancedMeta({
          used:
            false,
          mode:
            "",
          title:
            "",
          subtitle:
            "",
        });

        setAdvancedLoading(
          false
        );

        const usersOnly = query.startsWith("@");
        const catalogQuery = query.replace(/^@+/, "").trim();
        const [searchData, advancedData, usersData] = await Promise.all([
          usersOnly
            ? Promise.resolve({ results: [] })
            : cachedSearchJson(
                `/api/search?q=${encodeURIComponent(catalogQuery)}`,
                controller.signal,
              ),
          usersOnly
            ? Promise.resolve({ handled: false, results: [] })
            : cachedSearchJson(
                `/api/search/advanced?q=${encodeURIComponent(catalogQuery)}`,
                controller.signal,
              ),
          cachedSearchJson(
            `/api/search/users?q=${encodeURIComponent(query)}`,
            controller.signal,
          ),
        ]);

        setUserResults(
          Array.isArray(usersData?.users) ? usersData.users : [],
        );

        const rawResults =
          Array.isArray(
            searchData?.results
          )
            ? searchData.results
            : [];

        const normalResults =
          rawResults.filter(
            (
              item: any
            ) =>
              item.media_type ===
                "movie" ||
              item.media_type ===
                "tv"
          ) as SearchItem[];

        if (
          cancelled
        ) {
          return;
        }

        setResults(
          normalResults
        );

        /*
         * O resolvedor local precisa decidir antes do fallback
         * de pessoa do TMDB. Sem isso, um profissional obscuro
         * com o mesmo nome do personagem encerra a busca cedo.
         */
        if (
          !cancelled &&
          !advancedData?.error &&
          advancedData?.handled &&
          Array.isArray(advancedData.results) &&
          advancedData.results.length > 0
        ) {
          const advancedResults =
            advancedData.results.filter(
              (item: any) =>
                item.media_type === "movie" ||
                item.media_type === "tv"
            );

          if (advancedResults.length > 0) {
            setResults(advancedResults);
            setAdvancedMeta({
              used: true,
              mode: advancedData.mode || "",
              title: advancedData.title || "Busca avançada",
              subtitle:
                advancedData.subtitle ||
                "Resultados encontrados pelo índice local.",
              person: advancedData.person || null,
              collection: advancedData.collection || null,
            });
            setAdvancedLoading(false);
            return;
          }
        }

        /*
         * PESSOAS: 100% TMDB.
         */
        const personMatch =
          findStrongPersonMatch(
            query,
            rawResults
          );

        if (
          personMatch &&
          !cancelled
        ) {
          try {
            setPersonLoading(
              true
            );

            const response =
  await fetch(
    `/api/person/${personMatch.id}/credits`,
    {
      signal: controller.signal,
    },
  );

            const data =
              await safeJson(
                response
              );

            if (
              response.ok &&
              !data?.error
            ) {
              const credits =
                Array.isArray(
                  data.results
                )
                  ? data.results
                  : [];

              setPerson(
                data.person ||
                  personMatch
              );

              setPersonCredits(
                credits
              );

              setResults(
                credits
              );

              return;
            }
          } finally {
            if (
              !cancelled
            ) {
              setPersonLoading(
                false
              );
            }
          }
        }

        /*
         * ======================================
         * BUSCA AVANÇADA TMDB — ZERO IA
         * ======================================
         *
         * diretor Christopher Nolan
         * filmes com Zendaya
         * coleção Harry Potter
         * filmes de terror 2024 nota 7+
         * filmes de ação na Netflix
         */

        try {
          setAdvancedLoading(
            true
          );

          if (
            !cancelled &&
            !advancedData?.error &&
            advancedData?.handled &&
            Array.isArray(
              advancedData.results
            ) &&
            advancedData.results.length >
              0
          ) {
            const advancedResults =
              advancedData.results.filter(
                (
                  item:
                    any
                ) =>
                  item.media_type ===
                    "movie" ||
                  item.media_type ===
                    "tv"
              );

            if (
              advancedResults.length >
              0
            ) {
              setResults(
                advancedResults
              );

              setAdvancedMeta({
                used:
                  true,
                mode:
                  advancedData.mode ||
                  "",
                title:
                  advancedData.title ||
                  "Busca avançada",
                subtitle:
                  advancedData.subtitle ||
                  "Resultados encontrados diretamente no TMDB.",
                person:
                  advancedData.person ||
                  null,
                collection:
                  advancedData.collection ||
                  null,
              });

              /*
               * Busca avançada resolveu:
               * NÃO chama Gemini.
               */
              return;
            }
          }
        } catch (
          error
        ) {
          console.error(
            "Busca avançada:",
            error
          );
        } finally {
          if (
            !cancelled
          ) {
            setAdvancedLoading(
              false
            );
          }
        }

        // A busca comum termina aqui. IA fica exclusiva da pagina Assistente IA.
      } catch (
        error
      ) {
        if (
  error instanceof DOMException &&
  error.name === "AbortError"
) {
  return;
}
        console.error(
          "Pesquisa:",
          error
        );
      } finally {
        if (
          !cancelled
        ) {
          setLoading(false);
          setPersonLoading(false);
          setAdvancedLoading(false);
        }
      }
    }

    load();

    return () => {
  cancelled =
    true;

  controller.abort();
};
  }, [
    query,
  ]);

  function getLibraryItem(
    item:
      SearchItem
  ) {
    return library.find(
      (
        entry
      ) =>
        entry.tmdb_id ===
          Number(
            item.id
          ) &&
        entry.media_type ===
          item.media_type
    );
  }

  function patchLibraryState(
    item:
      SearchItem,
    patch:
      Partial<
        LibraryState
      >
  ) {
    setLibrary(
      (
        current
      ) =>
        current.map(
          (
            entry
          ) =>
            entry.tmdb_id ===
                Number(
                  item.id
                ) &&
              entry.media_type ===
                item.media_type
              ? {
                  ...entry,
                  ...patch,
                }
              : entry
        )
    );
  }

  /*
   * ==========================================
   * ADICIONAR
   * ==========================================
   */

  async function addToLibrary(
    item:
      SearchItem
  ) {
    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      /*
       * Busca os detalhes completos antes de
       * salvar, assim gêneros etc. também ficam
       * corretos no item adicionado pela pesquisa.
       */
      let media =
        item;

      try {
        const detailResponse =
          await fetch(
            `/api/tmdb/${item.media_type}/${item.id}`
          );

        if (
          detailResponse.ok
        ) {
          const detail =
            await safeJson(
              detailResponse
            );

          media = {
            ...item,
            ...detail,
            id:
              item.id,
            media_type:
              item.media_type,
          };
        }
      } catch {
        // Usa o item da busca como fallback.
      }

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
                  ...media,
                  media_type:
                    item.media_type,
                  title:
                    media.title ||
                    media.name ||
                    getTitle(
                      item
                    ),
                  original_title:
                    media.original_title ||
                    media.original_name ||
                    getTitle(
                      item
                    ),
                  genres:
                    media.genres ||
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
            "Não foi possível adicionar."
        );
      }

      setLibrary(
        (
          current
        ) => [
          ...current.filter(
            (
              entry
            ) =>
              !(
                entry.tmdb_id ===
                  Number(
                    item.id
                  ) &&
                entry.media_type ===
                  item.media_type
              )
          ),
          {
            library_id:
              String(
                data.id
              ),
            tmdb_id:
              Number(
                item.id
              ),
            media_type:
              item.media_type,
            favorite:
              Boolean(
                data.favorite
              ),
            status:
              data.status ||
              "want",
            personal_rating:
              data.personal_rating ??
              null,
          },
        ]
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao adicionar."
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  /*
   * ==========================================
   * STATUS
   * ==========================================
   */

  async function updateStatus(
    item:
      SearchItem,
    nextStatus:
      string
  ) {
    const existing =
      getLibraryItem(
        item
      );

    if (
      !existing
    ) {
      return;
    }

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          `/api/library/${existing.library_id}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                status:
                  nextStatus,
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
            "Não foi possível alterar o status."
        );
      }

      patchLibraryState(
        item,
        {
          status:
            data.status ||
            nextStatus,
        }
      );

      setOpenLibraryMenu(
        null
      );
    } catch (
      error
    ) {
      console.error(
        error
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  /*
   * ==========================================
   * FAVORITO
   * ==========================================
   */

  async function toggleFavorite(
    item:
      SearchItem
  ) {
    const existing =
      getLibraryItem(
        item
      );

    if (
      !existing
    ) {
      return;
    }

    const next =
      !existing.favorite;

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          `/api/library/${existing.library_id}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                favorite:
                  next,
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
            "Não foi possível atualizar a curtida."
        );
      }

      patchLibraryState(
        item,
        {
          favorite:
            data.favorite ??
            next,
        }
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  /*
   * ==========================================
   * MINHA NOTA PELO OLHINHO
   * ==========================================
   */

  async function updateRating(
    item:
      SearchItem,
    rating:
      number |
      null
  ) {
    const existing =
      getLibraryItem(
        item
      );

    if (
      !existing
    ) {
      return;
    }

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          `/api/library/${existing.library_id}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                personal_rating:
                  rating,
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
            "Não foi possível alterar sua nota."
        );
      }

      patchLibraryState(
        item,
        {
          personal_rating:
            rating,
        }
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  /*
   * ==========================================
   * REMOVER + MODAL PADRÃO
   * ==========================================
   */

  function requestRemove(
    item:
      SearchItem
  ) {
    if (
      skipRemoveConfirm
    ) {
      performRemove(
        item
      );

      return;
    }

    setRemoveTarget(
      item
    );

    setOpenLibraryMenu(
      null
    );
  }

  async function performRemove(
    item:
      SearchItem
  ) {
    const existing =
      getLibraryItem(
        item
      );

    if (
      !existing
    ) {
      return;
    }

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          `/api/library/${existing.library_id}`,
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
            "Não foi possível remover."
        );
      }

      setLibrary(
        (
          current
        ) =>
          current.filter(
            (
              entry
            ) =>
              entry.library_id !==
              existing.library_id
          )
      );

      setRemoveTarget(
        null
      );

      setOpenLibraryMenu(
        null
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  const movies =
    results.filter(
      (
        item
      ) =>
        item.media_type ===
        "movie"
    );

  const series =
    results.filter(
      (
        item
      ) =>
        item.media_type ===
        "tv"
    );

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="section search-page-shell">
        <div className="eyebrow">{person ? "Pessoa" : "Pesquisa"}</div>

        <h1>
          Resultados para “{
            query
          }”
        </h1>

        {person && (
          <div className="person-search-panel panel">
            <div className="person-search-avatar">
              {person.profile_path ? (
                <img loading="lazy" decoding="async"
                  src={img(
                    person.profile_path,
                    "w185"
                  )}
                  alt={
                    person.name
                  }
                />
              ) : (
                <UserRound
                  size={28}
                />
              )}
            </div>

            <div className="person-search-info">
              <div className="eyebrow">
                Pessoa
              </div>

              <h2>
                {
                  person.name
                }
              </h2>

              <p className="muted">
                {person.known_for_department ===
                "Acting"
                  ? "Ator / Atriz"
                  : person.known_for_department ||
                    "Cinema e TV"}
                {" · "}
                {
                  personCredits.length
                } créditos
              </p>

              <span className="person-search-no-ai">
                100% TMDB · sem uso de IA
              </span>
            </div>
          </div>
        )}

        {advancedMeta.used && (
          <div className="search-advanced-panel panel">

            <div className="search-advanced-icon">
              {advancedMeta.mode ===
              "collection" ? (
                <Layers3
                  size={19}
                />
              ) : advancedMeta.mode ===
                "filters" ? (
                <SlidersHorizontal
                  size={19}
                />
              ) : advancedMeta.mode ===
                "director" ? (
                <Clapperboard
                  size={19}
                />
              ) : (
                <UserRound
                  size={19}
                />
              )}
            </div>

            {advancedMeta.collection
              ?.poster_path && (
              <Link
                href={`/collection/${advancedMeta.collection.id}`}
                className="search-advanced-thumb"
                title={`Abrir ${advancedMeta.collection.name || advancedMeta.title}`}
              >
                <img loading="lazy" decoding="async"
                  src={img(
                    advancedMeta.collection
                      .poster_path,
                    "w185"
                  )}
                  alt={
                    advancedMeta.collection
                      .name ||
                    advancedMeta.title
                  }
                />
              </Link>
            )}

            {advancedMeta.person
              ?.profile_path && (
              <Link
                href={`/person/${advancedMeta.person.id}`}
                className="search-advanced-thumb"
              >
                <img loading="lazy" decoding="async"
                  src={img(
                    advancedMeta.person
                      .profile_path,
                    "w185"
                  )}
                  alt={
                    advancedMeta.person
                      .name
                  }
                />
              </Link>
            )}

            <div className="search-advanced-copy">
              <div className="search-advanced-head">
                <span className="eyebrow">
                  BUSCA AVANÇADA
                </span>

                <span className="search-no-ai-badge">
                  100% TMDB · sem IA
                </span>
              </div>

              <h2>
                {
                  advancedMeta.title
                }
              </h2>

              <p className="muted">
                {
                  advancedMeta.subtitle
                }
              </p>

              <div className="search-advanced-links">
                {advancedMeta.person && (
                  <Link
                    href={`/person/${advancedMeta.person.id}`}
                    className="search-advanced-profile-link"
                  >
                    Ver perfil de{" "}
                    {
                      advancedMeta.person.name
                    }
                  </Link>
                )}

                {advancedMeta.collection && (
                  <Link
                    href={`/collection/${advancedMeta.collection.id}`}
                    className="search-advanced-profile-link search-advanced-collection-link"
                  >
                    <Layers3
                      size={14}
                    />
                    Abrir coleção completa
                  </Link>
                )}
              </div>
            </div>

          </div>
        )}

        {loading ||
        personLoading ||
        advancedLoading ? (
          <div className="empty">
            <Loader2
              className="spin"
              size={24}
            />
            Carregando resultados...
          </div>
        ) : results.length === 0 && userResults.length === 0 ? (
          <div className="empty">
            Nenhum título ou usuário encontrado.
          </div>
        ) : (
          <>
            {userResults.length > 0 && (
              <section className="search-users-section" aria-labelledby="search-users-title">
                <div className="section-title-row">
                  <h2 id="search-users-title">Usuários</h2>
                  <span className="muted">{userResults.length} encontrados</span>
                </div>
                <div className="search-users-grid">
                  {userResults.map((user) => (
                    <Link
                      className="search-user-card panel"
                      href={`/u/${user.username}`}
                      key={user.id}
                    >
                      <div className="search-user-avatar">
                        {user.avatar_url ? (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={user.avatar_url}
                            alt={user.display_name || user.username}
                          />
                        ) : (
                          <UserRound size={24} />
                        )}
                      </div>
                      <div className="search-user-copy">
                        <strong>{user.display_name || user.username}</strong>
                        <span>@{user.username}</span>
                      </div>
                      <span className="search-user-open">Ver perfil</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {movies.length >
              0 && (
              <SearchSection
                title={
                  person
                    ? `Filmes com ${person.name}`
                    : advancedMeta.used &&
                        advancedMeta.mode ===
                          "collection"
                      ? "Filmes da coleção"
                      : advancedMeta.used &&
                          advancedMeta.mode ===
                            "director"
                        ? "Filmes"
                        : "Filmes"
                }
                items={
                  movies
                }
                library={
                  library
                }
                processing={
                  processing
                }
                openLibraryMenu={
                  openLibraryMenu
                }
                setOpenLibraryMenu={
                  setOpenLibraryMenu
                }
                setPreviewItem={
                  setPreviewItem
                }
                getLibraryItem={
                  getLibraryItem
                }
                addToLibrary={
                  addToLibrary
                }
                updateStatus={
                  updateStatus
                }
                toggleFavorite={
                  toggleFavorite
                }
                requestRemove={
                  requestRemove
                }
              />
            )}

            {series.length >
              0 && (
              <SearchSection
                title={
                  person
                    ? `Séries com ${person.name}`
                    : "Séries"
                }
                items={
                  series
                }
                library={
                  library
                }
                processing={
                  processing
                }
                openLibraryMenu={
                  openLibraryMenu
                }
                setOpenLibraryMenu={
                  setOpenLibraryMenu
                }
                setPreviewItem={
                  setPreviewItem
                }
                getLibraryItem={
                  getLibraryItem
                }
                addToLibrary={
                  addToLibrary
                }
                updateStatus={
                  updateStatus
                }
                toggleFavorite={
                  toggleFavorite
                }
                requestRemove={
                  requestRemove
                }
              />
            )}
          </>
        )}
      </div>

      {previewItem && (
        <SearchPreview
          item={
            previewItem
          }
          details={
            previewDetails
          }
          detailsLoading={
            previewDetailsLoading
          }
          libraryItem={
            getLibraryItem(
              previewItem
            )
          }
          processing={
            processing
          }
          onClose={() =>
            setPreviewItem(
              null
            )
          }
          onAdd={
            addToLibrary
          }
          onRating={
            updateRating
          }
        />
      )}

      {removeTarget && (
        <div
          className="mycatalog-confirm-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setRemoveTarget(
                null
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
                Remover da biblioteca
              </div>

              <h3>
                Remover “{
                  getTitle(
                    removeTarget
                  )
                }”?
              </h3>

              <p className="muted">
                O título será removido da sua biblioteca.
                Você poderá adicioná-lo novamente depois.
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
                  setRemoveTarget(
                    null
                  )
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn danger"
                disabled={
                  processing ===
                  `${removeTarget.media_type}-${removeTarget.id}`
                }
                onClick={() =>
                  performRemove(
                    removeTarget
                  )
                }
              >
                <Trash2
                  size={16}
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

function SearchSection({
  title,
  items,
  processing,
  openLibraryMenu,
  setOpenLibraryMenu,
  setPreviewItem,
  getLibraryItem,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  return (
    <section className="section search-results-section">
      <div className="section-head">
        <div>
          <h2>
            {
              title
            }
          </h2>
        </div>

        <span className="muted">
          {items.length} resultados
        </span>
      </div>

      {/*
        Mesma classe do Descobrir:
        visual, espaçamento e cards iguais.
      */}
      <div className="discover-grid">
        {items.map(
          (
            item:
              SearchItem
          ) => {
            const title =
              getTitle(
                item
              );

            const year =
              (
                item.release_date ||
                item.first_air_date ||
                ""
              ).slice(0, 4);

            const key =
              `${item.media_type}-${item.id}`;

            const existing =
              getLibraryItem(
                item
              );

            const busy =
              processing ===
              key;

            const menuOpen =
              openLibraryMenu ===
              key;

            return (
              <article
                key={
                  key
                }
                className="card discover-card"
              >
                <div className="poster">
                  <Link
                    href={`/title/${item.media_type}/${item.id}`}
                  >
                    <img
                      src={img(
                        item.poster_path
                      )}
                      alt={
                        title
                      }
                      loading="lazy"
                    />
                  </Link>

                  <span className="badge">
                    {item.media_type ===
                    "tv"
                      ? "SÉRIE"
                      : "FILME"}
                  </span>

                  <div className="card-actions">
                    {/* OLHINHO */}
                    <button
                      type="button"
                      className="card-action"
                      title="Ver rápido"
                      aria-label={`Ver detalhes rápidos de ${title}`}
                      onClick={(
                        event
                      ) => {
                        event.preventDefault();
                        event.stopPropagation();

                        setPreviewItem(
                          item
                        );
                      }}
                    >
                      <Eye
                        size={17}
                      />
                    </button>

                    {/* + / STATUS */}
                    {existing ? (
                      <button
                        type="button"
                        className="card-action active discover-library-menu-button"
                        title="Alterar status"
                        disabled={
                          busy
                        }
                        onMouseDown={(
                          event
                        ) =>
                          event.preventDefault()
                        }
                        onClick={(
                          event
                        ) => {
                          event.preventDefault();
                          event.stopPropagation();

                          setOpenLibraryMenu(
                            menuOpen
                              ? null
                              : key
                          );
                        }}
                      >
                        {busy ? (
                          <Loader2
                            size={16}
                            className="spin"
                          />
                        ) : (
                          <>
                            <Check
                              size={16}
                            />
                            <ChevronDown
                              size={12}
                            />
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="card-action add"
                        title="Adicionar como Quero assistir"
                        disabled={
                          busy
                        }
                        onClick={(
                          event
                        ) => {
                          event.preventDefault();
                          event.stopPropagation();

                          addToLibrary(
                            item
                          );
                        }}
                      >
                        {busy ? (
                          <Loader2
                            size={17}
                            className="spin"
                          />
                        ) : (
                          <Plus
                            size={18}
                          />
                        )}
                      </button>
                    )}

                    {/* FAVORITO */}
                    {existing && (
                      <button
                        type="button"
                        className={
                          "card-action discover-favorite-button " +
                          (existing.favorite
                            ? "active"
                            : "")
                        }
                        title={
                          existing.favorite
                            ? "Remover dos curtidos"
                            : "Curtir título"
                        }
                        disabled={
                          busy
                        }
                        onClick={(
                          event
                        ) => {
                          event.preventDefault();
                          event.stopPropagation();

                          toggleFavorite(
                            item
                          );
                        }}
                      >
                        <Heart
                          size={16}
                          fill={
                            existing.favorite
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    )}
                  </div>

                  {/* TAG DO STATUS */}
                  {existing && (
                    <span className="discover-status-badge">
                      {getStatusLabel(
                        existing.status
                      )}
                    </span>
                  )}
                </div>

                {/* MENU STATUS */}
                {existing &&
                  menuOpen && (
                  <div
                    className="discover-library-status-menu"
                    onMouseDown={(
                      event
                    ) =>
                      event.stopPropagation()
                    }
                  >
                    <div className="discover-library-status-menu-head">
                      <span>
                        Status
                      </span>

                      <strong>
                        {getStatusLabel(
                          existing.status
                        )}
                      </strong>
                    </div>

                    <div className="discover-library-status-options">
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
                              existing.status ===
                              value
                                ? "active"
                                : ""
                            }
                            disabled={
                              busy
                            }
                            onMouseDown={(
                              event
                            ) =>
                              event.preventDefault()
                            }
                            onClick={() =>
                              updateStatus(
                                item,
                                value
                              )
                            }
                          >
                            <span>
                              {
                                label
                              }
                            </span>

                            {existing.status ===
                              value && (
                              <Check
                                size={14}
                              />
                            )}
                          </button>
                        )
                      )}
                    </div>

                    <div className="discover-library-status-divider" />

                    <button
                      type="button"
                      className="discover-library-remove"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        requestRemove(
                          item
                        )
                      }
                    >
                      <Trash2
                        size={15}
                      />
                      Remover da biblioteca
                    </button>
                  </div>
                )}

                <Link
                  href={`/title/${item.media_type}/${item.id}`}
                  className="card-title"
                >
                  {
                    title
                  }
                </Link>

                <div className="card-meta">
                  <span>
                    {year ||
                      "—"}
                  </span>

                  {Number(
                    item.vote_average ||
                      0
                  ) >
                    0 && (
                    <span className="rating">
                      <Star
                        size={12}
                        fill="currentColor"
                      />
                      {Number(
                        item.vote_average
                      ).toFixed(
                        1
                      )}
                    </span>
                  )}
                </div>

                {item.reason && (
                  <p className="smart-search-reason">
                    {
                      item.reason
                    }
                  </p>
                )}
              </article>
            );
          }
        )}
      </div>
    </section>
  );
}

function SearchPreview({
  item,
  details,
  detailsLoading,
  libraryItem,
  processing,
  onClose,
  onAdd,
  onRating,
}: {
  item:
    SearchItem;
  details:
    any;
  detailsLoading:
    boolean;
  libraryItem:
    LibraryState |
    undefined;
  processing:
    string |
    null;
  onClose:
    () => void;
  onAdd:
    (
      item:
        SearchItem
    ) =>
      Promise<void>;
  onRating:
    (
      item:
        SearchItem,
      rating:
        number |
        null
    ) =>
      Promise<void>;
}) {
  const title =
    getTitle(
      item
    );

  const year =
    (
      item.release_date ||
      item.first_air_date ||
      details?.release_date ||
      details?.first_air_date ||
      ""
    ).slice(0, 4);

  const genres =
    Array.isArray(
      details?.genres
    )
      ? details.genres
      : [];

  const key =
    `${item.media_type}-${item.id}`;

  const busy =
    processing ===
    key;

  return (
    <div
      className="discover-preview-backdrop"
      role="presentation"
      onMouseDown={(
        event
      ) => {
        /*
         * Clicar em qualquer lugar fora
         * do modal fecha o olhinho.
         */
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="panel discover-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes rápidos de ${title}`}
      >
        <button
          type="button"
          className="discover-preview-close"
          title="Fechar"
          onClick={
            onClose
          }
        >
          <X
            size={18}
          />
        </button>

        <div className="discover-preview-poster">
          <img loading="lazy" decoding="async"
            src={img(
              item.poster_path ||
              details?.poster_path
            )}
            alt={
              title
            }
          />
        </div>

        <div className="discover-preview-content">
          <div className="eyebrow">
            {item.media_type ===
            "tv"
              ? "Série"
              : "Filme"}
          </div>

          <h2>
            {
              title
            }
          </h2>

          <div className="discover-preview-meta">
            <span>
              {year ||
                "Ano não informado"}
            </span>

            {Number(
              item.vote_average ||
                details?.vote_average ||
                0
            ) >
              0 && (
              <span className="rating">
                <Star
                  size={14}
                  fill="currentColor"
                />
                {Number(
                  item.vote_average ||
                    details?.vote_average
                ).toFixed(
                  1
                )}
              </span>
            )}

            {libraryItem && (
              <span className="in-library">
                <Check
                  size={13}
                />
                {getStatusLabel(
                  libraryItem.status
                )}
              </span>
            )}
          </div>

          {genres.length >
            0 && (
            <div className="discover-preview-genres">
              {genres.map(
                (
                  genre:
                    any
                ) => (
                  <span
                    key={
                      genre.id ||
                      genre.name
                    }
                  >
                    {
                      genre.name
                    }
                  </span>
                )
              )}
            </div>
          )}

          {/* STREAMING */}
          <PreviewWatchProviders
            details={
              details
            }
            loading={
              detailsLoading
            }
          />

          {/* MINHA NOTA */}
          {libraryItem && (
            <div className="preview-personal-rating">
              <div className="preview-personal-rating-head">
                <span>
                  Minha nota
                </span>

                <strong>
                  {libraryItem.personal_rating !==
                    null
                    ? Number(
                        libraryItem.personal_rating
                      ).toFixed(
                        1
                      )
                    : "Sem nota"}
                </strong>
              </div>

              <div className="preview-rating-options">
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
                          libraryItem.personal_rating
                        ) ===
                        value
                          ? "active"
                          : ""
                      }
                      disabled={
                        busy
                      }
                      onClick={() =>
                        onRating(
                          item,
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
                    busy
                  }
                  onClick={() =>
                    onRating(
                      item,
                      null
                    )
                  }
                >
                  Limpar
                </button>
              </div>
            </div>
          )}

          <p className="discover-preview-overview">
            {details?.overview?.trim() ||
              item.overview?.trim() ||
              "Ainda não há sinopse disponível para este título."}
          </p>

          <div className="discover-preview-actions">
            <Link
              href={`/title/${item.media_type}/${item.id}`}
              className="btn primary"
            >
              Ver página completa
            </Link>

            {!libraryItem && (
              <button
                type="button"
                className="btn"
                disabled={
                  busy
                }
                onClick={() =>
                  onAdd(
                    item
                  )
                }
              >
                {busy ? (
                  <Loader2
                    size={16}
                    className="spin"
                  />
                ) : (
                  <Plus
                    size={17}
                  />
                )}

                Quero assistir
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewWatchProviders({
  details,
  loading,
}: {
  details:
    any;
  loading:
    boolean;
}) {
  if (
    loading
  ) {
    return (
      <div className="preview-watch-box">
        <span className="muted">
          Carregando onde assistir...
        </span>
      </div>
    );
  }

  const brazil =
    details?.watch_providers
      ?.results?.BR ||
    null;

  if (
    !brazil
  ) {
    return null;
  }

  const subscription =
    [
      ...(Array.isArray(
        brazil.flatrate
      )
        ? brazil.flatrate
        : []),
      ...(Array.isArray(
        brazil.free
      )
        ? brazil.free
        : []),
      ...(Array.isArray(
        brazil.ads
      )
        ? brazil.ads
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
      brazil.rent
    )
      ? brazil.rent
      : [];

  const buy =
    Array.isArray(
      brazil.buy
    )
      ? brazil.buy
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
    <div className="preview-watch-box">
      <div className="preview-watch-head">
        Onde assistir no Brasil
      </div>

      {subscription.length >
        0 && (
        <PreviewWatchRow
          label="Streaming"
          providers={
            subscription
          }
        />
      )}

      {rent.length >
        0 && (
        <PreviewWatchRow
          label="Aluguel"
          providers={
            rent
          }
        />
      )}

      {buy.length >
        0 && (
        <PreviewWatchRow
          label="Compra"
          providers={
            buy
          }
        />
      )}
    </div>
  );
}

function PreviewWatchRow({
  label,
  providers,
}: {
  label:
    string;
  providers:
    any[];
}) {
  return (
    <div className="preview-watch-row">
      <strong>
        {
          label
        }
      </strong>

      <div className="preview-watch-provider-list">
        {providers.map(
          (
            provider
          ) => (
            <div
              key={
                provider.provider_id
              }
              className="preview-watch-provider"
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
