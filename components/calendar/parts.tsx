"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ChevronRight, Film, Tv, X } from "lucide-react";

import { Poster } from "@/components/Poster";
import { img } from "@/lib/tmdb";
import { addDays, capitalize, dayHeading, daysBetween, longDate, monthKey, relativeWhen, startOfWeek, weekday, WEEKDAYS_SHORT } from "@/lib/calendar/dates";
import type { CalendarEvent } from "@/lib/calendar/types";

import { detailLabel, eventAria, personalLine, typeLabel } from "./copy";

/* ------------------------------------------------------------------ card */

/** O card inteiro abre o título. Responde: o que é, qual evento, por que importa. */
export function EventCard({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const detail = detailLabel(event);
  const personal = personalLine(event);

  return (
    <Link
      href={`/title/${event.media_type}/${event.tmdb_id}`}
      className={`cal-card${event.relationship ? " is-personal" : ""}${event.watched ? " is-watched" : ""}${compact ? " is-compact" : ""}`}
      aria-label={eventAria(event)}
    >
      <span className="cal-card-poster">
        <Poster path={event.poster_path} alt="" sizes={compact ? "48px" : "72px"} />
      </span>
      {compact ? (
        // Compacto (Semana): título + UMA linha curta — o motivo pessoal ou o tipo.
        <span className="cal-card-body">
          <strong className="cal-card-title">{event.title}</strong>
          <span className={personal ? "cal-card-personal" : "cal-card-sub"}>{personal ?? detail ?? typeLabel(event)}</span>
        </span>
      ) : (
        <span className="cal-card-body">
          <span className="cal-card-type">
            {event.media_type === "tv" ? <Tv size={13} aria-hidden="true" /> : <Film size={13} aria-hidden="true" />}
            {typeLabel(event)}
            {detail ? <em>· {detail}</em> : null}
          </span>
          <strong className="cal-card-title">{event.title}</strong>
          {personal ? <span className="cal-card-personal">{personal}</span> : null}
        </span>
      )}
      <ChevronRight className="cal-card-arrow" size={18} aria-hidden="true" />
    </Link>
  );
}

/** Eventos do dia: pessoais primeiro; "Outros lançamentos" só quando há os dois. */
export function DayEvents({ events, compact = false }: { events: CalendarEvent[]; compact?: boolean }) {
  const personal = events.filter((e) => e.relationship);
  const other = events.filter((e) => !e.relationship);

  return (
    <div className="cal-day-events">
      {personal.map((e) => (
        <EventCard key={e.id} event={e} compact={compact} />
      ))}
      {personal.length > 0 && other.length > 0 ? <span className="cal-divider">Outros lançamentos</span> : null}
      {other.map((e) => (
        <EventCard key={e.id} event={e} compact={compact} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

export function Hero({ event, personal, today }: { event: CalendarEvent; personal: boolean; today: string }) {
  const detail = detailLabel(event);
  const line = personalLine(event);

  return (
    <Link href={`/title/${event.media_type}/${event.tmdb_id}`} className="cal-hero" aria-label={`${personal ? "Próximo para você" : "Próximo lançamento"}: ${eventAria(event)}, ${relativeWhen(event.date, today)}`}>
      {event.backdrop_path ? <span className="cal-hero-bg" style={{ backgroundImage: `url(${img(event.backdrop_path, "w1280")})` }} aria-hidden="true" /> : null}
      <span className="cal-hero-shade" aria-hidden="true" />
      <span className="cal-hero-content">
        <span className="cal-kicker">{personal ? "Próximo para você" : "Próximo lançamento"}</span>
        <strong className="cal-hero-title">{event.title}</strong>
        <span className="cal-hero-meta">
          {typeLabel(event)}
          {detail ? ` · ${detail}` : ""}
        </span>
        <span className="cal-hero-when">{relativeWhen(event.date, today)}</span>
        {line ? <span className="cal-hero-personal">{line}</span> : null}
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ agenda */

export function AgendaView({ events, today }: { events: CalendarEvent[]; today: string }) {
  const days = groupByDay(events);

  return (
    <div className="cal-agenda">
      {days.map(([day, list]) => (
        <section key={day} className={`cal-agenda-day${day === today ? " is-today" : ""}`} aria-labelledby={`d-${day}`}>
          <h3 id={`d-${day}`} className="cal-agenda-head">
            <span>{dayHeading(day, today)}</span>
            {day === today || day === addDays(today, 1) ? <small>{capitalize(longDate(day, today))}</small> : null}
          </h3>
          <DayEvents events={list} />
        </section>
      ))}
    </div>
  );
}

export function groupByDay(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();

  for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);

  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/* ------------------------------------------------------------------ semana */

export function WeekView({ events, anchor, today, onOpenDay }: { events: CalendarEvent[]; anchor: string; today: string; onOpenDay: (day: string) => void }) {
  const start = startOfWeek(anchor);
  const byDay = new Map(groupByDay(events));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <ol className="cal-week" aria-label="Semana">
      {days.map((day) => {
        const list = byDay.get(day) ?? [];
        const personal = list.filter((e) => e.relationship).length;
        const shown = list.slice(0, 3);

        return (
          <li key={day} className={`cal-week-day${day === today ? " is-today" : ""}${list.length ? "" : " is-empty"}`}>
            <button type="button" className="cal-week-head" onClick={() => onOpenDay(day)} disabled={!list.length} aria-label={`${longDate(day, today)}: ${list.length} ${list.length === 1 ? "lançamento" : "lançamentos"}${personal ? `, ${personal} para você` : ""}`}>
              <span className="cal-week-wd">{WEEKDAYS_SHORT[weekday(day)]}</span>
              <span className="cal-week-num">{Number(day.slice(8))}</span>
              {list.length ? <span className="cal-count">{list.length}</span> : null}
            </button>
            {shown.length ? (
              <div className="cal-week-list">
                {shown.map((e) => (
                  <EventCard key={e.id} event={e} compact />
                ))}
                {list.length > 3 ? (
                  <button type="button" className="cal-more" onClick={() => onOpenDay(day)}>
                    +{list.length - 3} {list.length - 3 === 1 ? "lançamento" : "lançamentos"}
                  </button>
                ) : null}
              </div>
            ) : (
              <span className="cal-week-empty" aria-hidden="true">—</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ mês */

export function MonthView({ events, anchor, from, to, today, onOpenDay }: { events: CalendarEvent[]; anchor: string; from: string; to: string; today: string; onOpenDay: (day: string) => void }) {
  const byDay = new Map(groupByDay(events));
  const total = daysBetween(from, to) + 1;
  const days = Array.from({ length: total }, (_, i) => addDays(from, i));
  const month = monthKey(anchor);

  return (
    <div className="cal-month" role="grid" aria-label="Mês">
      <div className="cal-month-wd" role="row">
        {WEEKDAYS_SHORT.map((w) => (
          <span key={w} role="columnheader">
            {w}
          </span>
        ))}
      </div>
      <div className="cal-month-grid" role="rowgroup">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const personal = list.filter((e) => e.relationship);
          const shown = [...personal, ...list.filter((e) => !e.relationship)].slice(0, 3);
          const outside = monthKey(day) !== month;

          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              className={`cal-cell${day === today ? " is-today" : ""}${outside ? " is-outside" : ""}${list.length ? " has-events" : ""}`}
              onClick={() => list.length && onOpenDay(day)}
              aria-disabled={!list.length}
              aria-label={`${longDate(day, today)}${list.length ? `: ${list.length} ${list.length === 1 ? "lançamento" : "lançamentos"}${personal.length ? `, ${personal.length} para você` : ""}` : ": nenhum lançamento"}`}
            >
              <span className="cal-cell-num">
                {Number(day.slice(8))}
                {personal.length ? <i className="cal-dot" aria-hidden="true" /> : null}
              </span>
              {shown.length ? (
                <span className="cal-cell-posters" aria-hidden="true">
                  {shown.map((e) => (
                    <span key={e.id} className={`cal-mini${e.relationship ? " is-personal" : ""}`}>
                      <Poster path={e.poster_path} alt="" sizes="40px" />
                    </span>
                  ))}
                </span>
              ) : null}
              {list.length > shown.length ? <span className="cal-cell-more" aria-hidden="true">+{list.length - shown.length}</span> : null}
              {list.length ? <span className="cal-cell-count" aria-hidden="true">{list.length}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ detalhes do dia */

export function DayDetails({ day, events, today, onClose }: { day: string; events: CalendarEvent[]; today: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const personal = events.filter((e) => e.relationship);
  const other = events.filter((e) => !e.relationship);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;

    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="cal-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="cal-sheet" role="dialog" aria-modal="true" aria-labelledby="cal-sheet-title" tabIndex={-1}>
        <header className="cal-sheet-head">
          <div>
            <span className="cal-kicker">{Math.abs(daysBetween(today, day)) <= 1 ? dayHeading(day, today) : "Lançamentos do dia"}</span>
            <h2 id="cal-sheet-title">{capitalize(longDate(day, today))}</h2>
          </div>
          <button type="button" className="cal-icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        {personal.length ? (
          <section>
            <h3 className="cal-sheet-sub">Para você · {personal.length}</h3>
            <div className="cal-day-events">
              {personal.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </section>
        ) : null}
        {other.length ? (
          <section>
            <h3 className="cal-sheet-sub">{personal.length ? "Outros lançamentos" : "Lançamentos"} · {other.length}</h3>
            <div className="cal-day-events">
              {other.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
