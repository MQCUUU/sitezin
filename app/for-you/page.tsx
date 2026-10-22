"use client";


import "@/styles/features/for-you.css";
import { removeFromLibrary } from "@/lib/library/actions";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { apiFetch } from "@/lib/api-client";
import { MediaPosterActions } from "@/components/media/MediaPosterActions";
import { MediaPosterTags } from "@/components/media/MediaBadges";
import { getLibraryVersion } from "@/lib/library-cache";
import { authClient } from "@/lib/auth/client";
import { Poster } from "@/components/Poster";
import { SmartQueue } from "@/components/SmartQueue";
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_FOR_YOU_QUERY, parseForYouQuery, serializeForYouQuery, type ForYouQuery } from "@/lib/for-you/url";

import {
  Bot,
  CalendarDays,
  ChevronDown,
  Film,
  Filter,
  Gem,
  Loader2,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Tv,
  X,
} from "lucide-react";
import { CarouselRail } from "@/components/CarouselRail";

import Link from "next/link";

import {
  Search,
} from "@/components/Search";

import {
} from "@/lib/tmdb";

import { MediaPreviewDialog } from "@/components/media/preview/MediaPreviewDialog";
import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { fromLooseMediaItem } from "@/components/media/preview/adapters";
import { normalizeWatchProviders } from "@/components/media/providers";

/*
 * Cache do Para você (sessionStorage). `v2`: a v1 foi gravada por versões
 * anteriores; qualquer entrada v1 é ignorada e removida (AccountMenu limpa
 * tudo que começa com `mycatalog:foryou:` fora do prefixo atual).
 */
const FOR_YOU_CACHE_PREFIX = "mycatalog:foryou:v2:";

/*
 * Nunca reaproveita um cache cujo formato não seja exatamente o que a tela
 * consome: prateleiras com `results` de objetos que têm id e tipo de mídia.
 * Campos de imagem ausentes/nulos são OK (o Poster usa o placeholder).
 */
function isValidForYouPayload(data: any): boolean {
  return (
    !!data &&
    Array.isArray(data.shelves) &&
    data.shelves.every(
      (shelf: any) =>
        shelf &&
        typeof shelf.id === "string" &&
        Array.isArray(shelf.results) &&
        shelf.results.every(
          (item: any) =>
            item &&
            (typeof item.id === "number" || typeof item.id === "string") &&
            (item.media_type === "movie" || item.media_type === "tv") &&
            (item.poster_path === undefined || item.poster_path === null || typeof item.poster_path === "string")
        )
    )
  );
}


