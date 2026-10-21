"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp, CalendarDays, ChevronLeft, ChevronRight, Film, Heart, Library as LibraryIcon, RotateCcw, Search, SlidersHorizontal, Tag, Tv, X } from "lucide-react";

import { PosterSkeleton } from "@/components/AsyncState";
import { PosterGrid } from "@/components/PosterGrid";
import { AddToListDialog } from "@/components/lists/AddToListDialog";
import { readPreferences } from "@/lib/preferences";
import type { LibraryItem } from "@/lib/types";
import {
  LIBRARY_SORTS,
  RATING_STEPS,
  apiParams,
  hasAnyFilter,
  panelFilterCount,
  parseLibraryQuery,
  serializeLibraryQuery,
  withChange,
  type LibraryQuery,
  type LibrarySort,
  type LibraryStatusFilter,
} from "@/lib/library/url";

/*
 * Biblioteca V2.6 — "minha coleção atual, onde entendo estado e progresso em segundos".
 *
 * A URL é a ÚNICA fonte do estado navegável (lib/library/url.ts): página, status,
 * curtidos, busca, ordenação e filtros sobrevivem a refresh, voltar, avançar e
 * link direto. Navegação (página, aba, filtro, ordenação) → push (entra no
 * histórico); digitar na busca → replace (não empilha cada tecla). Qualquer
 * mudança que não seja a página volta para a página 1. Modo de visualização é
 * preferência visual: localStorage.
 *
 * Status (6 estados, mutuamente exclusivos) ≠ Curtidos (propriedade ortogonal,
 * combinável com qualquer status).
 */

const PER_PAGE = 24;
const VIEW_KEY = "mycatalog_library_view_mode";

type ViewMode = "grid" | "compact" | "list";

type LibraryResponse = {
  items: (LibraryItem & { id: string; media: Record<string, unknown> })[];
  page: number;
  total_pages: number;
  total_results: number;
  total_library: number;
  counts: Record<string, number>;
  genres: string[];
  years: string[];
};

const STATUS_TABS: [LibraryStatusFilter, string][] = [
  ["all", "Todos"],
  ["want", "Quero assistir"],
  ["watching", "Assistindo"],
  ["watched", "Assistido"],
  ["dropped", "Abandonado"],
  ["rewatching", "Reassistindo"],
  ["rewatched", "Reassistido"],
];

const SORT_LABELS: Record<LibrarySort, string> = {
  added: "Adicionados recentemente",
  updated: "Atualizados recentemente",
  rating: "Maior nota pessoal",
  "rating-low": "Menor nota pessoal",
  tmdb: "Maior nota TMDB",
  az: "Título A–Z",
  za: "Título Z–A",
  newest: "Lançamento mais recente",
  oldest: "Lançamento mais antigo",
};

function buildPages(current: number, total: number): (number | "gap-left" | "gap-right")[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "gap-left" | "gap-right")[] = [1];

  if (current > 4) pages.push("gap-left");
  for (let p = Math.max(2, current - 2); p <= Math.min(total - 1, current + 2); p += 1) pages.push(p);
  if (current < total - 3) pages.push("gap-right");
  pages.push(total);

  return pages;
}

function toItems(result: LibraryResponse): LibraryItem[] {
  return result.items.map((item) => ({ ...item, library_id: item.id, ...(item.media as object) }) as LibraryItem);
}

