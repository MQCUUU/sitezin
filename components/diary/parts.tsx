"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Clapperboard, Flag, Pause, Play, Plus, Repeat, Star, Tv } from "lucide-react";

import { img } from "@/lib/tmdb";
import { capitalize, dayHeading } from "@/lib/calendar/dates";
import { detail, formatRating, groupSummary, groupTitle, headline, iconOf, milestone, momentAria, plural } from "@/lib/diary/copy";
import type { DiaryDay, DiaryGroup, DiaryMoment, MediaRef } from "@/lib/diary/types";

/*
 * Diário — peças visuais. Hierarquia editorial: consumo/marcos com pôster;
 * organização da biblioteca em linhas compactas; volumes grandes recolhidos.
 */

const ICONS = { play: Play, check: CheckCircle2, repeat: Repeat, flag: Flag, pause: Pause, plus: Plus, dot: Circle };

const hrefOf = (media: MediaRef | null) => (media ? `/title/${media.media_type}/${media.tmdb_id}` : null);

function Poster({ media, size }: { media: MediaRef | null; size: "md" | "sm" }) {
  const [failed, setFailed] = useState(false);
  const Fallback = media?.media_type === "tv" ? Tv : Clapperboard;

  if (!media?.poster_path || failed) {
    return (
      <span className={`dy-poster dy-poster-${size} is-empty`} aria-hidden="true">
        <Fallback size={size === "md" ? 20 : 14} />
      </span>
    );
  }

  return (
    <img
      className={`dy-poster dy-poster-${size}`}
      src={img(media.poster_path, "w185")}
      alt=""
      width={size === "md" ? 56 : 32}
      height={size === "md" ? 84 : 48}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** Comentário: até 4 linhas; "Ler tudo" mostra o texto integral. */
function Comment({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = text.length > 220 || text.split("\n").length > 4;

  return (
    <div className="dy-comment">
      <p id={id} className={long && !open ? "is-clamped" : ""}>
        “{text}”
      </p>
      {long ? (
        <button type="button" className="dy-text-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          {open ? "Mostrar menos" : "Ler tudo"}
        </button>
      ) : null}
    </div>
  );
}

export function Moment({ moment }: { moment: DiaryMoment }) {
  const Icon = ICONS[iconOf(moment)];
  const href = hrefOf(moment.media);
  const title = moment.media?.title || "Título não identificado";
  const extra = detail(moment);
  const mark = milestone(moment);
  const strong = Boolean(mark) || moment.kind === "series_completed" || (moment.kind === "watched" && moment.media?.media_type === "tv");

  return (
    <article className={`dy-moment${strong ? " is-milestone" : ""}`} aria-label={momentAria(moment)}>
      <span className="dy-time" aria-hidden={!moment.time}>
        {moment.time ?? ""}
      </span>
      {href ? (
        <Link href={href} className="dy-poster-link" tabIndex={-1} aria-hidden="true">
          <Poster media={moment.media} size="md" />
        </Link>
      ) : (
        <Poster media={moment.media} size="md" />
      )}
      <div className="dy-body">
        {href ? (
          <Link href={href} className="dy-title">
            {title}
          </Link>
        ) : (
          <strong className="dy-title">{title}</strong>
        )}
        <p className="dy-what">
          <Icon size={14} aria-hidden="true" />
          <span>{headline(moment)}</span>
          {moment.time ? <span className="dy-time-inline"> · {moment.time}</span> : null}
        </p>
        {extra ? <p className="dy-detail">{extra}</p> : null}
        {mark ? (
          <p className="dy-milestone">
            <Flag size={13} aria-hidden="true" /> {mark}
          </p>
        ) : null}
        {moment.rating !== null ? (
          <p className="dy-rating">
            <Star size={13} fill="currentColor" aria-hidden="true" />
            <span>{formatRating(moment.rating)}</span>
          </p>
        ) : null}
        {moment.comment ? <Comment text={moment.comment} /> : null}
      </div>
    </article>
  );
}

/** Linha compacta: organização da biblioteca e registros sem título. */
function Compact({ moment }: { moment: DiaryMoment }) {
  const href = hrefOf(moment.media);
  const title = moment.media?.title;

  return (
    <li className="dy-compact">
      <span className="dy-time">{moment.time ?? ""}</span>
      <Poster media={moment.media} size="sm" />
      <span className="dy-compact-text">
        {title ? (
          href ? (
            <Link href={href} className="dy-compact-title">
              {title}
            </Link>
          ) : (
            <strong className="dy-compact-title">{title}</strong>
          )
        ) : null}
        <span className="dy-compact-what">{headline(moment)}</span>
      </span>
    </li>
  );
}

const GROUP_PAGE = 60;

/**
 * Sem título, o único detalhe que resta é o que aconteceu e quando: em vez de
 * dezenas de linhas idênticas, uma linha por tipo com contagem e intervalo.
 */
function summarizeUnlinked(moments: DiaryMoment[]) {
  const rows = new Map<string, { text: string; count: number; from: string | null; to: string | null }>();

  for (const m of moments) {
    const text = headline(m);
    const row = rows.get(text) ?? { text, count: 0, from: null, to: null };

    row.count += m.raw.length;
    if (m.time && (!row.from || m.time < row.from)) row.from = m.time;
    if (m.time && (!row.to || m.time > row.to)) row.to = m.time;
    rows.set(text, row);
  }

  return [...rows.values()].sort((a, b) => b.count - a.count);
}

export function Group({ group }: { group: DiaryGroup }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(GROUP_PAGE);
  const id = useId();
  const Icon = group.kind === "library" ? Plus : Circle;

  return (
    <section className={`dy-group is-${group.kind}`}>
      <button type="button" className="dy-group-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="dy-group-icon" aria-hidden="true">
          <Icon size={15} />
        </span>
        <span className="dy-group-text">
          <strong>{groupTitle(group)}</strong>
          <span>{groupSummary(group)}</span>
        </span>
        <span className="dy-group-toggle">
          {open ? "Ocultar" : "Ver detalhes"}
          <ChevronDown size={15} aria-hidden="true" />
        </span>
      </button>
      {open && group.kind === "unlinked" ? (
        <div id={id}>
          <p className="dy-group-note">Registros antigos que perderam o vínculo com o título. Eles continuam guardados; só não dá para saber de qual título eram.</p>
          <ul className="dy-summary-list">
            {summarizeUnlinked(group.moments).map((row) => (
              <li key={row.text}>
                <strong>{row.text}</strong>
                <span>
                  {plural(row.count, "registro", "registros")}
                  {row.from ? ` · ${row.from === row.to ? row.from : `${row.from}–${row.to}`}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : open ? (
        <div id={id}>
          <ul className="dy-compact-list">
            {group.moments.slice(0, shown).map((m) => (
              <Compact key={m.id} moment={m} />
            ))}
          </ul>
          {shown < group.moments.length ? (
            <button type="button" className="dy-text-btn dy-group-more" onClick={() => setShown((n) => n + GROUP_PAGE)}>
              Mostrar mais {Math.min(GROUP_PAGE, group.moments.length - shown)} de {group.moments.length - shown}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function Day({ day, today, focused }: { day: DiaryDay; today: string; focused: boolean }) {
  const primary = day.moments.filter((m) => m.tier === "primary");
  const secondary = day.moments.filter((m) => m.tier === "secondary");
  const headingId = `dy-h-${day.day}`;

  return (
    <section id={`dia-${day.day}`} className={`dy-day${focused ? " is-focused" : ""}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="dy-day-head" tabIndex={-1}>
        {capitalize(dayHeading(day.day, today))}
      </h2>
      <div className="dy-day-body">
        {primary.map((m) => (
          <Moment key={m.id} moment={m} />
        ))}
        {secondary.length ? (
          <ul className="dy-compact-list is-inline">
            {secondary.map((m) => (
              <Compact key={m.id} moment={m} />
            ))}
          </ul>
        ) : null}
        {day.groups.map((g) => (
          <Group key={g.id} group={g} />
        ))}
      </div>
    </section>
  );
}

export function Skeleton() {
  return (
    <div className="dy-skeleton" role="status" aria-label="Carregando o Diário">
      {[0, 1].map((d) => (
        <div key={d} className="dy-skel-day">
          <div className="mc-skeleton dy-skel-line" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="dy-skel-row">
              <div className="mc-skeleton dy-skel-poster" />
              <div className="dy-skel-text">
                <div className="mc-skeleton dy-skel-line is-wide" />
                <div className="mc-skeleton dy-skel-line" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