type Shelf = {
  id: string;
  kind?: string;
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

type FilterData = {
  genres:
    string[];
  providers:
    {
      id: string;
      name: string;
    }[];
};

type LibraryItem = {
  library_id: string;
  tmdb_id: number;
  media_type:
    | "movie"
    | "tv";
  favorite: boolean;
  status:
    string |
    null;
  personal_rating:
    number |
    null;
};


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
          ? "Provavelmente retornou HTML/404."
          : ""
      }`
    );
  }

  return response.json();
}

export default function ForYouPage() {
  // Fase 6: erros das ações de biblioteca (401 = "Sua sessão expirou", resto = aviso amigável).
  const libraryAuth = useLibraryAuth();
  const [
    shelves,
    setShelves,
  ] =
    useState<
      Shelf[]
    >([]);

  const [
    basedOn,
    setBasedOn,
  ] =
    useState<
      string[]
    >([]);

  const [
    profileGenres,
    setProfileGenres,
  ] =
    useState<
      string[]
    >([]);

  const [
    filters,
    setFilters,
  ] =
    useState<FilterData>({
      genres:
        [],
      providers:
        [],
    });

  const [
    library,
    setLibrary,
  ] =
    useState<
      LibraryItem[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    loadingMore,
    setLoadingMore,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    hasMore,
    setHasMore,
  ] =
    useState(true);

  const [
    filtersOpen,
    setFiltersOpen,
  ] =
    useState(false);

  /*
   * V2.8 — filtros na URL (fonte única): refresh, voltar e avançar mantêm o
   * contexto. Mudança explícita (aba, select, toggle) = push; o campo de ano,
   * digitado, usa replace e só grava quando o ano está completo.
   */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useMemo(() => parseForYouQuery(searchParams), [searchParams]);
  const { type, genre, provider, minRating, sort, hideWatched, onlyNew } = query;
  const year = query.year;

  function changeQuery(patch: Partial<ForYouQuery>, mode: "push" | "replace" = "push") {
    const qs = serializeForYouQuery({ ...query, ...patch });

    if (qs === searchParams.toString()) return;
    router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const setType = (value: ForYouQuery["type"]) => changeQuery({ type: value });
  const setGenre = (value: string) => changeQuery({ genre: value });
  const setProvider = (value: string) => changeQuery({ provider: value });
  const setMinRating = (value: string) => changeQuery({ minRating: value });
  const setSort = (value: string) => changeQuery({ sort: value as ForYouQuery["sort"] });
  const setHideWatched = (value: boolean | ((current: boolean) => boolean)) =>
    changeQuery({ hideWatched: typeof value === "function" ? value(hideWatched) : value });
  const setOnlyNew = (value: boolean | ((current: boolean) => boolean)) =>
    changeQuery({ onlyNew: typeof value === "function" ? value(onlyNew) : value });

  /* ano digitado: rascunho local; vai para a URL (replace) quando completo ou vazio */
  const [yearDraft, setYearDraft] = useState(year);

  useEffect(() => {
    setYearDraft(year);
  }, [year]);

  function setYear(value: string) {
    setYearDraft(value);
    if (value === "" || /^(19|20)\d{2}$/.test(value)) changeQuery({ year: value }, "replace");
  }

  /* V2.8 — nível do perfil (cold start honesto) */
  const [profileLevel, setProfileLevel] = useState<"cold" | "warm" | "full" | null>(null);



  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const userId: string | undefined = sessionData?.user?.id;


  /* V2.1-E — "Nos meus serviços" ativo sem serviços configurados. */
  const [
    needsStreamingSetup,
    setNeedsStreamingSetup,
  ] =
    useState(false);






  const [
    openMenu,
    setOpenMenu,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    previewItem,
    setPreviewItem,
  ] =
    useState<any>(
      null
    );

  const [
    previewDetails,
    setPreviewDetails,
  ] =
    useState<any>(
      null
    );

  const [
    previewLoading,
    setPreviewLoading,
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
    removeTarget,
    setRemoveTarget,
  ] =
    useState<any>(
      null
    );

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
      // Intencional: armazenamento local indisponível (modo privado/cheio) — só perde a preferência.
    }
  }, []);

  useEffect(() => {
    if (
      !openMenu
    ) {
      return;
    }

    function closeOutside(
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
          ".fy-status-trigger"
        ) ||
        target.closest(
          ".fy-status-menu"
        )
      ) {
        return;
      }

      setOpenMenu(
        null
      );
    }

    document.addEventListener(
      "mousedown",
      closeOutside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        closeOutside
      );
  }, [
    openMenu,
  ]);

  /*
   * Escape/scroll-lock for previewItem now come from MediaPreviewDialog's
   * underlying Dialog (C2.3) — this effect used to duplicate that.
   */

  useEffect(() => {
    let cancelled =
      false;

    async function loadPreview() {
      if (
        !previewItem
      ) {
        setPreviewDetails(
          null
        );

        return;
      }

      try {
        setPreviewLoading(
          true
        );

        const data = await apiFetch(`/api/tmdb/${previewItem.media_type}/${previewItem.id}`);

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
          setPreviewLoading(
            false
          );
        }
      }
    }

    loadPreview();

    return () => {
      cancelled =
        true;
    };
  }, [
    previewItem?.id,
    previewItem?.media_type,
  ]);

  const activeFilterCount =
    useMemo(
      () =>
        [
          genre,
          provider,
          minRating,
          year,
          sort !==
          "recommended",
          hideWatched,
          onlyNew,
        ].filter(
          Boolean
        ).length,
      [
        genre,
        provider,
        minRating,
        year,
        sort,
        hideWatched,
        onlyNew,
      ]
    );

  function queryFor(
    nextPage:
      number,
    append = false
  ) {
    const q =
      new URLSearchParams({
        page:
          String(
            nextPage
          ),
        type,
        sort,
      });

    if (genre) {
      q.set(
        "genre",
        genre
      );
    }

    if (
      provider
    ) {
      q.set(
        "provider",
        provider
      );
    }

    if (
      minRating
    ) {
      q.set(
        "min_rating",
        minRating
      );
    }

    if (year) {
      q.set(
        "year",
        year
      );
    }

    if (
      hideWatched
    ) {
      q.set(
        "hide_watched",
        "1"
      );
    }

    if (
      onlyNew
    ) {
      q.set(
        "only_new",
        "1"
      );
    }

    if (append) {
      q.set(
        "exclude",
        shelves
          .flatMap((shelf) => shelf.results)
          .map((item: any) => `${item.media_type === "tv" ? "t" : "m"}${item.id}`)
          .slice(-600)
          .join(",")
      );
    }

    return q;
  }

  /*
   * V2.1-D — antes esta tela buscava /api/library INTEIRA
   * (sem paginação) só para descobrir o estado (salvo/status/
   * favorito/nota) dos cards. Agora /api/for-you já devolve
   * `library_id`/`status`/`favorite`/`personal_rating` em cada
   * resultado salvo — o estado local é semeado a partir das
   * prateleiras recebidas (só K cards visíveis, não a biblioteca).
   */
  function mergeLibraryFromShelves(incoming: any[]) {
    const seeded: LibraryItem[] = [];

    for (const shelf of incoming) {
      for (const item of Array.isArray(shelf?.results) ? shelf.results : []) {
        if (!item?.in_library || !item?.library_id) continue;

        seeded.push({
          library_id: String(item.library_id),
          tmdb_id: Number(item.id),
          media_type: item.media_type,
          favorite: Boolean(item.favorite),
          status: item.status || null,
          personal_rating:
            item.personal_rating === null || item.personal_rating === undefined
              ? null
              : Number(item.personal_rating),
        } as LibraryItem);
      }
    }

    if (seeded.length === 0) return;

    setLibrary((current) => {
      const merged = new Map<string, LibraryItem>();
      const keyOf = (entry: LibraryItem) => `${entry.media_type}-${entry.tmdb_id}`;

      for (const entry of current) merged.set(keyOf(entry), entry);
      for (const entry of seeded) merged.set(keyOf(entry), entry);

      return Array.from(merged.values());
    });
  }

  /*
   * V2.2-A — aplica uma resposta de /api/for-you ao estado. Extraído de
   * `load` para poder pintar a última resposta em cache imediatamente
   * (stale-while-revalidate) e depois aplicar a resposta fresca.
   */
  function applyData(
    data: any,
    nextPage: number,
    append: boolean
  ) {
    const incoming =
      Array.isArray(
        data.shelves
      )
        ? data.shelves
        : [];

    mergeLibraryFromShelves(incoming);

    setShelves(
      (
        current
      ) => {
        if (!append) return incoming;

        // V2.8 — nada já mostrado reaparece ao carregar mais (o servidor já exclui; isto é a garantia)
        const shown = new Set(current.flatMap((shelf) => shelf.results.map((item: any) => `${item.media_type}-${item.id}`)));
        const fresh = incoming
          .map((shelf: Shelf) => ({ ...shelf, results: shelf.results.filter((item: any) => !shown.has(`${item.media_type}-${item.id}`)) }))
          .filter((shelf: Shelf) => shelf.results.length >= 4 && !current.some((c) => c.id === shelf.id));

        return [...current, ...fresh];
      }
    );

    setProfileLevel(data.profile?.level ?? null);

    setBasedOn(
      Array.isArray(
        data.based_on
      )
        ? data.based_on
        : []
    );

    setProfileGenres(
      Array.isArray(
        data.profile
          ?.favorite_genres
      )
        ? data.profile
            .favorite_genres
        : []
    );

    if (
      data.filters
    ) {
      setFilters({
        genres:
          Array.isArray(
            data.filters
              .genres
          )
            ? data.filters
                .genres
            : [],
        providers:
          Array.isArray(
            data.filters
              .providers
          )
            ? data.filters
                .providers
            : [],
      });
    }

    setNeedsStreamingSetup(
      Boolean(
        data.needs_streaming_setup
      )
    );

    setPage(
      nextPage
    );

    setHasMore(
      Boolean(
        data.has_more
      )
    );
  }

  async function load(
    nextPage:
      number,
    append:
      boolean
  ) {
    // Versão vista quando a requisição COMEÇA (mutação em voo invalida o resultado).
    const versionAtStart = getLibraryVersion();

    const cacheKey =
      userId && !append
        ? `${FOR_YOU_CACHE_PREFIX}${userId}:${queryFor(nextPage).toString()}`
        : null;

    try {
      if (
        append
      ) {
        setLoadingMore(
          true
        );
      } else {
        let seeded = false;

        if (cacheKey) {
          try {
            const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");

            if (
              cached &&
              Date.now() - cached.savedAt < 10 * 60 * 1000 &&
              // Só vale se nada na Library/ocultos mudou desde que foi gravado.
              cached.version === getLibraryVersion() &&
              isValidForYouPayload(cached.data)
            ) {
              applyData(cached.data, nextPage, false);
              seeded = true;
            }
          } catch {
            /* cache inválido é ignorado */
          }
        }

        // Com cache: mostra o conteúdo já e revalida em segundo plano.
        setLoading(!seeded);

        setError(
          ""
        );
      }

      const data = await apiFetch(`/api/for-you?${queryFor(
            nextPage,
            append
          ).toString()}`);

      applyData(data, nextPage, append);

      if (cacheKey && !append) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), version: versionAtStart, data }));
        } catch {
          /* cota/indisponível: cache é só otimização */
        }
      }
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar recomendações."
      );
    } finally {
      setLoading(
        false
      );

      setLoadingMore(
        false
      );
    }
  }

  useEffect(() => {
    // Espera a sessão resolver para saber de quem é o cache.
    if (sessionPending) return;

    const timer =
      setTimeout(
        () => {
          load(
            1,
            false
          );
        },
        180
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [
    type,
    genre,
    provider,
    minRating,
    year,
    sort,
    hideWatched,
    onlyNew,
    userId,
    sessionPending,
  ]);

  function getLibraryItem(
    item:
      any
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

  function patchLibrary(
    item:
      any,
    patch:
      Partial<
        LibraryItem
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

  async function addToLibrary(
    item:
      any
  ) {
    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      let media =
        item;

      try {
        const response =
          await fetch(
            `/api/tmdb/${item.media_type}/${item.id}`
          );

        if (
          response.ok
        ) {
          media =
            await safeJson(
              response
            );
        }
      } catch {
        // Intencional: detalhes extras são opcionais; sem eles o título entra com os dados básicos.
      }

      const data = await apiFetch("/api/library", { method: "POST", json: {
                media: {
                  ...item,
                  ...media,
                  id:
                    item.id,
                  media_type:
                    item.media_type,
                  title:
                    media.title ||
                    media.name ||
                    item.title ||
                    item.name,
                  original_title:
                    media.original_title ||
                    media.original_name ||
                    item.title ||
                    item.name,
                  genres:
                    media.genres ||
                    [],
                },
                status:
                  "want",
                favorite:
                  false,
              } });

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
    } catch (error) {
      // Fase 6: antes só ia para o console — o usuário não sabia que não foi adicionado.
      libraryAuth.handleError(error, undefined, "Erro ao adicionar");
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function updateStatus(
    item:
      any,
    status:
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

      const data = await apiFetch(`/api/library/${existing.library_id}`, { method: "PATCH", json: {
                status,
              } });

      patchLibrary(
        item,
        {
          status:
            data.status ||
            status,
        }
      );

      setOpenMenu(
        null
      );
    } catch (error) {
      // Fase 6: antes não havia catch — o erro sumia (rejeição solta) sem aviso.
      libraryAuth.handleError(error, undefined, "Erro ao alterar status");
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function toggleFavorite(
    item:
      any
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

      const data = await apiFetch(`/api/library/${existing.library_id}`, { method: "PATCH", json: {
                favorite:
                  next,
              } });

      patchLibrary(
        item,
        {
          favorite:
            data.favorite ??
            next,
        }
      );
    } catch (error) {
      // Fase 6: antes não havia catch — o erro sumia (rejeição solta) sem aviso.
      libraryAuth.handleError(error, undefined, "Erro ao atualizar a curtida");
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function updateRating(
    item:
      any,
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

      await apiFetch(`/api/library/${existing.library_id}`, { method: "PATCH", json: {
                personal_rating:
                  rating,
              } });

      patchLibrary(
        item,
        {
          personal_rating:
            rating,
        }
      );
    } catch (error) {
      // Fase 6: antes não havia catch — o erro sumia (rejeição solta) sem aviso.
      libraryAuth.handleError(error, undefined, "Erro ao alterar sua nota");
    } finally {
      setProcessing(
        null
      );
    }
  }

  function requestRemove(
    item:
      any
  ) {
    if (
      skipRemoveConfirm
    ) {
      removeItem(
        item
      );

      return;
    }

    setRemoveTarget(
      item
    );

    setOpenMenu(
      null
    );
  }

  async function removeItem(
    item:
      any
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

      await removeFromLibrary(existing.library_id);

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
    } catch (error) {
      // Fase 6: antes não havia catch — o erro sumia (rejeição solta) sem aviso.
      libraryAuth.handleError(error, undefined, "Erro ao remover");
    } finally {
      setProcessing(
        null
      );
    }
  }

  function resetFilters() {
    // uma navegação só (a aba atual é mantida)
    setYearDraft("");
    changeQuery({ ...DEFAULT_FOR_YOU_QUERY, type });
  }

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      {/* Fase 5 (P2-10): <div> — o <main> é do layout raiz (antes havia um main dentro do outro). */}
      <div className="fy-page" data-rec-tool="for_you">

        <section className="fy-hero">
          <div className="fy-hero-glow" />

          <div className="fy-hero-copy">
            <div className="eyebrow">
              PERSONALIZADO
            </div>

            <h1>
              Para você
            </h1>

            <p>
              {profileLevel === "cold"
                ? "Ainda estamos conhecendo seu gosto. Avalie, curta ou marque o que já assistiu e o feed se ajusta a você."
                : "Recomendações que aprendem com suas notas, curtidos e com o que você já assistiu."}
            </p>

            {basedOn.length >
              0 && (
              <div className="fy-based-on">
                <span>
                  Baseado em
                </span>

                <strong>
                  {basedOn
                    .slice(
                      0,
                      4
                    )
                    .join(
                      " · "
                    )}
                </strong>
              </div>
            )}
          </div>

          <div className="fy-profile-card">
            <div className="fy-profile-icon">
              <Sparkles
                size={22}
              />
            </div>

            <div>
              <strong>
                Seu feed
              </strong>

              <span>
                Muda conforme você usa o MyCatalog
              </span>
            </div>
          </div>
        </section>

        {profileGenres.length >
          0 && (
          <section className="fy-profile-genres">
            <span>
              Seu gosto:
            </span>

            {profileGenres
              .slice(
                0,
                6
              )
              .map(
                (
                  item
                ) => (
                  <button
                    type="button"
                    key={
                      item
                    }
                    className={
                      genre ===
                      item
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setGenre(
                        genre ===
                        item
                          ? ""
                          : item
                      )
                    }
                  >
                    {
                      item
                    }
                  </button>
                )
              )}
          </section>
        )}


        <section className="fy-toolbar">
          <div className="fy-tabs">
            <button
              type="button"
              className={
                type ===
                  "all"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setType(
                  "all"
                )
              }
            >
              Tudo
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
                size={14}
              />
              Filmes
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
                size={14}
              />
              Séries
            </button>
          </div>

          <button
            type="button"
            className={
              "fy-filter-button " +
              (filtersOpen
                ? "active"
                : "")
            }
            onClick={() =>
              setFiltersOpen(
                (
                  value
                ) =>
                  !value
              )
            }
          >
            <Filter
              size={16}
            />
            Filtros

            {activeFilterCount >
              0 && (
              <span className="fy-filter-count">
                {
                  activeFilterCount
                }
              </span>
            )}

            <ChevronDown
              size={14}
            />
          </button>
        </section>

        {filtersOpen && (
          <section className="fy-filter-panel">
            <div className="fy-filter-title">
              <div>
                <strong>
                  Afinar recomendações
                </strong>

                <span>
                  Esses filtros valem para todas as prateleiras.
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setFiltersOpen(
                    false
                  )
                }
              >
                <X
                  size={16}
                />
              </button>
            </div>

            <div className="fy-filter-fields">
              <label>
                <span>
                  Gênero
                </span>

                <select
                  value={
                    genre
                  }
                  onChange={(
                    event
                  ) =>
                    setGenre(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Todos
                  </option>

                  {filters.genres.map(
                    (
                      item
                    ) => (
                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {
                          item
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span>
                  Streaming
                </span>

                <select
                  value={
                    provider
                  }
                  onChange={(
                    event
                  ) =>
                    setProvider(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Qualquer um
                  </option>

                  <option value="mine">
                    Nos meus serviços
                  </option>

                  {filters.providers.map(
                    (
                      item
                    ) => (
                      <option
                        key={
                          item.id
                        }
                        value={
                          item.id
                        }
                      >
                        {
                          item.name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

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
                  <option value="">
                    Qualquer
                  </option>
                  <option value="6">
                    6+
                  </option>
                  <option value="7">
                    7+
                  </option>
                  <option value="8">
                    8+
                  </option>
                  <option value="9">
                    9+
                  </option>
                </select>
              </label>

              <label>
                <span>
                  Ano
                </span>

                <input
                  type="number"
                  placeholder="Ex.: 2025"
                  min="1900"
                  max="2100"
                  value={
                    yearDraft
                  }
                  onChange={(
                    event
                  ) =>
                    setYear(
                      event.target
                        .value
                    )
                  }
                />
              </label>

              <label>
                <span>
                  Ordenar por
                </span>

                <select
                  value={
                    sort
                  }
                  onChange={(
                    event
                  ) =>
                    setSort(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="recommended">
                    Recomendado
                  </option>
                  <option value="rating">
                    Melhor avaliados
                  </option>
                  <option value="popular">
                    Mais populares
                  </option>
                  <option value="newest">
                    Mais recentes
                  </option>
                  <option value="hidden">
                    Menos conhecidos
                  </option>
                </select>
              </label>
            </div>

            <div className="fy-toggle-grid">
              <button
                type="button"
                className={
                  hideWatched
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setHideWatched(
                    (
                      value
                    ) =>
                      !value
                  )
                }
              >
                <span className="fy-toggle-check">
                  {hideWatched
                    ? "✓"
                    : ""}
                </span>

                <div>
                  <strong>
                    Ocultar assistidos
                  </strong>

                  <small>
                    Não repete o que você já concluiu
                  </small>
                </div>
              </button>

              <button
                type="button"
                className={
                  onlyNew
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setOnlyNew(
                    (
                      value
                    ) =>
                      !value
                  )
                }
              >
                <span className="fy-toggle-check">
                  {onlyNew
                    ? "✓"
                    : ""}
                </span>

                <div>
                  <strong>
                    Só fora da biblioteca
                  </strong>

                  <small>
                    Mostra apenas descobertas novas
                  </small>
                </div>
              </button>
            </div>

            <button
              type="button"
              className="fy-reset"
              onClick={
                resetFilters
              }
            >
              <RotateCcw
                size={14}
              />
              Restaurar filtros
            </button>
          </section>
        )}

        {needsStreamingSetup &&
          provider === "mine" && (
            <section className="fy-error" role="status">
              <Sparkles size={26} />
              <strong>
                Você ainda não escolheu seus serviços de streaming.
              </strong>
              <Link
                className="btn primary"
                href="/settings?tab=general"
              >
                Escolher meus serviços
              </Link>
            </section>
          )}

        {loading ? (
          <FeedSkeleton />
        ) : error ? (
          <section className="fy-error">
            <Sparkles
              size={26}
            />

            <strong>
              Não foi possível montar seu feed
            </strong>

            <span>
              {
                error
              }
            </span>

            <button
              type="button"
              className="btn"
              onClick={() =>
                load(
                  1,
                  false
                )
              }
            >
              Tentar novamente
            </button>
          </section>
        ) : shelves.length ===
          0 ? (
          <section className="fy-error">
            <Filter
              size={26}
            />

            <strong>
              Nenhuma recomendação com esses filtros
            </strong>

            <span>
              Tente remover algum filtro ou continue avaliando títulos.
            </span>

            <button
              type="button"
              className="btn"
              onClick={
                resetFilters
              }
            >
              Limpar filtros
            </button>
          </section>
        ) : (
          <>
            <div className="fy-feed">
              {shelves.map(
                (
                  shelf,
                  index
                ) => (
                  <Fragment key={shelf.id}>
                  <ShelfRow
                    shelf={
                      shelf
                    }
                    openMenu={
                      openMenu
                    }
                    setOpenMenu={
                      setOpenMenu
                    }
                    setPreviewItem={
                      setPreviewItem
                    }
                    getLibraryItem={
                      getLibraryItem
                    }
                    processing={
                      processing
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

                  {/*
                   * V2.8 — IA como complemento: a entrada "O que assistir agora?" (usa o
                   * tempo disponível) vem depois das primeiras prateleiras, não antes do feed;
                   * o Assistente é só um atalho compacto. Para você funciona sem IA.
                   */}
                  {index === Math.min(1, shelves.length - 1) && (
                    <div className="fy-ai-entry">
                      <SmartQueue genres={filters.genres} />

                      <p className="fy-assistant-link">
                        <Bot size={16} strokeWidth={2} aria-hidden="true" />
                        <span>Prefere conversar?</span>
                        <Link href="/assistant">Abrir Assistente</Link>
                      </p>
                    </div>
                  )}
                  </Fragment>
                )
              )}
            </div>

            {hasMore && (
              <section className="fy-load-more">
                <div>
                  <Sparkles
                    size={18}
                  />

                  <div>
                    <strong>
                      Quer continuar descobrindo?
                    </strong>

                    <span>
                      Carregamos outras partes do seu perfil sem apagar o que já apareceu.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn primary"
                  disabled={
                    loadingMore
                  }
                  onClick={() =>
                    load(
                      page +
                        1,
                      true
                    )
                  }
                >
                  {loadingMore ? (
                    <>
                      <Loader2
                        size={16}
                        className="spin"
                      />
                      Carregando...
                    </>
                  ) : (
                    <>
                      <Sparkles
                        size={16}
                      />
                      Mais recomendações
                    </>
                  )}
                </button>
              </section>
            )}
          </>
        )}

      </div>

      <MediaPreviewDialog
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        data={
          previewItem
            ? fromLooseMediaItem(previewItem, previewDetails, getLibraryItem(previewItem) || null)
            : null
        }
        actions={{
          onAdd: () => previewItem && addToLibrary(previewItem),
          addLabel: "Quero assistir",
          onRating: (_, rating) => previewItem && updateRating(previewItem, rating),
          disabled: previewItem ? processing === `${previewItem.media_type}-${previewItem.id}` : false,
        }}
        providers={<WatchProviderList data={normalizeWatchProviders(previewDetails?.watch_providers, "BR")} loading={previewLoading} />}
      />

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
                  removeTarget.title ||
                  removeTarget.name
                }”?
              </h3>

              <p className="muted">
                Você poderá adicionar este título novamente depois.
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
                  } catch {
                    // Intencional: armazenamento local indisponível (modo privado/cheio) — só perde a preferência.
                  }
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
                onClick={() =>
                  removeItem(
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

function ShelfRow({
  shelf,
  openMenu,
  setOpenMenu,
  setPreviewItem,
  getLibraryItem,
  processing,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  return (
    <section className="fy-shelf" data-rec-shelf={shelf.kind || undefined}>
      <div className="fy-shelf-head">
        <div className="fy-shelf-title">
          <div className="fy-shelf-icon">
            <IconForShelf
              icon={
                shelf.icon
              }
            />
          </div>

          <div>
            <h2>
              {
                shelf.title
              }
            </h2>

            {shelf.subtitle && (
              <p>
                {
                  shelf.subtitle
                }
              </p>
            )}
          </div>
        </div>

        <span className="fy-shelf-count">
          {
            shelf.results
              .length
          } sugestões
        </span>
      </div>

      <CarouselRail className="fy-row" label={shelf.title}>
        {shelf.results.map(
          (
            item:
              any
          ) => (
            <MovieCard
              key={`${item.media_type}-${item.id}`}
              item={
                item
              }
              openMenu={
                openMenu
              }
              setOpenMenu={
                setOpenMenu
              }
              setPreviewItem={
                setPreviewItem
              }
              getLibraryItem={
                getLibraryItem
              }
              processing={
                processing
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
          )
        )}
      </CarouselRail>
    </section>
  );
}

function MovieCard({
  item,
  setPreviewItem,
  getLibraryItem,
  processing,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  const type =
    item.media_type ===
      "tv"
      ? "tv"
      : "movie";

  const title =
    item.title ||
    item.name ||
    "Sem título";

  const year =
    (
      item.release_date ||
      item.first_air_date ||
      ""
    ).slice(
      0,
      4
    );

  const key =
    `${type}-${item.id}`;

  const existing =
    getLibraryItem(
      item
    );

  const busy =
    processing ===
    key;


  return (
    <article className="fy-card-wrap">
      <div className="fy-card-poster-wrap">
        <Link
          href={`/title/${type}/${item.id}`}
          className="fy-poster"
        >
          {item.poster_path ? (
            <Poster
              path={item.poster_path}
              alt={title}
              sizes="(max-width: 700px) 45vw, 190px"
            />
          ) : (
            <div className="fy-no-poster">
              {type ===
              "tv" ? (
                <Tv
                  size={28}
                />
              ) : (
                <Film
                  size={28}
                />
              )}
            </div>
          )}

          <MediaPosterTags type={type} status={existing ? existing.status : null} />
        </Link>

        <MediaPosterActions
          title={title}
          inLibrary={Boolean(existing)}
          status={existing?.status}
          favorite={Boolean(existing?.favorite)}
          busy={busy}
          onPreview={() => setPreviewItem(item)}
          onAdd={() => addToLibrary(item)}
          onChangeStatus={(status: string) => updateStatus(item, status)}
          onToggleFavorite={() => toggleFavorite(item)}
          onRemove={() => requestRemove(item)}
        />
      </div>
      <Link
        href={`/title/${type}/${item.id}`}
        className="fy-card-body"
      >
        <strong>
          {
            title
          }
        </strong>

        <div className="fy-card-meta">
          <span>
            {year ||
              "—"}
          </span>

          {Number(
            item.vote_average ||
              0
          ) >
            0 && (
            <span className="fy-rating">
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
          <p>
            {
              item.reason
            }
          </p>
        )}
      </Link>
    </article>
  );
}

function IconForShelf({
  icon,
}: {
  icon:
    Shelf["icon"];
}) {
  if (icon === "star") return <Star size={18} />;
  if (icon === "film") return <Film size={18} />;
  if (icon === "tv") return <Tv size={18} />;
  if (icon === "gem") return <Gem size={18} />;
  if (icon === "trending") return <TrendingUp size={18} />;
  if (icon === "calendar") return <CalendarDays size={18} />;
  return <Sparkles size={18} />;
}

function FeedSkeleton() {
  return (
    <div className="fy-feed">
      {[1,2,3].map(
        (
          row
        ) => (
          <section
            className="fy-shelf"
            key={
              row
            }
          >
            <div className="fy-skeleton-title" />

            <div className="fy-row">
              {[1,2,3,4,5,6,7].map(
                (
                  item
                ) => (
                  <div
                    key={
                      item
                    }
                    className="fy-skeleton-card"
                  >
                    <div />
                    <span />
                    <small />
                  </div>
                )
              )}
            </div>
          </section>
        )
      )}
    </div>
  );
}
