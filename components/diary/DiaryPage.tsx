"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpenText, ChevronLeft, ChevronRight } from "lucide-react";

import { Search } from "@/components/Search";
import { CALENDAR_TZ, addMonths, capitalize, isDay, longDate, monthLabel, todayIn } from "@/lib/calendar/dates";
import type { DiaryDay, DiaryFilter, DiaryResponse } from "@/lib/diary/types";

import { Day, Skeleton } from "./parts";

/*
 * Diário V2.5 — "a minha história assistindo filmes e séries".
 * Um mês por vez (← mês →, seletor de mês, Hoje), "Carregar <mês anterior>"
 * para continuar a leitura, 4 filtros. Momentos montados no servidor
 * (lib/diary). URL: ?month=AAAA-MM &date=AAAA-MM-DD &filter=watched|rewatch|rated
 * `date` (Calendário/Insights) abre o mês daquele dia e leva o foco até ele.
 */

const FILTERS: [DiaryFilter, string][] = [
  ["all", "Tudo"],
  ["watched", "Assistidos"],
  ["rewatch", "Reassistidos"],
  ["rated", "Avaliações"],
];

const FILTER_EMPTY: Record<DiaryFilter, string> = {
  all: "Nenhuma atividade registrada",
  watched: "Nada assistido registrado",
  rewatch: "Nenhuma reassistida",
  rated: "Nenhuma avaliação ou comentário",
};

// Cache curto por mês+filtro (voltar/avançar instantâneo); guarda a promessa,
// então pedidos simultâneos do mesmo período viram uma única requisição.
const cache = new Map<string, { at: number; data: Promise<DiaryResponse> }>();
const TTL = 60 * 1000;

async function request(month: string | null, filter: DiaryFilter): Promise<DiaryResponse> {
  const params = new URLSearchParams();

  if (month) params.set("month", month);
  if (filter !== "all") params.set("filter", filter);

  const response = await fetch(`/api/diary?${params}`, { cache: "no-store" });

  if (response.status === 401) throw new Error("Entre na sua conta para ver seu Diário.");
  if (!response.ok) throw new Error("Não foi possível carregar o Diário agora.");

  return (await response.json()) as DiaryResponse;
}

function fetchMonth(month: string | null, filter: DiaryFilter): Promise<DiaryResponse> {
  const key = `${month ?? "latest"}|${filter}`;
  const hit = cache.get(key);

  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const data = request(month, filter);

  cache.set(key, { at: Date.now(), data });
  data.catch(() => cache.delete(key));

  return data;
}

const monthName = (month: string) => monthLabel(`${month}-01`);

function DiaryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const today = useMemo(() => todayIn(CALENDAR_TZ), []);
  const currentMonth = today.slice(0, 7);

  const rawDate = search.get("date") || "";
  const focusDay = isDay(rawDate) ? rawDate : null;
  const rawMonth = search.get("month") || "";
  const askedMonth = focusDay ? focusDay.slice(0, 7) : /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : null;
  const rawFilter = search.get("filter") as DiaryFilter;
  const filter: DiaryFilter = FILTERS.some(([f]) => f === rawFilter) ? rawFilter : "all";

  const [data, setData] = useState<DiaryResponse | null>(null);
  const [older, setOlder] = useState<DiaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [moreState, setMoreState] = useState<"idle" | "loading" | "error">("idle");
  const focusedOnce = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError(null);

    fetchMonth(askedMonth, filter)
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setOlder([]);
        setMoreState("idle");
      })
      .catch((reason: Error) => {
        if (alive) setError(reason.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [askedMonth, filter, attempt]);

  // Deep-link de dia: rola até o dia e leva o foco ao título dele (uma vez por dia pedido).
  useEffect(() => {
    if (!focusDay || loading || !data || focusedOnce.current === `${focusDay}|${filter}`) return;

    focusedOnce.current = `${focusDay}|${filter}`;

    const heading = document.getElementById(`dy-h-${focusDay}`);

    if (heading) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      heading.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      heading.focus({ preventScroll: true });
    }
  }, [focusDay, filter, loading, data]);

  const update = useCallback(
    (next: { month?: string | null; date?: string | null; filter?: DiaryFilter }, mode: "push" | "replace" = "push") => {
      // Parte da URL atual (não do último render): cliques rápidos não usam parâmetros velhos.
      const params = new URLSearchParams(window.location.search);

      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === undefined || value === "all") params.delete(key);
        else params.set(key, value);
      }

      if (next.month !== undefined) params.delete("date");

      const query = params.toString();

      router[mode](query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // A URL manda: enquanto o mês novo carrega, ← → e o seletor partem do mês pedido,
  // não do mês anterior ainda na tela. Sem ?month, o servidor escolhe (mais recente).
  const month = askedMonth ?? data?.month ?? currentMonth;
  const lastLoaded = older.length ? older[older.length - 1] : data;
  const nextCursor = lastLoaded?.prev ?? null;
  const days: DiaryDay[] = useMemo(() => [...(data?.days ?? []), ...older.flatMap((page) => page.days)], [data, older]);
  const focusMissing = Boolean(focusDay && data && !loading && !data.days.some((d) => d.day === focusDay));
  const months = useMemo(() => {
    const list = new Set([currentMonth, ...(data?.months ?? []), month]);

    return [...list].filter((m) => m <= currentMonth).sort().reverse();
  }, [data, month, currentMonth]);

  async function loadOlder() {
    if (!nextCursor) return;

    setMoreState("loading");

    try {
      // Com filtro, um mês com atividade pode não ter momentos daquele tipo: segue até achar (máx. 6).
      const pages: DiaryResponse[] = [];
      let cursor: string | null = nextCursor;

      while (cursor && pages.length < 6) {
        const page = await fetchMonth(cursor, filter);

        pages.push(page);
        cursor = page.days.length ? null : page.prev;
      }

      setOlder((list) => [...list, ...pages]);
      setMoreState("idle");
    } catch {
      setMoreState("error");
    }
  }

  const goMonth = (target: string) => update({ month: target });

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <header className="dy-header">
        <div>
          <span className="dy-eyebrow">Sua história</span>
          <h1>Diário</h1>
          <p>Tudo que você assistiu, reassistiu e marcou pelo caminho.</p>
        </div>

        <div className="dy-controls">
          <div className="dy-nav" role="group" aria-label="Período">
            <button type="button" className="dy-icon-btn" aria-label="Mês anterior" onClick={() => goMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
              <ChevronLeft size={18} />
            </button>
            <label className="dy-month">
              <span className="dy-sr">Escolher mês</span>
              <select value={month} onChange={(e) => goMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {capitalize(monthName(m))}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="dy-icon-btn" aria-label="Próximo mês" disabled={month >= currentMonth} onClick={() => goMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
              <ChevronRight size={18} />
            </button>
            <button type="button" className="dy-today-btn" disabled={month === currentMonth && !focusDay} onClick={() => update({ month: currentMonth })}>
              Hoje
            </button>
          </div>

          <div className="dy-seg" role="radiogroup" aria-label="Filtrar momentos">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={filter === value} className={filter === value ? "is-active" : ""} onClick={() => update({ filter: value }, "replace")}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <div className="dy-state" role="alert">
          <strong>{error}</strong>
          <button type="button" className="btn primary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      ) : !data ? (
        <Skeleton />
      ) : !data.months.length && filter === "all" ? (
        <div className="dy-state dy-empty">
          <BookOpenText size={30} aria-hidden="true" />
          <strong>Seu Diário ainda está vazio.</strong>
          <span>Quando você assistir filmes e séries, seus momentos aparecem aqui.</span>
          <Link href="/discover" className="btn">
            Explorar títulos
          </Link>
        </div>
      ) : (
        <div className={`dy-feed${loading ? " is-busy" : ""}`} aria-busy={loading}>
          {focusMissing ? (
            <div className="dy-notice" role="status">
              <span>
                {FILTER_EMPTY[filter]} em {longDate(focusDay!, today)}.
              </span>
              <button type="button" className="dy-text-btn" onClick={() => update({ month })}>
                Ver {monthName(month)}
              </button>
            </div>
          ) : null}

          {data.truncated ? <p className="dy-notice">Este mês tem mais atividades do que cabem numa página; as mais recentes aparecem primeiro.</p> : null}

          {!data.days.length ? (
            <div className="dy-state dy-month-empty">
              <strong>
                {FILTER_EMPTY[filter]} em {monthName(month)}.
              </strong>
              {filter !== "all" ? (
                <button type="button" className="dy-text-btn" onClick={() => update({ filter: "all" }, "replace")}>
                  Ver tudo
                </button>
              ) : null}
            </div>
          ) : null}

          {days.map((day) => (
            <Day key={day.day} day={day} today={today} focused={day.day === focusDay} />
          ))}

          {nextCursor ? (
            <div className="dy-more">
              <button type="button" className="dy-more-btn" onClick={loadOlder} disabled={moreState === "loading"}>
                {moreState === "loading" ? "Carregando…" : `Carregar ${monthName(nextCursor)}`}
              </button>
              {moreState === "error" ? (
                <span className="dy-more-error" role="alert">
                  Não foi possível carregar agora. Tente de novo.
                </span>
              ) : null}
            </div>
          ) : days.length ? (
            <p className="dy-end">Início do seu Diário.</p>
          ) : null}
        </div>
      )}
    </>
  );
}

export function DiaryPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <DiaryContent />
    </Suspense>
  );
}
