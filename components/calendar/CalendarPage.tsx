"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";

import { Search } from "@/components/Search";
import { CALENDAR_TZ, addDays, addMonths, capitalize, firstOfMonth, isDay, longDate, monthGrid, monthKey, monthLabel, startOfWeek, todayIn } from "@/lib/calendar/dates";
import { pickHero, summarize } from "@/lib/calendar/build";
import type { CalendarEvent, CalendarResponse } from "@/lib/calendar/types";

import { AgendaView, DayDetails, Hero, MonthView, WeekView, groupByDay } from "./parts";
import { Button } from "@/components/ui/Button";

/*
 * Calendário V2 — "meu calendário pessoal de filmes e séries".
 *  Agenda (padrão): de hoje em diante, 60 dias por vez ("Carregar mais").
 *  Semana / Mês: navegação ← → e "Hoje"; clique num dia abre os detalhes.
 * URL: ?view=agenda|week|month &date=AAAA-MM-DD &filter=all|mine|movie|tv
 * Uma requisição por período (/api/calendar/events), cache em memória por
 * período; trocar filtro NÃO refaz requisição (é só um recorte local).
 */

type View = "agenda" | "week" | "month";
type Filter = "all" | "mine" | "movie" | "tv";

const VIEWS: [View, string][] = [
  ["agenda", "Agenda"],
  ["week", "Semana"],
  ["month", "Mês"],
];

const FILTERS: [Filter, string, string][] = [
  ["all", "Todos", "Todos os lançamentos"],
  ["mine", "Para mim", "Só o que está na sua biblioteca: séries que você acompanha, watchlist e biblioteca"],
  ["movie", "Filmes", "Só filmes"],
  ["tv", "Séries", "Só séries"],
];

const AGENDA_SPAN = 60;
const cache = new Map<string, { at: number; data: CalendarResponse }>();
const TTL = 2 * 60 * 1000;

async function fetchRange(from: string, to: string): Promise<CalendarResponse> {
  const key = `${from}|${to}`;
  const hit = cache.get(key);

  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const response = await fetch(`/api/calendar/events?from=${from}&to=${to}`, { cache: "no-store" });

  if (response.status === 401) throw new Error("Entre na sua conta para ver seu calendário.");
  if (!response.ok) throw new Error("Não foi possível carregar o calendário agora.");

  const data = (await response.json()) as CalendarResponse;

  cache.set(key, { at: Date.now(), data });

  return data;
}

function applyFilter(events: CalendarEvent[], filter: Filter) {
  if (filter === "mine") return events.filter((e) => e.relationship);
  if (filter === "movie") return events.filter((e) => e.media_type === "movie");
  if (filter === "tv") return events.filter((e) => e.media_type === "tv");

  return events;
}

function Skeleton() {
  return (
    <div className="cal-skeleton" role="status" aria-label="Carregando o calendário">
      <div className="mc-skeleton cal-skel-hero" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="cal-skel-day">
          <div className="mc-skeleton cal-skel-line" />
          <div className="mc-skeleton cal-skel-card" />
          <div className="mc-skeleton cal-skel-card" />
        </div>
      ))}
    </div>
  );
}

/** "a, b e c" — a frase do resumo, sem "·". */
function joinParts(parts: string[]) {
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0];
}

/** Grupo de rádio: setas escolhem a opção vizinha e levam o foco junto. */
function onRadioKey<T extends string>(event: KeyboardEvent<HTMLDivElement>, values: T[], current: T, choose: (value: T) => void) {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;

  event.preventDefault();

  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
  const next = (values.indexOf(current) + step + values.length) % values.length;

  choose(values[next]);
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
}

