"use client";

import { useState } from "react";

import { durationLabel, hoursText, monthShort, nf } from "./ui";

/* Gráficos da página Insights (SVG/CSS, sem dependência). */

/** Histograma 1–10 (notas 0–1,4 entram em "1"). Valor escrito acima de cada barra. */
export function Histogram({ buckets, highlight }: { buckets: number[]; highlight?: number | null }) {
  const max = Math.max(1, ...buckets);
  const total = buckets.reduce((a, b) => a + b, 0);

  return (
    <div
      className="ins-histo"
      role="img"
      aria-label={`Quantidade de títulos por nota: ${buckets.map((c, i) => `nota ${i + 1}: ${c}`).join(", ")}`}
    >
      {buckets.map((count, index) => (
        <div
          key={index}
          className={`ins-histo-col${highlight === index + 1 ? " is-top" : ""}`}
          title={`Nota ${index + 1}: ${count} título${count === 1 ? "" : "s"}${total ? ` (${Math.round((count / total) * 100)}%)` : ""}`}
        >
          <span className="ins-histo-count">{count > 0 ? count : ""}</span>
          <span className="ins-histo-bar">
            <span style={{ height: `${(count / max) * 100}%` }} />
          </span>
          <span className="ins-histo-label">{index + 1}</span>
        </div>
      ))}
    </div>
  );
}

export type MonthPoint = { month: string; movies: number; episodes: number; minutes: number };
export type MonthMetric = "minutes" | "movies" | "episodes";

/**
 * "Seu ano": área mensal com UMA métrica por vez (Horas | Filmes | Episódios).
 * A leitura do mês fica escrita acima do gráfico (começa no último mês),
 * então não depende de hover; toque/clique num mês para trocar.
 */
export function MonthlyChart({ data, metric }: { data: MonthPoint[]; metric: MonthMetric }) {
  const [active, setActive] = useState<number | null>(null);

  if (data.length < 2) {
    return <p className="ins-muted">Precisamos de pelo menos dois meses de histórico para desenhar a evolução.</p>;
  }

  const value = (p: MonthPoint) => (metric === "minutes" ? p.minutes / 60 : p[metric]);
  const fmt = (p: MonthPoint) =>
    metric === "minutes"
      ? durationLabel(p.minutes)
      : metric === "movies"
        ? `${nf.format(p.movies)} ${p.movies === 1 ? "filme" : "filmes"}`
        : `${nf.format(p.episodes)} ${p.episodes === 1 ? "episódio" : "episódios"}`;
  const width = 720;
  const height = 200;
  const top = 12;
  const bottom = 6;
  const max = Math.max(1, ...data.map(value));
  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => top + (1 - v / max) * (height - top - bottom);
  const line = data.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(value(p)).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const shown = active ?? data.length - 1;
  const step = Math.max(1, Math.ceil(data.length / 12));
  const point = data[shown];

  return (
    <div className="ins-chart">
      <div className="ins-chart-readout" aria-live="polite">
        <strong>{fmt(point)}</strong>
        <span>
          em {monthShort(point.month)} de {point.month.slice(0, 4)} · {point.movies} {point.movies === 1 ? "filme" : "filmes"} ·{" "}
          {point.episodes} {point.episodes === 1 ? "episódio" : "episódios"}
        </span>
      </div>
      <div className="ins-chart-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Evolução mensal: ${data.map((p) => `${monthShort(p.month)} ${fmt(p)}`).join(", ")}`}
        >
          <defs>
            <linearGradient id="insMonthly" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={0} x2={width} y1={top + g * (height - top - bottom)} y2={top + g * (height - top - bottom)} className="ins-grid-line" />
          ))}
          <path d={area} fill="url(#insMonthly)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <line x1={x(shown)} x2={x(shown)} y1={0} y2={height} className="ins-cursor" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="ins-chart-dot" style={{ left: `${(x(shown) / width) * 100}%`, top: `${(y(value(point)) / height) * 100}%` }} aria-hidden="true" />
        <div className="ins-chart-hit">
          {data.map((p, i) => (
            <button
              key={p.month}
              type="button"
              aria-label={`${monthShort(p.month)} de ${p.month.slice(0, 4)}: ${fmt(p)}`}
              aria-pressed={i === shown}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      </div>
      <div className="ins-chart-axis" aria-hidden="true">
        {data.map((p, i) => (
          <span key={p.month}>{i % step === 0 || i === data.length - 1 ? monthShort(p.month) : ""}</span>
        ))}
      </div>
    </div>
  );
}

/** Barras 100% empilhadas por ano (gênero principal de cada título). Tons de uma só cor. */
export function StackedYears({ rows }: { rows: { year: number; total: number; parts: { name: string; share: number }[] }[] }) {
  const names = Array.from(new Set(rows.flatMap((r) => r.parts.map((p) => p.name)))).sort((a, b) =>
    a === "Outros" ? 1 : b === "Outros" ? -1 : 0
  );
  const tone = (name: string) => (name === "Outros" ? "ins-tone-rest" : `ins-tone-${Math.min(3, names.indexOf(name))}`);

  return (
    <div className="ins-stacked">
      <ul className="ins-stacked-legend">
        {names.map((n) => (
          <li key={n}>
            <span className={tone(n)} aria-hidden="true" />
            {n}
          </li>
        ))}
      </ul>
      {rows.map((row) => (
        <div key={row.year} className="ins-stacked-row">
          <span className="ins-stacked-year">{row.year}</span>
          <span
            className="ins-stacked-bar"
            role="img"
            aria-label={`${row.year}: ${row.parts.map((p) => `${p.name} ${Math.round(p.share * 100)}%`).join(", ")}`}
          >
            {row.parts
              .filter((p) => p.share > 0)
              .map((p) => (
                <span key={p.name} className={tone(p.name)} style={{ width: `${p.share * 100}%` }} title={`${p.name}: ${Math.round(p.share * 100)}% de ${row.total} títulos`}>
                  {p.share >= 0.12 ? `${Math.round(p.share * 100)}%` : ""}
                </span>
              ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Proporção Filmes × Séries do tempo assistido (rótulos sempre visíveis).
 * Recebe HORAS INTEIRAS já divididas pelo motor (filmes + séries = total).
 */
export function SplitBar({ movies, series }: { movies: number; series: number }) {
  const total = movies + series;

  if (total <= 0) return null;

  const m = movies / total;
  const moviePct = Math.round(m * 100);

  return (
    <div className="ins-split">
      <span className="ins-split-bar" role="img" aria-label={`Filmes ${moviePct}%, séries ${100 - moviePct}%`}>
        <span className="is-movies" style={{ width: `${m * 100}%` }} />
        <span className="is-series" style={{ width: `${(1 - m) * 100}%` }} />
      </span>
      <span className="ins-split-legend">
        <span>
          <i className="is-movies" aria-hidden="true" /> Filmes · <strong>{hoursText(movies)}</strong> ({moviePct}%)
        </span>
        <span>
          <i className="is-series" aria-hidden="true" /> Séries · <strong>{hoursText(series)}</strong> ({100 - moviePct}%)
        </span>
      </span>
    </div>
  );
}
