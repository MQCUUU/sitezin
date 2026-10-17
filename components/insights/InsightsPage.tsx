"use client";

import Link from "next/link";
import { Component, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Search } from "@/components/Search";
import { getLibraryVersion } from "@/lib/library-cache";
import type { InsightsPayload } from "@/lib/insights/types";

import {
  ActivityChapter,
  AiChapter,
  CHAPTERS,
  EvolutionChapter,
  FavoritesChapter,
  RatingsChapter,
  RewatchChapter,
  SummaryChapter,
  TasteChapter,
  TitlesChapter,
  WatchlistChapter,
  YearChapter,
  visibleChapters as chapterIds,
} from "./story";

/*
 * Página Insights — uma narrativa contínua (sem abas escondendo conteúdo).
 * Filtros na URL (?period=year|12m|all|AAAA &type=all|movie|tv): recarregar
 * mantém, o link é compartilhável. 1 requisição por combinação de filtros,
 * cache em memória invalidado quando a biblioteca muda. Cada capítulo tem
 * seu próprio limite de erro: se um falhar, o resto continua.
 */

const PERIODS: [string, string][] = [
  ["year", "Este ano"],
  ["12m", "Últimos 12 meses"],
  ["all", "Todo período"],
];

const TYPES: [string, string][] = [
  ["all", "Todos"],
  ["movie", "Filmes"],
  ["tv", "Séries"],
];

const cache = new Map<string, { at: number; data: InsightsPayload }>();
const TTL = 60_000;
const enrichRun = { active: false };

class ChapterBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[insights] capítulo ${this.props.name}:`, error);
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="ins-chapter-error" role="status">
          Não foi possível mostrar “{this.props.name}” agora. O resto da página continua funcionando.
        </p>
      );
    }

    return this.props.children;
  }
}

function Skeleton() {
  return (
    <div className="ins-skeleton" role="status" aria-live="polite" aria-label="Carregando seus insights">
      <div className="mc-skeleton ins-skel-hero" />
      <div className="mc-skeleton ins-skel-wide" />
      <div className="ins-skel-duo">
        <div className="mc-skeleton ins-skel-card" />
        <div className="mc-skeleton ins-skel-card" />
      </div>
    </div>
  );
}

function useScrollSpy(ids: string[], ready: boolean) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-120px 0px -65% 0px" }
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);

      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [ids, ready]);

  return active;
}

function InsightsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const rawPeriod = search.get("period") || "year";
  const period = ["year", "12m", "all"].includes(rawPeriod) || /^\d{4}$/.test(rawPeriod) ? rawPeriod : "year";
  const type = ["movie", "tv"].includes(search.get("type") || "") ? (search.get("type") as string) : "all";
  const thisYear = Number(new Date().getFullYear());
  const apiQuery = `period=${period}&type=${type}`;

  const [data, setData] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    const key = `${getLibraryVersion()}|${apiQuery}`;
    const cached = cache.get(key);

    if (cached && Date.now() - cached.at < TTL && attempt === 0) {
      setData(cached.data);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setError(null);

    fetch(`/api/insights?${apiQuery}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) throw new Error("Entre na sua conta para ver seus insights.");
        if (!response.ok) throw new Error("Não foi possível carregar seus insights agora.");

        return (await response.json()) as InsightsPayload;
      })
      .then((payload) => {
        cache.set(key, { at: Date.now(), data: payload });
        setData(payload);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiQuery, attempt]);

  // Completa idioma, país e diretores dos títulos (TMDB) em segundo plano.
  const pending = data?.meta.enrichmentPending ?? 0;

  useEffect(() => {
    if (pending === 0 || enrichRun.active) return;

    enrichRun.active = true;
    setEnriching(true);

    (async () => {
      let done = 0;

      for (let round = 0; round < 15; round += 1) {
        const result = await fetch("/api/insights/enrich", { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        if (!result || result.enriched === 0) break;

        done += result.enriched;

        if (result.remaining === 0) break;
      }

      enrichRun.active = false;
      setEnriching(false);

      if (done > 0) {
        cache.clear();
        setAttempt((n) => n + 1);
      }
    })();
  }, [pending]);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(search.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }

      const query = next.toString();

      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, search]
  );

  const setPeriod = (value: string) => update({ period: value === "year" ? null : value });
  const years = useMemo(() => Array.from({ length: 8 }, (_, i) => String(thisYear - 1 - i)), [thisYear]);
  const isYear = /^\d{4}$/.test(period);
  const newUser = data && data.meta.historyTotal === 0;
  const ids = useMemo(() => (data ? chapterIds(data) : []), [data]);
  const visibleChapters = CHAPTERS.filter((c) => ids.includes(c.id));
  const active = useScrollSpy(ids, Boolean(data));
  const position = (id: string) => Math.max(1, ids.indexOf(id) + 1);

  return (
    <>
      <Search />

      <header className="ins-header">
        <div>
          <span className="ins-eyebrow">Insights</span>
          <h1>Entenda seu jeito de assistir</h1>
        </div>

        <div className="ins-filters" role="group" aria-label="Filtros">
          <div className="ins-seg ins-seg--lg" role="radiogroup" aria-label="Período">
            {PERIODS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={period === value}
                className={period === value ? "is-active" : ""}
                onClick={() => setPeriod(value)}
              >
                {label}
              </button>
            ))}
            <label className={`ins-year-select${isYear ? " is-active" : ""}`}>
              <span className="ins-sr">Outro ano</span>
              <select value={isYear ? period : ""} onChange={(event) => event.target.value && setPeriod(event.target.value)}>
                <option value="" disabled>
                  Outro ano
                </option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ins-seg" role="radiogroup" aria-label="Tipo">
            {TYPES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={type === value}
                className={type === value ? "is-active" : ""}
                onClick={() => update({ type: value === "all" ? null : value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {data && !error ? (
        <nav className="ins-nav" aria-label="Capítulos">
          {visibleChapters.map((c) => (
            <a key={c.id} href={`#${c.id}`} className={active === c.id ? "is-active" : ""} aria-current={active === c.id ? "true" : undefined}>
              {c.label}
            </a>
          ))}
        </nav>
      ) : null}

      {enriching ? (
        <p className="ins-enrich" role="status">
          Completando idioma, país e diretores dos seus títulos — a página se atualiza sozinha.
        </p>
      ) : null}

      {error ? (
        <div className="empty" role="alert">
          <strong>{error}</strong>
          <button type="button" className="btn primary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {!error && !data ? <Skeleton /> : null}

      {data && !error ? (
        <div className={`ins-story${loading ? " is-loading" : ""}`} aria-busy={loading}>
          {newUser ? (
            <section id="resumo" className="ins-hero ins-hero--empty">
              <span className="ins-kicker">Bem-vindo aos seus Insights</span>
              <p className="ins-hero-title">Seu perfil está começando a tomar forma.</p>
              <p className="ins-hero-sub">
                Marque filmes e episódios como assistidos e dê algumas notas: aqui você vai ver quanto assiste, do que realmente gosta e como seu gosto muda.
              </p>
              <div className="ins-hero-actions">
                <Link href="/discover" className="btn primary">
                  Descobrir títulos
                </Link>
                <Link href="/library" className="btn">
                  Abrir biblioteca
                </Link>
              </div>
            </section>
          ) : (
            <>
              <ChapterBoundary name="Resumo">
                <SummaryChapter data={data} onPeriod={setPeriod} />
              </ChapterBoundary>
              <ChapterBoundary name="Atividade">
                <ActivityChapter data={data} index={position("atividade")} />
              </ChapterBoundary>
              <ChapterBoundary name="Meu gosto">
                <TasteChapter data={data} index={position("gosto")} />
              </ChapterBoundary>
              <ChapterBoundary name="Notas">
                <RatingsChapter data={data} index={position("notas")} />
              </ChapterBoundary>
              <ChapterBoundary name="Filmes e séries">
                <TitlesChapter key={data.meta.type} data={data} index={position("titulos")} />
              </ChapterBoundary>
              <ChapterBoundary name="Revistos e abandonos">
                <RewatchChapter data={data} index={position("revistos")} />
              </ChapterBoundary>
            </>
          )}
          <ChapterBoundary name="Watchlist">
            <WatchlistChapter data={data} index={position("watchlist")} />
          </ChapterBoundary>
          {!newUser ? (
            <>
              <ChapterBoundary name="Evolução">
                <EvolutionChapter data={data} index={position("evolucao")} />
              </ChapterBoundary>
              <ChapterBoundary name="IA">
                <AiChapter data={data} index={position("ia")} />
              </ChapterBoundary>
              <ChapterBoundary name="Maiores notas">
                <FavoritesChapter data={data} index={position("favoritos")} />
              </ChapterBoundary>
              <ChapterBoundary name="Seu ano">
                <YearChapter data={data} index={position("ano")} />
              </ChapterBoundary>
            </>
          ) : null}
          {data.meta.failed.length ? (
            <p className="ins-chapter-error" role="status">
              Algumas partes não puderam ser calculadas agora. Tente atualizar a página em instantes.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function InsightsPage() {
  return (
    <Suspense fallback={null}>
      <InsightsContent />
    </Suspense>
  );
}