function RatingFilter({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (value: string) => void }) {
  return (
    <fieldset className="library-rating-filter lib-rating-filter">
      <legend>
        {label} <span>{hint}</span>
      </legend>
      <div className="library-rating-options">
        {["all", ...RATING_STEPS].map((step) => (
          <button key={step} type="button" className={value === step ? "active" : ""} aria-pressed={value === step} onClick={() => onChange(step)}>
            {step === "all" ? "Todas" : `${step}+`}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function LibraryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = useMemo(() => parseLibraryQuery(params), [params]);

  const [prefSort, setPrefSort] = useState<LibrarySort>("added");
  const sort: LibrarySort = query.sort ?? prefSort;

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [result, setResult] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"auth" | "load" | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [addToListTarget, setAddToListTarget] = useState<LibraryItem | null>(null);
  const [searchInput, setSearchInput] = useState(query.search);
  const lastSearchPushed = useRef(query.search);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Preferências do navegador só depois do mount (sem divergência de hidratação).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);

      if (stored === "grid" || stored === "compact" || stored === "list") setViewMode(stored);
    } catch {
      // localStorage indisponível: fica "grid".
    }

    const preferred = readPreferences().defaultSort as LibrarySort;

    if ((LIBRARY_SORTS as readonly string[]).includes(preferred)) setPrefSort(preferred);
  }, []);

  const changeView = useCallback((mode: ViewMode) => {
    setViewMode(mode);

    try {
      window.localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // só não persiste
    }
  }, []);

  const go = useCallback(
    (next: LibraryQuery, mode: "push" | "replace" = "push") => {
      const qs = serializeLibraryQuery(next);

      router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  const change = (patch: Partial<LibraryQuery>, mode: "push" | "replace" = "push") => go(withChange(query, patch), mode);

  // URL inválida/apelidos (q, liked) → forma canônica, sem empilhar histórico.
  useEffect(() => {
    const canonical = serializeLibraryQuery(query);

    if (canonical !== params.toString()) router.replace(canonical ? `${pathname}?${canonical}` : pathname, { scroll: false });
  }, [query, params, pathname, router]);

  // Busca vinda da URL (voltar/avançar/link) atualiza o campo; a nossa própria digitação não.
  useEffect(() => {
    if (query.search !== lastSearchPushed.current) {
      lastSearchPushed.current = query.search;
      setSearchInput(query.search);
    }
  }, [query.search]);

  useEffect(() => {
    const value = searchInput.trim().slice(0, 100);

    if (value === query.search) return;

    const timer = window.setTimeout(() => {
      lastSearchPushed.current = value;
      go(withChange(query, { search: value }), "replace");
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, query, go]);

  const requestKey = apiParams(query, sort, PER_PAGE).toString();

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);

    fetch(`/api/library?${requestKey}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setError("auth");
          return;
        }

        if (!response.ok) throw new Error("load");

        const data = (await response.json()) as LibraryResponse;

        setResult(data);
        setError(null);

        // Página além do máximo → a última página existente (sem empilhar histórico).
        if (Number(data.page) !== query.page) {
          go({ ...query, page: Number(data.page) || 1 }, "replace");
        }
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError("load");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, reloadTick]);

  // Aba ativa sempre visível na barra rolável (celular).
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [query.status]);

  const items = useMemo(() => (result ? toItems(result) : []), [result]);
  const counts = result?.counts ?? {};
  const totalLibrary = result?.total_library ?? 0;
  const totalResults = result?.total_results ?? 0;
  const totalPages = result?.total_pages ?? 1;
  const filtered = hasAnyFilter(query);
  const panelCount = panelFilterCount(query);
  // Fase 3: "Pausado" é um status como os outros (escolhível em qualquer tela) — aparece sempre, mesmo com 0.
  const tabs: [LibraryStatusFilter, string][] = [...STATUS_TABS, ["paused", "Pausado"]];

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    const buttons = [...(tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (index < 0) return;

    event.preventDefault();
    buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  function goToPage(target: number) {
    change({ page: Math.min(Math.max(1, target), totalPages) });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  const clearPanel = () => change({ type: "all", genre: "all", year: "all", minRating: "all", minTmdbRating: "all" });
  const clearAll = () => {
    lastSearchPushed.current = "";
    setSearchInput("");
    go(withChange(query, { status: "all", favorite: false, type: "all", genre: "all", year: "all", minRating: "all", minTmdbRating: "all", search: "" }));
  };

  return (
    <>
      <div className="topbar">
        <div className="library-search" role="search">
          <Search size={18} aria-hidden="true" />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar na biblioteca..." aria-label="Buscar na biblioteca" />
          {loading && searchInput.trim() !== "" ? <span className="lib-search-busy" aria-hidden="true" /> : null}
          {searchInput ? (
            <button type="button" onClick={() => setSearchInput("")} title="Limpar busca" aria-label="Limpar busca">
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <header className="library-head lib-head">
        <div>
          <div className="eyebrow">Minha coleção</div>
          <h1>Biblioteca</h1>
          <div className="muted" aria-live="polite">
            {result ? (filtered ? `${totalResults} de ${totalLibrary} ${totalLibrary === 1 ? "título" : "títulos"}` : `${totalLibrary} ${totalLibrary === 1 ? "título" : "títulos"}`) : " "}
          </div>
        </div>
      </header>

      <div className="lib-toolbar">
        <div className="lib-tabs-wrap">
          <div className="lib-tabs" role="tablist" aria-label="Status na coleção" ref={tabsRef} onKeyDown={onTabKey}>
            {tabs.map(([value, label]) => {
              const selected = query.status === value;

              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="library-results"
                  tabIndex={selected ? 0 : -1}
                  className={`library-quick-filter${selected ? " active" : ""}`}
                  onClick={() => change({ status: value })}
                >
                  <span>{label}</span>
                  <b>{counts[value] ?? 0}</b>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className={`lib-liked${query.favorite ? " active" : ""}`}
          aria-pressed={query.favorite}
          title="Curtidos combina com qualquer status"
          onClick={() => change({ favorite: !query.favorite })}
        >
          <Heart size={16} fill={query.favorite ? "currentColor" : "none"} aria-hidden="true" />
          <span>Curtidos</span>
          <b>{counts.favorites ?? 0}</b>
        </button>

        <div className="lib-toolbar-end">
          <label className="library-quick-sort">
            <ArrowDownUp size={16} aria-hidden="true" />
            <span className="lib-sort-label">Ordenar por</span>
            <select value={sort} aria-label="Ordenar por" onChange={(event) => change({ sort: event.target.value as LibrarySort })}>
              {LIBRARY_SORTS.map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className={`btn lib-filters-btn${showFilters ? " primary" : ""}`} aria-expanded={showFilters} aria-controls="library-filters-panel" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {panelCount > 0 ? <span className="library-active-filter-count">{panelCount}</span> : null}
          </button>
        </div>
      </div>

      {showFilters ? (
        <section className="library-filter-panel lib-filter-panel" id="library-filters-panel" aria-label="Filtros da biblioteca">
          <div className="library-filter-header">
            <div>
              <h2>Filtros</h2>
              <p>Refine sua coleção. Status, curtidos e ordenação ficam na barra acima.</p>
            </div>
            <div className="library-filter-header-actions">
              <span className="library-filter-count">{totalResults} resultados</span>
              <button type="button" className="library-filter-close" onClick={() => setShowFilters(false)} title="Fechar filtros" aria-label="Fechar filtros">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="lib-filter-grid">
            <fieldset className="lib-filter-field">
              <legend>
                <Film size={16} aria-hidden="true" /> Tipo
              </legend>
              <div className="library-filter-options">
                {(
                  [
                    ["all", "Todos"],
                    ["movie", "Filmes"],
                    ["tv", "Séries"],
                  ] as const
                ).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={query.type === value} className={`library-filter-option${query.type === value ? " active" : ""}`} onClick={() => change({ type: value })}>
                    {value === "movie" ? <Film size={14} aria-hidden="true" /> : value === "tv" ? <Tv size={14} aria-hidden="true" /> : null}
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="lib-filter-field">
              <span className="lib-filter-legend">
                <Tag size={16} aria-hidden="true" /> Gênero
              </span>
              <select value={query.genre} onChange={(event) => change({ genre: event.target.value })}>
                <option value="all">Todos os gêneros</option>
                {(result?.genres ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="lib-filter-field">
              <span className="lib-filter-legend">
                <CalendarDays size={16} aria-hidden="true" /> Ano de lançamento
              </span>
              <select value={query.year} onChange={(event) => change({ year: event.target.value })}>
                <option value="all">Todos os anos</option>
                {(result?.years ?? []).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="library-rating-row lib-rating-row">
            <RatingFilter label="Sua nota" hint="mínima, a que você deu" value={query.minRating} onChange={(value) => change({ minRating: value })} />
            <RatingFilter label="Nota TMDB" hint="mínima, a do público" value={query.minTmdbRating} onChange={(value) => change({ minTmdbRating: value })} />
          </div>

          {panelCount > 0 ? (
            <div className="library-filter-footer">
              <button type="button" className="library-clear-filters" onClick={clearPanel}>
                <RotateCcw size={14} aria-hidden="true" />
                Limpar filtros
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <div id="library-results" className={`lib-results${loading && result ? " is-busy" : ""}`} aria-busy={loading}>
        {error === "auth" ? (
          <div className="empty" role="alert">
            <strong>Sua sessão expirou.</strong>
            <p className="muted">Entre novamente para ver sua biblioteca.</p>
            <a className="btn primary" href={`/login?reason=session&next=${encodeURIComponent(pathname + (params.toString() ? `?${params.toString()}` : ""))}`}>
              Entrar
            </a>
          </div>
        ) : error === "load" && !result ? (
          <div className="empty" role="alert">
            <strong>Não foi possível carregar sua biblioteca.</strong>
            <p className="muted">Verifique sua conexão e tente novamente.</p>
            <button type="button" className="btn primary" onClick={() => setReloadTick((n) => n + 1)}>
              Tentar de novo
            </button>
          </div>
        ) : !result ? (
          <div role="status" aria-live="polite" aria-label="Carregando biblioteca">
            <PosterSkeleton count={12} />
          </div>
        ) : totalLibrary === 0 ? (
          <div className="lib-empty">
            <LibraryIcon size={30} aria-hidden="true" />
            <strong>Sua Biblioteca ainda está vazia.</strong>
            <span>Adicione filmes e séries para acompanhar o que quer ver, o que está vendo e o que já viu.</span>
            <Link href="/discover" className="btn">
              Explorar títulos
            </Link>
          </div>
        ) : totalResults === 0 ? (
          <div className="lib-empty">
            <strong>{query.search ? "Nenhum título encontrado na sua Biblioteca." : "Nenhum título corresponde a esses filtros."}</strong>
            {query.search ? <span>A busca procura só entre os títulos da sua coleção.</span> : null}
            <button type="button" className="btn" onClick={clearAll}>
              {query.search ? "Limpar busca e filtros" : "Limpar filtros"}
            </button>
          </div>
        ) : (
          <>
            {error === "load" ? (
              <p className="lib-inline-error" role="alert">
                Não foi possível atualizar agora.{" "}
                <button type="button" className="dy-text-btn" onClick={() => setReloadTick((n) => n + 1)}>
                  Tentar de novo
                </button>
              </p>
            ) : null}
            <PosterGrid items={items} onChanged={() => setReloadTick((n) => n + 1)} viewMode={viewMode} onViewModeChange={changeView} onAddToList={setAddToListTarget} />
          </>
        )}
      </div>

      {result && totalResults > 0 && totalPages > 1 ? (
        <nav className="library-pagination-wrap" aria-label="Paginação da biblioteca">
          <div className="library-page-info">
            Página <strong>{query.page}</strong> de <strong>{totalPages}</strong> <span>·</span> <span>{totalResults} resultados</span>
          </div>
          <div className="library-pagination">
            <button type="button" className="library-page-btn" disabled={query.page <= 1} onClick={() => goToPage(query.page - 1)} aria-label="Página anterior" title="Página anterior">
              <ChevronLeft size={18} />
            </button>
            {buildPages(query.page, totalPages).map((value) =>
              typeof value === "number" ? (
                <button key={value} type="button" className={`library-page-btn${value === query.page ? " active" : ""}`} aria-current={value === query.page ? "page" : undefined} aria-label={`Página ${value}`} onClick={() => goToPage(value)}>
                  {value}
                </button>
              ) : (
                <span key={value} className="library-page-ellipsis" aria-hidden="true">
                  …
                </span>
              )
            )}
            <button type="button" className="library-page-btn" disabled={query.page >= totalPages} onClick={() => goToPage(query.page + 1)} aria-label="Próxima página" title="Próxima página">
              <ChevronRight size={18} />
            </button>
          </div>
        </nav>
      ) : null}

      {addToListTarget ? <AddToListDialog tmdbId={addToListTarget.tmdb_id} mediaType={addToListTarget.media_type === "tv" ? "tv" : "movie"} title={addToListTarget.title} onClose={() => setAddToListTarget(null)} /> : null}
    </>
  );
}

export function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-live="polite" aria-label="Carregando biblioteca">
          <PosterSkeleton count={12} />
        </div>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}
