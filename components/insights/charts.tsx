"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

import { dec, durationLabel, monthShort, nf } from "./ui";

/* Gráficos em CSS/SVG — todos com rótulo, tooltip nativo e fallback textual. */

export function HBars({
  rows,
  formatValue,
  tone = "accent",
  max: fixedMax,
}: {
  rows: { label: string; value: number; display?: string; hint?: string }[];
  formatValue?: (value: number) => string;
  tone?: "accent" | "gold" | "blue" | "muted";
  /** Escala fixa (ex.: 10 para notas) — senão, relativa ao maior valor. */
  max?: number;
}) {
  const max = fixedMax ?? Math.max(1, ...rows.map((row) => row.value));

  return (
    <ul className={`ins-hbars ins-tone-${tone}`}>
      {rows.map((row) => (
        <li key={row.label} title={row.hint}>
          <span className="ins-hbar-label">{row.label}</span>
          <span className="ins-hbar-track" aria-hidden="true">
            <span style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </span>
          <strong>{row.display ?? (formatValue ? formatValue(row.value) : nf.format(row.value))}</strong>
        </li>
      ))}
    </ul>
  );
}

export function Columns({
  data,
  highlight,
  height = 150,
  showValues = true,
}: {
  data: { label: string; value: number; title?: string }[];
  highlight?: number | null;
  height?: number;
  showValues?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div
      className="ins-columns"
      style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, height }}
      role="img"
      aria-label={data.map((d) => `${d.label}: ${d.title ?? d.value}`).join("; ")}
    >
      {data.map((d, index) => (
        <div key={`${d.label}-${index}`} className={`ins-column${highlight === index ? " is-top" : ""}`} title={d.title ?? `${d.label}: ${nf.format(d.value)}`}>
          <span className="ins-column-value">{showValues && d.value > 0 ? nf.format(Math.round(d.value)) : ""}</span>
          <span className="ins-column-bar">
            <span style={{ height: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="ins-column-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatDay(day: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`)
  );
}

function describeDay(info: [string, number, number, number]) {
  const parts: string[] = [];

  if (info[1]) parts.push(`${info[1]} filme${info[1] === 1 ? "" : "s"}`);
  if (info[2]) parts.push(`${info[2]} episódio${info[2] === 1 ? "" : "s"}`);

  return `${parts.join(" e ")} · ${durationLabel(info[3])}`;
}

export function Heatmap({ days, years }: { days: [string, number, number, number][]; years: number[] }) {
  const options = years.length ? years : [new Date().getFullYear()];
  const [year, setYear] = useState(options[options.length - 1]);
  const [selected, setSelected] = useState<string | null>(null);

  const { cells, total, monthsLabels, top, map } = useMemo(() => {
    const map = new Map(days.map((d) => [d[0], d]));
    const offset = new Date(Date.UTC(year, 0, 1)).getUTCDay();
    const cells: { day: string; level: number; col: number; row: number }[] = [];
    const inYear = days.filter((d) => d[0].startsWith(String(year)));
    const max = Math.max(0, ...inYear.map((d) => d[3]));
    const monthsLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;

    for (let i = 0; i < 366; i += 1) {
      const date = new Date(Date.UTC(year, 0, 1 + i));

      if (date.getUTCFullYear() !== year) break;

      const day = date.toISOString().slice(0, 10);
      const info = map.get(day);
      const col = Math.floor((i + offset) / 7);
      const row = (i + offset) % 7;
      const level = !info ? 0 : max === 0 ? 1 : Math.min(4, Math.max(1, Math.ceil((info[3] / max) * 4)));

      if (date.getUTCMonth() !== lastMonth) {
        lastMonth = date.getUTCMonth();
        monthsLabels.push({ col, label: monthShort(day) });
      }

      cells.push({ day, level, col, row });
    }

    const top = [...inYear].sort((a, b) => b[3] - a[3]).slice(0, 3);

    return { cells, total: inYear.length, monthsLabels, top, map };
  }, [days, year]);

  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const scroller = useRef<HTMLDivElement>(null);

  // No celular o ano não cabe: abre mostrando os meses mais recentes.
  useEffect(() => {
    const el = scroller.current;

    if (el) el.scrollLeft = el.scrollWidth;
  }, [year]);

  const info = selected ? map.get(selected) ?? null : null;

  return (
    <div className="ins-heat">
      <div className="ins-heat-head">
        <span>
          <strong>{total}</strong> {total === 1 ? "dia" : "dias"} com atividade em {year}
        </span>
        {options.length > 1 ? (
          <div className="ins-years" role="group" aria-label="Ano do mapa de atividade">
            {options.slice(-6).map((y) => (
              <button
                key={y}
                type="button"
                className={y === year ? "is-active" : ""}
                aria-pressed={y === year}
                onClick={() => {
                  setYear(y);
                  setSelected(null);
                }}
              >
                {y}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ins-heat-scroll" ref={scroller}>
        <div
          className="ins-heat-grid"
          style={{ gridTemplateColumns: `24px repeat(${cols}, var(--cell))` }}
          onClick={(event) => {
            const day = (event.target as HTMLElement).dataset.day;

            if (day) setSelected(day === selected ? null : day);
          }}
        >
          {monthsLabels.map((m) => (
            <span key={`${m.label}-${m.col}`} className="ins-heat-month" style={{ gridColumn: m.col + 2, gridRow: 1 }}>
              {m.label}
            </span>
          ))}
          {["dom", "", "ter", "", "qui", "", "sáb"].map((w, i) => (
            <span key={i} className="ins-heat-wd" style={{ gridColumn: 1, gridRow: i + 2 }}>
              {w}
            </span>
          ))}
          {cells.map((c) => {
            const cellInfo = map.get(c.day);

            return (
              <span
                key={c.day}
                data-day={c.day}
                className={`ins-heat-cell lv${c.level}${selected === c.day ? " is-selected" : ""}`}
                style={{ gridColumn: c.col + 2, gridRow: c.row + 2 }}
                title={`${c.day.split("-").reverse().join("/")}: ${cellInfo ? describeDay(cellInfo) : "sem registros"}`}
              />
            );
          })}
        </div>
      </div>

      <div className="ins-heat-foot">
        <div className="ins-heat-legend" aria-hidden="true">
          menos
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`ins-heat-cell lv${l}`} />
          ))}
          mais tempo
        </div>
        <span className="ins-heat-tip">Toque num dia para ver o resumo.</span>
      </div>

      {selected ? (
        <div className="ins-heat-detail" role="status">
          <strong>{formatDay(selected)}</strong>
          <span>{info ? describeDay(info) : "Nenhum filme ou episódio marcado neste dia."}</span>
          <Link href={`/diary?date=${selected}`} className="ins-link">
            Abrir no Diário <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      {top.length > 0 ? (
        <div className="ins-heat-top">
          <span>Dias mais intensos:</span>
          {top.map((d) => (
            <Link key={d[0]} href={`/diary?date=${d[0]}`} className="ins-pill">
              {d[0].split("-").reverse().slice(0, 2).join("/")} · {describeDay(d)}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