function CalendarContent() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  // Mesmo fuso no SSR e no navegador (Brasília, igual à API): sem divergência de hidratação.
  const today = useMemo(() => todayIn(CALENDAR_TZ), []);

  const rawView = search.get("view");
  const view: View = rawView === "week" || rawView === "month" ? rawView : "agenda";
  const rawDate = search.get("date") || "";
  const anchor = isDay(rawDate) ? rawDate : /^\d{4}-\d{2}$/.test(rawDate) && isDay(`${rawDate}-01`) ? `${rawDate}-01` : today;
  const rawFilter = search.get("filter");
  const filter: Filter = rawFilter === "mine" || rawFilter === "movie" || rawFilter === "tv" ? rawFilter : "all";

  const range = useMemo(() => {
    if (view === "week") {
      const from = startOfWeek(anchor);

      return { from, to: addDays(from, 6) };
    }

    if (view === "month") return monthGrid(anchor);

    return { from: today, to: addDays(today, AGENDA_SPAN - 1) };
  }, [view, anchor, today]);

  const [data, setData] = useState<CalendarResponse | null>(null);
  const [extra, setExtra] = useState<CalendarEvent[]>([]);
  const [agendaTo, setAgendaTo] = useState(range.to);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError(null);
    setExtra([]);
    setAgendaTo(range.to);

    fetchRange(range.from, range.to)
      .then((payload) => {
        if (alive) setData(payload);
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
  }, [range.from, range.to, attempt]);

  const loadMore = useCallback(async () => {
    const from = addDays(agendaTo, 1);
    const to = addDays(from, AGENDA_SPAN - 1);

    setLoadingMore(true);

    try {
      const more = await fetchRange(from, to);

      setExtra((current) => {
        const seen = new Set([...(data?.events ?? []), ...current].map((e) => e.id));

        return [...current, ...more.events.filter((e) => !seen.has(e.id))];
      });
      setAgendaTo(to);
    } catch {
      setError("Não foi possível carregar mais lançamentos agora.");
    } finally {
      setLoadingMore(false);
    }
  }, [agendaTo, data]);

  const update = useCallback(
    (changes: Record<string, string | null>, mode: "push" | "replace" = "push") => {
      const next = new URLSearchParams(search.toString());

      for (const [k, v] of Object.entries(changes)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }

      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router, search]
  );

  const allEvents = useMemo(() => [...(data?.events ?? []), ...extra], [data, extra]);
  const events = useMemo(() => applyFilter(allEvents, filter), [allEvents, filter]);
  const hero = view === "agenda" ? pickHero(events, today) : null;
  const week = useMemo(() => summarize(applyFilter(allEvents, filter).filter((e) => e.date >= today && e.date <= addDays(today, 6))), [allEvents, filter, today]);
  const dayEvents = openDay ? events.filter((e) => e.date === openDay) : [];

  const step = (dir: 1 | -1) =>
    update({ date: view === "week" ? addDays(startOfWeek(anchor), dir * 7) : addMonths(firstOfMonth(anchor), dir).slice(0, 7) });
  const periodLabel =
    view === "month"
      ? capitalize(monthLabel(anchor))
      : view === "week"
        ? (() => {
            // Fase 4: "8 a 14 de novembro" (mesmo mês) ou "29 de novembro a 5 de dezembro" — cabe no celular.
            const from = startOfWeek(anchor);
            const to = addDays(from, 6);
            const f = longDate(from, today).split(", ")[1];
            const t = longDate(to, today).split(", ")[1];

            return monthKey(from) === monthKey(to) ? `${Number(from.slice(8))} a ${t}` : `${f} a ${t}`;
          })()
        : "";
  const isCurrentPeriod = view === "week" ? startOfWeek(anchor) === startOfWeek(today) : firstOfMonth(anchor) === firstOfMonth(today);
  const weekParts = [
    week.following ? `${week.following} ${week.following === 1 ? "lançamento de série que você acompanha" : "lançamentos de séries que você acompanha"}` : null,
    week.watchlist ? `${week.watchlist} da sua watchlist` : null,
    week.library ? `${week.library} da sua biblioteca` : null,
    week.other ? `${week.other} ${week.other === 1 ? "outro lançamento" : "outros lançamentos"}` : null,
  ].filter(Boolean);

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      {/* Fase 4: sem rótulo em caixa alta — título e uma frase. */}
      <header className="cal-header">
        <h1>Calendário</h1>
        <p>Seus próximos episódios, estreias e tudo que vale acompanhar.</p>
      </header>

      {/* Visualização: abas de texto; a escolhida ganha o traço na cor de destaque (mesmo padrão da Biblioteca e do Diário). */}
      <div className="cal-views" role="radiogroup" aria-label="Visualização" onKeyDown={(event) => onRadioKey(event, VIEWS.map(([v]) => v), view, (v) => update({ view: v === "agenda" ? null : v, date: null }))}>
        {VIEWS.map(([value, label]) => {
          const checked = view === value;

          return (
            <button key={value} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1} className="cal-view" onClick={() => update({ view: value === "agenda" ? null : value, date: null })}>
              {label}
              {checked ? <motion.span layoutId="cal-view-indicator" className="cal-view-indicator" transition={{ type: "spring", duration: 0.32, bounce: 0 }} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <div className="cal-tools">
        {view !== "agenda" ? (
          <div className="cal-nav" role="group" aria-label="Navegar no período">
            <button type="button" className="cal-icon-btn" onClick={() => step(-1)} aria-label={view === "week" ? "Semana anterior" : "Mês anterior"}>
              <ChevronLeft size={20} />
            </button>
            <strong className="cal-period" aria-live="polite">
              {periodLabel}
            </strong>
            <button type="button" className="cal-icon-btn" onClick={() => step(1)} aria-label={view === "week" ? "Próxima semana" : "Próximo mês"}>
              <ChevronRight size={20} />
            </button>
            <button type="button" className="cal-today-btn" onClick={() => update({ date: null })} disabled={isCurrentPeriod}>
              Hoje
            </button>
          </div>
        ) : null}

        <div className="cal-filters" role="radiogroup" aria-label="Filtrar" onKeyDown={(event) => onRadioKey(event, FILTERS.map(([v]) => v), filter, (v) => update({ filter: v === "all" ? null : v }, "replace"))}>
          {FILTERS.map(([value, label, hint]) => (
            <button key={value} type="button" role="radio" aria-checked={filter === value} tabIndex={filter === value ? 0 : -1} title={hint} className="cal-chip" onClick={() => update({ filter: value === "all" ? null : value }, "replace")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && !data ? (
        <div className="cal-empty" role="alert">
          <strong>{error}</strong>
          <Button variant="primary" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {!data && !error ? <Skeleton /> : null}

      {data ? (
        <div className={`cal-body${loading ? " is-loading" : ""}`} aria-busy={loading}>
          {data.partial.includes("discoveries") ? <p className="cal-note">Os lançamentos gerais não puderam ser carregados agora — mostrando o que é da sua biblioteca.</p> : null}
          {data.partial.includes("library") ? <p className="cal-note">Sua biblioteca não pôde ser consultada agora — mostrando lançamentos gerais.</p> : null}
          {!data.hasPersonalSources ? <p className="cal-note">Adicione filmes à watchlist ou acompanhe séries para personalizar seu calendário.</p> : null}

          {view === "agenda" ? (
            <>
              {hero ? <Hero event={hero.event} personal={hero.personal} today={today} /> : null}

              {weekParts.length ? <p className="cal-summary">Nos próximos 7 dias, {joinParts(weekParts as string[])}.</p> : null}

              {events.length ? (
                <>
                  <AgendaView events={events} today={today} />
                  <div className="cal-more-wrap">
                    <Button type="button" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Carregando…" : "Carregar mais"}
                    </Button>
                    <span className="cal-note">Até {longDate(agendaTo, today).split(", ")[1]}</span>
                  </div>
                </>
              ) : (
                <div className="cal-empty">
                  <strong>{filter === "mine" ? "Nada do que você acompanha chega nos próximos 60 dias." : "Nenhum lançamento encontrado nos próximos 60 dias."}</strong>
                  {filter === "mine" ? (
                    <Link href="/discover" className="btn primary">
                      Explorar títulos
                    </Link>
                  ) : null}
                </div>
              )}
            </>
          ) : null}

          {view === "week" ? (
            <>
              <WeekView events={events} anchor={anchor} today={today} onOpenDay={setOpenDay} />
              {!events.length ? <p className="cal-empty-inline">{filter === "mine" ? "Nada do que você acompanha nesta semana." : "Nenhum lançamento nesta semana."}</p> : null}
            </>
          ) : null}

          {view === "month" ? (
            <>
              <MonthView events={events} anchor={anchor} from={range.from} to={range.to} today={today} onOpenDay={setOpenDay} />
              {!events.length ? <p className="cal-empty-inline">{filter === "mine" ? "Nada do que você acompanha neste mês." : "Nenhum lançamento neste mês."}</p> : null}
              {groupByDay(events).length ? <p className="cal-note">Toque num dia para ver os lançamentos.</p> : null}
            </>
          ) : null}
        </div>
      ) : null}

      {openDay ? <DayDetails day={openDay} events={dayEvents} today={today} onClose={() => setOpenDay(null)} /> : null}
    </>
  );
}

export function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarContent />
    </Suspense>
  );
}
