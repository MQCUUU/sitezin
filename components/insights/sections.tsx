"use client";

import Link from "next/link";

import { Poster } from "@/components/Poster";
import { ConnectedPosterActions } from "@/components/media/ConnectedPosterActions";
import { Button } from "@/components/ui/Button";
import { Heatmap } from "@/components/insights/charts";
import { communityLine, decimal, genreRows, monthBars, periodWhen, periodChange, summaryFicha, summaryHeadline } from "@/lib/insights/clean";
import type { InsightsPayload } from "@/lib/insights/types";

/*
 * Fase 7 — Insights clean. Uma frase grande e poucos blocos; o que ninguém
 * olhava saiu. Cores: âmbar só no que é seu (sua média, sua nota, o atual).
 */

type Data = InsightsPayload;

/** Os 1–2 insights de maior prioridade, em texto puro. */
export function headlineInsights(data: Data) {
  return data.insights.filter((i) => i.priority <= 2).slice(0, 2);
}

export function Opening({ data }: { data: Data }) {
  const { cur, prev } = data.summary;
  const { period, today } = data.meta;
  const ficha = summaryFicha(cur);
  const change = periodChange(cur, prev, period, today);
  const lines = headlineInsights(data);

  return (
    <section aria-label="Resumo do período">
      <h1 className="ix-title">
        <span className="mc-visually-hidden">Insights: </span>
        {summaryHeadline(cur, period, today)}
      </h1>
      <p className="ix-ficha">
        {ficha}
        {cur.avgRating !== null ? (
          <>
            {ficha ? ", " : ""}
            <strong className="ix-mine">sua média {decimal(cur.avgRating)}</strong>
          </>
        ) : null}
      </p>
      {change ? <p className="ix-change">{change}</p> : null}
      {lines.length ? <p className="ix-lines">{lines.map((i) => i.message).join(" ")}</p> : null}
    </section>
  );
}

