"use client";


import "@/styles/features/library-page.css";
import "@/styles/features/library-screen.css";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Grid3X3, Heart, LayoutGrid, List, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { PosterSkeleton } from "@/components/AsyncState";
import { PosterGrid } from "@/components/PosterGrid";
import { AddToListDialog } from "@/components/lists/AddToListDialog";
import { readPreferences } from "@/lib/preferences";
import { genreName } from "@/lib/title-locale";
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
import { Button } from "@/components/ui/Button";

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
    <fieldset className="lb-field lb-field-wide">
      <legend>
        {label} <span>{hint}</span>
      </legend>
      <div className="lb-options">
        {["all", ...RATING_STEPS].map((step) => (
          <button key={step} type="button" className="lb-option" aria-pressed={value === step} onClick={() => onChange(step)}>
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
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);

  const updateTabsScroll = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollTabsLeft(el.scrollLeft > 6);
    setCanScrollTabsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateTabsScroll();
    el.addEventListener("scroll", updateTabsScroll, { passive: true });
    window.addEventListener("resize", updateTabsScroll);
    return () => {
      el.removeEventListener("scroll", updateTabsScroll);
      window.removeEventListener("resize", updateTabsScroll);
    };
  }, [updateTabsScroll, query.status, result]);

  const scrollTabs = (direction: "left" | "right") => {
    const el = tabsRef.current;
    if (!el) return;
    const delta = direction === "left" ? -200 : 200;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

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

  const countLabel = (n: number) => `${n} ${n === 1 ? "título" : "títulos"}`;
  const viewModes: [ViewMode, string, typeof Grid3X3][] = [
    ["grid", "Grade", Grid3X3],
    ["compact", "Grade compacta", LayoutGrid],
    ["list", "Lista", List],
  ];

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

      {/* Fase 4: sem rótulo em caixa alta — o título e a contagem, só. */}
      <header className="lb-head">
        <h1>Biblioteca</h1>
        <p aria-live="polite">{result ? (filtered ? `${totalResults} de ${countLabel(totalLibrary)}` : countLabel(totalLibrary)) : " "}</p>
      </header>

      {/* Status: abas de texto; a ativa ganha um traço na cor de destaque que desliza até ela. */}
      <div className="lb-tabs-wrap">
        {canScrollTabsLeft && (
          <button type="button" className="lb-tabs-arrow lb-tabs-arrow-left" aria-label="Rolar abas para a esquerda" onClick={() => scrollTabs("left")}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        )}
        <div className="lb-tabs" role="tablist" aria-label="Status na coleção" ref={tabsRef} onKeyDown={onTabKey}>
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
                className="lb-tab"
                onClick={() => change({ status: value })}
              >
                <span>{label}</span>
                <span className="lb-tab-count">{counts[value] ?? 0}</span>
                {selected ? (
                  <motion.span layoutId="lb-tab-indicator" className="lb-tab-indicator" transition={{ type: "spring", duration: 0.32, bounce: 0 }} aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
        {canScrollTabsRight && (
          <button type="button" className="lb-tabs-arrow lb-tabs-arrow-right" aria-label="Rolar abas para a direita" onClick={() => scrollTabs("right")}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Uma linha: Curtidos (combina com qualquer status) à esquerda; ordem, filtros e visualização à direita. */}
      <div className="lb-controls">
        <Button type="button" className="lb-liked" aria-pressed={query.favorite} title="Curtidos combina com qualquer status" onClick={() => change({ favorite: !query.favorite })}>
          <Heart size={16} fill={query.favorite ? "currentColor" : "none"} aria-hidden="true" />
          Curtidos
          <span className="lb-control-count">{counts.favorites ?? 0}</span>
        </Button>

        <div className="lb-controls-end">
          <label className="lb-sort">
            <span className="lb-sort-label">Ordenar por</span>
            <select value={sort} aria-label="Ordenar por" onChange={(event) => change({ sort: event.target.value as LibrarySort })}>
              {LIBRARY_SORTS.map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <Button type="button" className="lb-filters-btn" aria-expanded={showFilters} aria-controls="library-filters-panel" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {panelCount > 0 ? <span className="lb-control-count">{panelCount}</span> : null}
          </Button>

          <div className="lb-view" role="group" aria-label="Modo de visualização">
            {viewModes.map(([mode, label, Icon]) => (
              <button key={mode} type="button" title={label} aria-label={label} aria-pressed={viewMode === mode} onClick={() => changeView(mode)}>
                <Icon size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros abrem com um leve deslize (responde ao clique); com movimento reduzido, só aparecem. */}
      <AnimatePresence initial={false}>
        {showFilters ? (
          <motion.section
            key="filters"
            className="lb-filters"
            id="library-filters-panel"
            aria-label="Filtros da biblioteca"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="lb-filters-head">
              <h2>Filtros</h2>
              <span>{totalResults === 1 ? "1 resultado" : `${totalResults} resultados`}</span>
              <button type="button" className="lb-filters-close" onClick={() => setShowFilters(false)} title="Fechar filtros" aria-label="Fechar filtros">
                <X size={18} />
              </button>
            </div>

            <div className="lb-filters-grid">
              <fieldset className="lb-field">
                <legend>Tipo</legend>
                <div className="lb-options">
                  {(
                    [
                      ["all", "Todos"],
                      ["movie", "Filmes"],
                      ["tv", "Séries"],
                    ] as const
                  ).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={query.type === value} className="lb-option" onClick={() => change({ type: value })}>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="lb-field">
                <span className="lb-legend">Gênero</span>
                <select value={query.genre} onChange={(event) => change({ genre: event.target.value })}>
                  <option value="all">Todos os gêneros</option>
                  {(result?.genres ?? []).map((name) => (
                    <option key={name} value={name}>
                      {genreName(name)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="lb-field">
                <span className="lb-legend">Ano de lançamento</span>
                <select value={query.year} onChange={(event) => change({ year: event.target.value })}>
                  <option value="all">Todos os anos</option>
                  {(result?.years ?? []).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <RatingFilter label="Sua nota" hint="mínima, a que você deu" value={query.minRating} onChange={(value) => change({ minRating: value })} />
              <RatingFilter label="Nota TMDB" hint="mínima, a do público" value={query.minTmdbRating} onChange={(value) => change({ minTmdbRating: value })} />
            </div>

            {panelCount > 0 ? (
              <button type="button" className="lb-clear" onClick={clearPanel}>
                <RotateCcw size={14} aria-hidden="true" />
                Limpar filtros
              </button>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>

      <div id="library-results" className={`lib-results${loading && result ? " is-busy" : ""}`} aria-busy={loading}>
        {error === "auth" ? (
          <div className="lb-empty" role="alert">
            <strong>Sua sessão expirou.</strong>
            <p>Entre novamente para ver sua biblioteca.</p>
            <a className="btn primary" href={`/login?reason=session&next=${encodeURIComponent(pathname + (params.toString() ? `?${params.toString()}` : ""))}`}>
              Entrar
            </a>
          </div>
        ) : error === "load" && !result ? (
          <div className="lb-empty" role="alert">
            <strong>Não foi possível carregar sua biblioteca.</strong>
            <p>Verifique sua conexão e tente novamente.</p>
            <Button variant="primary" type="button" onClick={() => setReloadTick((n) => n + 1)}>
              Tentar de novo
            </Button>
          </div>
        ) : !result ? (
          <div role="status" aria-live="polite" aria-label="Carregando biblioteca">
            <PosterSkeleton count={12} />
          </div>
        ) : totalLibrary === 0 ? (
          <div className="lb-empty">
            <strong>Sua Biblioteca ainda está vazia.</strong>
            <p>Adicione filmes e séries para acompanhar o que quer ver, o que está vendo e o que já viu.</p>
            <Link href="/discover" className="btn primary">
              Explorar títulos
            </Link>
          </div>
        ) : totalResults === 0 ? (
          <div className="lb-empty">
            <strong>{query.search ? "Nenhum título encontrado na sua Biblioteca." : "Nenhum título corresponde a esses filtros."}</strong>
            {query.search ? <p>A busca procura só entre os títulos da sua coleção.</p> : null}
            <Button type="button" onClick={clearAll}>
              {query.search ? "Limpar busca e filtros" : "Limpar filtros"}
            </Button>
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
            <PosterGrid items={items} onChanged={() => setReloadTick((n) => n + 1)} viewMode={viewMode} onAddToList={setAddToListTarget} />
          </>
        )}
      </div>

      {result && totalResults > 0 && totalPages > 1 ? (
        <nav className="lb-pages" aria-label="Paginação da biblioteca">
          <button type="button" className="lb-page" disabled={query.page <= 1} onClick={() => goToPage(query.page - 1)} aria-label="Página anterior" title="Página anterior">
            <ChevronLeft size={18} />
          </button>
          {buildPages(query.page, totalPages).map((value) =>
            typeof value === "number" ? (
              <button key={value} type="button" className="lb-page" aria-current={value === query.page ? "page" : undefined} aria-label={`Página ${value}`} onClick={() => goToPage(value)}>
                {value}
              </button>
            ) : (
              <span key={value} className="lb-page-gap" aria-hidden="true">
                …
              </span>
            )
          )}
          <button type="button" className="lb-page" disabled={query.page >= totalPages} onClick={() => goToPage(query.page + 1)} aria-label="Próxima página" title="Próxima página">
            <ChevronRight size={18} />
          </button>
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
