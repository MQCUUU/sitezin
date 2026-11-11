"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getLibraryVersion } from "@/lib/library-cache";
import type { InsightsPayload } from "@/lib/insights/types";

import { Button } from "@/components/ui/Button";
import { EmptyOpening, Genres, Opening, Ratings, Rhythm, TopRated, YearLink } from "./sections";

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

class SectionBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
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
        <p className="ix-note" role="status">
          Não foi possível mostrar “{this.props.name}” agora. O resto da página continua funcionando.
        </p>
      );
    }

    return this.props.children;
  }
}

function Skeleton() {
  return (
    <div className="ix-skeleton" role="status" aria-live="polite" aria-label="Carregando seus insights">
      <div className="mc-skeleton ix-skel-title" />
      <div className="mc-skeleton ix-skel-line" />
      <div className="mc-skeleton ix-skel-block" />
    </div>
  );
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
  const isEmpty = Boolean(data) && (data!.meta.historyTotal === 0 || data!.summary.cur.movies + data!.summary.cur.series === 0);

  return (
    <div className="ix-page">
      <div className="ix-filters" role="group" aria-label="Filtros">
        <div className="ix-seg" role="radiogroup" aria-label="Período">
          {PERIODS.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={period === value} className={period === value ? "is-active" : ""} onClick={() => setPeriod(value)}>
              {label}
            </button>
          ))}
          <label className={`ix-year${isYear ? " is-active" : ""}`}>
            <span className="mc-visually-hidden">Outro ano</span>
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

        <div className="ix-seg" role="radiogroup" aria-label="Tipo">
          {TYPES.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={type === value} className={type === value ? "is-active" : ""} onClick={() => update({ type: value === "all" ? null : value })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {enriching ? (
        <p className="ix-note" role="status">
          Completando idioma, país e diretores dos seus títulos. A página se atualiza sozinha.
        </p>
      ) : null}

      {error ? (
        <div className="empty" role="alert">
          <strong>{error}</strong>
          <Button variant="primary" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {!error && !data ? <Skeleton /> : null}

      {data && !error ? (
        <div className={`ix-story${loading ? " is-loading" : ""}`} aria-busy={loading}>
          {isEmpty ? (
            <SectionBoundary name="Resumo">
              <EmptyOpening data={data} onPeriod={setPeriod} />
            </SectionBoundary>
          ) : (
            <>
              <SectionBoundary name="Resumo">
                <Opening data={data} />
              </SectionBoundary>
              <SectionBoundary name="Ritmo">
                <Rhythm data={data} />
              </SectionBoundary>
              <SectionBoundary name="Gêneros">
                <Genres data={data} />
              </SectionBoundary>
              <SectionBoundary name="Notas">
                <Ratings data={data} />
              </SectionBoundary>
              <SectionBoundary name="Maiores notas">
                <TopRated data={data} />
              </SectionBoundary>
              <SectionBoundary name="Retrospectiva">
                <YearLink data={data} />
              </SectionBoundary>
            </>
          )}
          {data.meta.failed.length ? (
            <p className="ix-note" role="status">
              Algumas partes não puderam ser calculadas agora. Tente atualizar a página em instantes.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function InsightsPage() {
  return (
    <Suspense fallback={null}>
      <InsightsContent />
    </Suspense>
  );
}