export function EmptyOpening({ data, onPeriod }: { data: Data; onPeriod: (period: string) => void }) {
  const { period, today, historyTotal } = data.meta;

  if (historyTotal === 0) {
    return (
      <section aria-label="Resumo do período">
        <h1 className="ix-title">
          <span className="mc-visually-hidden">Insights: </span>Seus insights começam aqui
        </h1>
        <p className="ix-ficha">Marque o que você assistiu e dê notas. Aqui aparece quanto, quando e do que você gosta.</p>
        <div className="ix-actions">
          <Link href="/discover" className="btn primary">
            Descobrir títulos
          </Link>
          <Link href="/library" className="btn">
            Abrir biblioteca
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Resumo do período">
      <h1 className="ix-title">
        <span className="mc-visually-hidden">Insights: </span>Nada assistido {periodWhen(period, today)}
      </h1>
      <p className="ix-ficha">Seu histórico está em outro período.</p>
      <div className="ix-actions">
        {period !== "12m" ? (
          <Button variant="primary" type="button" onClick={() => onPeriod("12m")}>
            Ver últimos 12 meses
          </Button>
        ) : null}
        <Button type="button" onClick={() => onPeriod("all")}>
          Ver todo o histórico
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Ritmo */

export function Rhythm({ data }: { data: Data }) {
  const a = data.activity;

  if (!a) return null;

  const bars = monthBars(a.monthly, data.meta.today);
  const peak = bars.reduce((best, b) => (b.ratio > best.ratio ? b : best), bars[0]);
  const years = Array.from(new Set(a.days.map((d) => Number(d[0].slice(0, 4))))).sort();

  if (!bars.length && !a.days.length) return null;

  return (
    <section className="ix-block" aria-labelledby="ix-ritmo">
      <h2 id="ix-ritmo" className="ix-h2">
        Ritmo
      </h2>
      {bars.length ? (
        <ol className="ix-months" aria-label="Horas assistidas por mês">
          {bars.map((b) => (
            <li key={b.key} className={b.current ? "is-current" : undefined}>
              <span className="ix-month-peak" aria-hidden="true">
                {peak && b.key === peak.key && b.hours > 0 ? `${b.hours} h` : ""}
              </span>
              <span className="ix-month-bar" style={{ height: `${Math.max(2, b.ratio * 100)}%` }} />
              <span className="ix-month-label">{b.label}</span>
              <span className="mc-visually-hidden">: {b.hours} h</span>
            </li>
          ))}
        </ol>
      ) : null}
      {a.days.length ? (
        <>
          <h3 className="ix-h3">Dia a dia</h3>
          <Heatmap days={a.days} years={years} compact />
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------ Gêneros */

export function Genres({ data }: { data: Data }) {
  const t = data.taste;

  if (!t || t.consumed < 3) return null;

  const rows = genreRows(t.genres);

  if (!rows.length) return null;

  return (
    <section className="ix-block" aria-labelledby="ix-generos">
      <h2 id="ix-generos" className="ix-h2">
        Gêneros
      </h2>
      <ul className="ix-genres">
        {rows.map((g) => (
          <li key={g.name}>
            <span className="ix-genre-name">{g.name}</span>
            <span className="ix-genre-track" aria-hidden="true">
              <span style={{ width: `${Math.max(2, g.ratio * 100)}%` }} />
            </span>
            <span className="ix-genre-count">{g.count}</span>
            <span className="ix-genre-avg">{g.avg ? <span className="ix-mine">média {g.avg}</span> : null}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ Notas */

export function Ratings({ data }: { data: Data }) {
  const r = data.ratings;

  if (!r || r.n === 0) return null;

  const max = Math.max(1, ...r.histogram);
  const facts = [
    r.median !== null ? `mediana ${decimal(r.median)}` : null,
    r.mode !== null ? `nota mais usada ${r.mode}` : null,
    `${r.n.toLocaleString("pt-BR")} ${r.n === 1 ? "avaliado" : "avaliados"}${r.coverage !== null ? ` (${Math.round(r.coverage * 100)}% do que assistiu)` : ""}`,
  ].filter(Boolean);
  const community = communityLine(r.community);

  return (
    <section className="ix-block" aria-labelledby="ix-notas">
      <h2 id="ix-notas" className="ix-h2">
        Notas
      </h2>
      <div className="ix-rating-head">
        <strong className="ix-rating-big ix-mine">{r.mean !== null ? decimal(r.mean) : "—"}</strong>
        <span className="ix-rating-facts">{facts.join(", ")}</span>
      </div>
      <ol className="ix-histo" aria-label="Quantas vezes você deu cada nota">
        {r.histogram.map((count, index) => (
          <li key={index} className={r.mode === index + 1 ? "is-mode" : undefined}>
            <span className="ix-histo-bar" style={{ height: `${Math.max(count > 0 ? 4 : 0, (count / max) * 100)}%` }} />
            <span className="ix-histo-label">{index + 1}</span>
            <span className="mc-visually-hidden">: {count}</span>
          </li>
        ))}
      </ol>
      {community ? <p className="ix-note">{community}</p> : null}
    </section>
  );
}

/* ------------------------------------------------------------ Maiores notas */

export function TopRated({ data }: { data: Data }) {
  const items = data.ranking.slice(0, 5);

  if (!items.length) return null;

  const typeParam = data.meta.type !== "all" ? `?type=${data.meta.type}` : "";

  return (
    <section className="ix-block" aria-labelledby="ix-top">
      <div className="ix-block-head">
        <h2 id="ix-top" className="ix-h2">
          Suas maiores notas
        </h2>
        <Link href={`/ranking${typeParam}`} className="ix-link">
          Ranking completo
        </Link>
      </div>
      <ul className="ix-top">
        {items.map((item) => (
          <li key={`${item.type}-${item.tmdb_id}`}>
            <span className="ix-top-poster mc-pa-host mc-frame">
              <Link href={`/title/${item.type}/${item.tmdb_id}`} tabIndex={-1} aria-hidden="true">
                <Poster path={item.poster_path} alt="" sizes="(max-width: 600px) 120px, 160px" />
              </Link>
              <ConnectedPosterActions media={{ tmdbId: Number(item.tmdb_id), mediaType: item.type === "tv" ? "tv" : "movie", title: item.title, posterPath: item.poster_path ?? null }} />
            </span>
            <Link href={`/title/${item.type}/${item.tmdb_id}`} className="ix-top-title mc-focusable">
              {item.title}
            </Link>
            <span className="ix-mine">{decimal(item.rating)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ Rodapé */

export function YearLink({ data }: { data: Data }) {
  const y = data.year;

  if (!y || y.core.movies + y.core.series === 0) return null;

  return (
    <p className="ix-foot">
      <Link href={`/retrospective?year=${y.year}`} className="ix-link">
        Retrospectiva de {y.year}
      </Link>
    </p>
  );
}
