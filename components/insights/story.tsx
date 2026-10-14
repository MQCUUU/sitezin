"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Info, Sparkles, Star } from "lucide-react";

import { Poster } from "@/components/Poster";
import { MediaTypeTag } from "@/components/media/MediaBadges";
import { SOURCE_LABEL, hourLabel, monthName } from "@/lib/insights/rules";
import type { Insight, InsightsPayload, SectionKey, TitleRef } from "@/lib/insights/types";

import { Columns, HBars, Heatmap } from "./charts";
import { Histogram, MonthlyChart, SplitBar, StackedYears, type MonthMetric } from "./charts-story";
import { CountUp, dec, durationLabel, hoursText, monthShort, nf, pct } from "./ui";

/*
 * Capítulos da página Insights — uma narrativa, nesta ordem:
 * Resumo → Atividade → Gosto → Notas → Filmes e séries → Reassistidos e
 * abandonos → Watchlist → Evolução → IA → Favoritos → Seu ano.
 * Cada capítulo mostra POUCO por padrão e o resto em "Ver todos".
 */

type Data = InsightsPayload;

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export const CHAPTERS: { id: string; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "atividade", label: "Atividade" },
  { id: "gosto", label: "Meu gosto" },
  { id: "notas", label: "Notas" },
  { id: "titulos", label: "Filmes e séries" },
  { id: "revistos", label: "Revistos e abandonos" },
  { id: "watchlist", label: "Watchlist" },
  { id: "evolucao", label: "Evolução" },
  { id: "ia", label: "IA" },
  { id: "favoritos", label: "Favoritos" },
  { id: "ano", label: "Seu ano" },
];

/** Quais capítulos têm conteúdo — usado pela numeração E pela navegação. */
export function visibleChapters(d: Data): string[] {
  if (d.meta.historyTotal === 0) return ["resumo", "watchlist"];

  const ids = ["resumo"];

  if (d.activity) ids.push("atividade");
  if (d.taste) ids.push("gosto");
  if (d.ratings) ids.push("notas");
  if (d.titles) ids.push("titulos");
  if ((d.rewatch && (d.rewatch.total > 0 || d.rewatch.top.length)) || (d.dropped && (d.dropped.count > 0 || (d.dropped.rate ?? 0) > 0))) ids.push("revistos");
  if (d.watchlist) ids.push("watchlist");
  if (d.evolution && d.evolution.years.length >= 2) ids.push("evolucao");
  if (d.ai) ids.push("ia");
  if (d.ranking.length) ids.push("favoritos");
  if (d.year && d.year.core.movies + d.year.core.series > 0) ids.push("ano");

  return ids;
}

/* ------------------------------------------------------------ peças */

export function Chapter({
  id,
  index,
  kicker,
  title,
  lead,
  children,
  aside,
}: {
  id: string;
  index: number;
  kicker: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section id={id} className="ins-chapter" aria-labelledby={`${id}-title`}>
      <header className="ins-chapter-head">
        <div>
          <span className="ins-kicker">
            {String(index).padStart(2, "0")} · {kicker}
          </span>
          <h2 id={`${id}-title`}>{title}</h2>
          {lead ? <p className="ins-chapter-lead">{lead}</p> : null}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function HowTo({ children }: { children: ReactNode }) {
  return (
    <span className="ins-how" tabIndex={0} role="button" aria-label="Como calculamos">
      <Info size={14} aria-hidden="true" />
      <span className="ins-how-pop" role="tooltip">
        {children}
      </span>
    </span>
  );
}

/** Os 1–3 insights de maior prioridade vão para o topo da página. */
export function headlineInsights(data: Data) {
  return data.insights.filter((i) => i.priority <= 2).slice(0, 3);
}

/** Insights da seção, perto do dado que explicam (sem repetir os do topo). */
function Notes({ data, section, max = 2, exclude = [] }: { data: Data; section: SectionKey; max?: number; exclude?: string[] }) {
  const top = new Set(headlineInsights(data).map((i) => i.id));
  const items = data.insights.filter((i) => i.section === section && !top.has(i.id) && !exclude.includes(i.id)).slice(0, max);

  if (!items.length) return null;

  return (
    <ul className="ins-notes">
      {items.map((i: Insight) => (
        <li key={i.id}>
          <Sparkles size={15} aria-hidden="true" />
          <span>{i.message}</span>
          <HowTo>{i.evidence}</HowTo>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children, cta }: { children: ReactNode; cta?: { href: string; label: string } }) {
  return (
    <div className="ins-empty-note">
      <p>{children}</p>
      {cta ? (
        <Link href={cta.href} className="ins-link">
          {cta.label} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="ins-fact">
      <strong>{value}</strong>
      <span>{label}</span>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ins-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-active" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function MoreToggle({ open, onClick, count }: { open: boolean; onClick: () => void; count: number }) {
  return (
    <button type="button" className="ins-more" aria-expanded={open} onClick={onClick}>
      {open ? "Mostrar menos" : `Ver todos (${count})`}
    </button>
  );
}

function PosterStrip({ items, caption }: { items: TitleRef[]; caption: (item: TitleRef, index: number) => ReactNode }) {
  return (
    <ul className="ins-posters">
      {items.map((item, index) => (
        <li key={`${item.type}-${item.tmdb_id}`}>
          <Link href={`/title/${item.type}/${item.tmdb_id}`} className="mc-focusable">
            <span className="ins-poster">
              <Poster path={item.poster_path} alt="" sizes="150px" />
              <span className="mc-tag-slot mc-tag-slot--top">
                <MediaTypeTag type={item.type} />
              </span>
            </span>
            <strong>{item.title}</strong>
            <small>{caption(item, index)}</small>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function periodWords(data: Data) {
  const p = data.meta.period;

  if (p === "year") return "este ano";
  if (p === "12m") return "nos últimos 12 meses";
  if (p === "all") return "em todo o seu histórico";
  if (/^\d{4}$/.test(p)) return `em ${p}`;

  return "no período";
}

function prevWords(data: Data) {
  const p = data.meta.period;

  if (p === "year") return `o mesmo período de ${Number(data.meta.today.slice(0, 4)) - 1}`;
  if (p === "12m") return "os 12 meses anteriores";
  if (/^\d{4}$/.test(p)) return String(Number(p) - 1);

  return "o período anterior";
}

/* ------------------------------------------------------------ 01 Resumo */

export function SummaryChapter({ data, onPeriod }: { data: Data; onPeriod: (p: string) => void }) {
  const { cur, prev } = data.summary;
  const consumed = cur.movies + cur.series;
  const hours = cur.hours;
  const top = headlineInsights(data);
  const timeChange = prev && prev.minutes >= 60 ? (cur.minutes - prev.minutes) / prev.minutes : null;

  if (consumed === 0) {
    return (
      <section id="resumo" className="ins-hero ins-hero--empty">
        <span className="ins-kicker">Resumo</span>
        <p className="ins-hero-title">Nada registrado {periodWords(data)} ainda.</p>
        <p className="ins-hero-sub">
          {data.meta.historyTotal > 0
            ? "Seu histórico está em outro período. Que tal olhar um intervalo maior?"
            : "Marque filmes e episódios como assistidos e seu perfil começa a tomar forma aqui."}
        </p>
        {data.meta.historyTotal > 0 ? (
          <div className="ins-hero-actions">
            {data.meta.period !== "12m" ? (
              <button type="button" className="btn primary" onClick={() => onPeriod("12m")}>
                Ver últimos 12 meses
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => onPeriod("all")}>
              Ver todo o histórico
            </button>
          </div>
        ) : (
          <Link href="/discover" className="btn primary">
            Descobrir títulos
          </Link>
        )}
      </section>
    );
  }

  return (
    <section id="resumo" className="ins-hero" aria-labelledby="resumo-title">
      <div className="ins-hero-main">
        <span className="ins-kicker" id="resumo-title">
          Você assistiu {periodWords(data)}
        </span>
        <p className="ins-hero-number">
          {cur.minutes < 60 ? (
            <>
              <CountUp value={cur.minutes} /> <span>minutos</span>
            </>
          ) : (
            <>
              <CountUp value={hours} /> <span>{hours === 1 ? "hora" : "horas"}</span>
            </>
          )}
          <HowTo>Estimativa: duração de cada filme e episódio marcado como assistido (45 min quando o episódio não informa duração). Reassistidas contam de novo; “Quero assistir” nunca conta.</HowTo>
        </p>
        <p className="ins-hero-sub">
          {hours >= 48 ? `≈ ${hoursText(hours)} de filmes e séries · ` : ""}
          {nf.format(cur.movies)} {cur.movies === 1 ? "filme" : "filmes"} · {nf.format(cur.episodes)} {cur.episodes === 1 ? "episódio" : "episódios"}
          {cur.series ? ` de ${nf.format(cur.series)} ${cur.series === 1 ? "série" : "séries"}` : ""}
        </p>
        {data.meta.type === "all" ? <SplitBar movies={cur.movieHours} series={cur.seriesHours} /> : null}
        {timeChange !== null && Math.abs(timeChange) >= 0.05 ? (
          <p className="ins-hero-compare">
            {timeChange > 0 ? "+" : "−"}
            {pct(Math.abs(timeChange))} de tempo em relação a {prevWords(data)}
            {prev ? ` (${durationLabel(prev.minutes)})` : ""}
          </p>
        ) : null}
      </div>

      <aside className="ins-hero-side" aria-label="Destaques do período">
        <div className="ins-hero-stat">
          <span>Sua média</span>
          <strong>{cur.avgRating !== null ? dec(cur.avgRating) : "—"}</strong>
          <small>
            {cur.rated ? `${nf.format(cur.rated)} ${cur.rated === 1 ? "título avaliado" : "títulos avaliados"}` : "Nenhum avaliado no período"}
            {prev && cur.avgRating !== null && prev.avgRating !== null && Math.abs(cur.avgRating - prev.avgRating) >= 0.1
              ? ` · ${cur.avgRating > prev.avgRating ? "+" : "−"}${dec(Math.abs(cur.avgRating - prev.avgRating))} vs. antes`
              : ""}
          </small>
        </div>
        <div className="ins-hero-row">
          <div>
            <strong>{nf.format(cur.rewatches)}</strong>
            <span>{cur.rewatches === 1 ? "reassistida" : "reassistidas"}</span>
          </div>
          <div>
            <strong>{nf.format(cur.activeDays)}</strong>
            <span>dias com atividade</span>
          </div>
          {cur.dropped > 0 ? (
            <div>
              <strong>{nf.format(cur.dropped)}</strong>
              <span>{cur.dropped === 1 ? "abandonado" : "abandonados"}</span>
            </div>
          ) : null}
        </div>
      </aside>

      {top.length ? (
        <ul className="ins-headlines">
          {top.map((i) => (
            <li key={i.id}>
              <Sparkles size={16} aria-hidden="true" />
              <span>{i.message}</span>
              <HowTo>{i.evidence}</HowTo>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------ 02 Atividade */

export function ActivityChapter({ data, index }: { data: Data; index: number }) {
  const a = data.activity;
  const [metric, setMetric] = useState<MonthMetric>("minutes");
  const years = useMemo(() => Array.from(new Set((a?.days ?? []).map((d) => Number(d[0].slice(0, 4))))).sort(), [a?.days]);

  if (!a) return null;

  const facts = [
    a.favoriteWeekday !== null ? { label: "Dia favorito", value: WEEKDAYS[a.favoriteWeekday], sub: "mais tempo assistido" } : null,
    a.peakHours ? { label: "Horário mais comum", value: `${hourLabel(a.peakHours.from)}–${hourLabel(a.peakHours.to)}`, sub: `${pct(a.peakHours.share)} dos registros com horário` } : null,
    a.longestStreak >= 2 ? { label: "Maior sequência", value: `${a.longestStreak} dias`, sub: a.currentStreak >= 2 ? `agora: ${a.currentStreak} dias` : "seguidos" } : null,
    a.busiestMonth ? { label: "Mês mais ativo", value: monthName(a.busiestMonth.month).split(" de ")[0], sub: `${durationLabel(a.busiestMonth.minutes)} em ${a.busiestMonth.month.slice(0, 4)}` } : null,
  ].filter(Boolean) as { label: string; value: string; sub: string }[];

  return (
    <Chapter id="atividade" index={index} kicker="Atividade" title="Quando você mais assiste" lead="Seu ritmo mês a mês e os dias em que você assistiu algo.">
      <div className="ins-panel">
        <div className="ins-panel-head">
          <h3>Seu ritmo</h3>
          <Seg
            label="Métrica do gráfico"
            value={metric}
            onChange={setMetric}
            options={[
              ["minutes", "Horas"],
              ["movies", "Filmes"],
              ["episodes", "Episódios"],
            ]}
          />
        </div>
        <MonthlyChart data={a.monthly} metric={metric} />
      </div>

      {facts.length ? (
        <div className="ins-facts">
          {facts.map((f) => (
            <Fact key={f.label} label={f.label} value={f.value} sub={f.sub} />
          ))}
        </div>
      ) : null}
      {!a.hoursReliable ? (
        <p className="ins-muted ins-small">
          Horário mais comum aparece quando boa parte dos seus registros tem hora (não só a data).
        </p>
      ) : null}

      <Notes data={data} section="activity" />

      {a.days.length ? (
        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>Dia a dia</h3>
            <HowTo>Cada quadrado é um dia. Quanto mais forte a cor, mais tempo você assistiu. Toque num dia para ver o resumo e abrir o Diário.</HowTo>
          </div>
          <Heatmap days={a.days} years={years} />
        </div>
      ) : null}
    </Chapter>
  );
}

/* ------------------------------------------------------------ 03 Meu gosto */

export function TasteChapter({ data, index }: { data: Data; index: number }) {
  const t = data.taste;
  const [allGenres, setAllGenres] = useState(false);
  const [allPeople, setAllPeople] = useState(false);

  if (!t) return null;

  if (t.consumed < 3) {
    return (
      <Chapter id="gosto" index={index} kicker="Meu gosto" title="O que seus dados dizem sobre você">
        <Empty cta={{ href: "/library", label: "Abrir biblioteca" }}>Assista e avalie mais alguns títulos para começarmos a identificar seus padrões de gênero.</Empty>
      </Chapter>
    );
  }

  const watched = t.genres.slice(0, 5);
  const loved = t.genres.filter((g) => g.avg !== null).sort((a, b) => (b.avg as number) - (a.avg as number)).slice(0, 5);
  const people = [
    { title: "Diretores", rows: t.directors, unit: "filmes" },
    { title: "Elenco mais presente", rows: t.cast, unit: "títulos" },
  ].filter((p) => p.rows.length);

  return (
    <Chapter id="gosto" index={index} kicker="Meu gosto" title="O que seus dados dizem sobre você" lead="Separamos o que você mais assiste do que você realmente gosta.">
      <div className="ins-duo">
        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>O que você mais assiste</h3>
          </div>
          <HBars rows={watched.map((g) => ({ label: g.name, value: g.count, display: `${g.count}`, hint: `${g.name}: ${g.count} títulos · ${durationLabel(g.minutes)}${g.avg !== null ? ` · nota média ${dec(g.avg)}` : ""}` }))} />
        </div>
        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>O que você mais gosta</h3>
            <HowTo>Nota média por gênero, só com gêneros que têm pelo menos 5 títulos avaliados por você.</HowTo>
          </div>
          {loved.length ? (
            <HBars tone="gold" max={10} rows={loved.map((g) => ({ label: g.name, value: g.avg as number, display: dec(g.avg as number), hint: `${g.name}: nota média ${dec(g.avg as number)} em ${g.rated} avaliados` }))} />
          ) : (
            <p className="ins-muted">Avalie pelo menos 5 títulos de um mesmo gênero para ver onde suas notas sobem.</p>
          )}
        </div>
      </div>

      <Notes data={data} section="taste" max={3} />

      {t.genres.length > 5 ? (
        <>
          <MoreToggle open={allGenres} onClick={() => setAllGenres((v) => !v)} count={t.genres.length} />
          {allGenres ? (
            <div className="ins-table-wrap">
              <table className="ins-table">
                <thead>
                  <tr>
                    <th scope="col">Gênero</th>
                    <th scope="col">Títulos</th>
                    <th scope="col">Tempo</th>
                    <th scope="col">Nota média</th>
                    <th scope="col">Curtidos</th>
                  </tr>
                </thead>
                <tbody>
                  {t.genres.map((g) => (
                    <tr key={g.name}>
                      <th scope="row">{g.name}</th>
                      <td>{g.count}</td>
                      <td>{durationLabel(g.minutes)}</td>
                      <td>{g.avg !== null ? dec(g.avg) : <span className="ins-muted">poucos avaliados</span>}</td>
                      <td>{g.favorites}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}

      {t.genresByYear.length >= 2 ? (
        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>Seus gêneros ao longo dos anos</h3>
            <HowTo>Gênero principal de cada título assistido no ano (o primeiro gênero do TMDB). Só anos com 5 ou mais títulos.</HowTo>
          </div>
          <StackedYears rows={t.genresByYear} />
        </div>
      ) : null}

      <div className="ins-duo">
        {t.decades.length ? (
          <div className="ins-panel">
            <div className="ins-panel-head">
              <h3>De que época</h3>
            </div>
            <Columns
              data={t.decades.map((d) => ({ label: d.label.replace(/^(\d{2})(\d{2})s$/, "’$2"), value: d.count, title: `Década de ${d.label.slice(0, 4)}: ${d.count} títulos${d.avg !== null ? ` · nota média ${dec(d.avg)}` : ""}` }))}
              height={150}
            />
            {t.classicShare !== null ? (
              <p className="ins-muted ins-small">
                {pct(t.classicShare)} do que você assiste é anterior a 2000
                {(() => {
                  const best = t.decades.filter((d) => d.avg !== null).sort((a, b) => (b.avg as number) - (a.avg as number))[0];

                  return best ? ` · sua melhor década é a de ${best.label.slice(0, 4)} (média ${dec(best.avg as number)})` : "";
                })()}
                .
              </p>
            ) : null}
          </div>
        ) : null}

        {t.languages.length || t.countries.length ? (
          <div className="ins-panel">
            <div className="ins-panel-head">
              <h3>{t.countries.length ? "De onde vem o que você assiste" : "Idiomas"}</h3>
            </div>
            {t.countries.length ? (
              <HBars rows={t.countries.slice(0, 5).map((c) => ({ label: regionName(c.label), value: c.count, hint: c.avg !== null ? `Nota média ${dec(c.avg)}` : undefined }))} />
            ) : (
              <HBars rows={t.languages.slice(0, 5).map((c) => ({ label: languageName(c.label), value: c.count, hint: c.avg !== null ? `Nota média ${dec(c.avg)}` : undefined }))} />
            )}
          </div>
        ) : null}
      </div>

      {people.length ? (
        <div className="ins-duo">
          {people.map((p) => (
            <div key={p.title} className="ins-panel">
              <div className="ins-panel-head">
                <h3>{p.title}</h3>
                <HowTo>Pessoas com pelo menos 2 títulos assistidos. A média só aparece com 3 ou mais avaliados.</HowTo>
              </div>
              <ol className="ins-people">
                {p.rows.slice(0, allPeople ? 12 : 5).map((row, i) => (
                  <li key={row.name}>
                    <span className="ins-people-n">{i + 1}</span>
                    <span className="ins-people-name">
                      <strong>{row.name}</strong>
                      {row.best ? <small>melhor: {row.best}</small> : null}
                    </span>
                    <span className="ins-people-meta">
                      {row.count} {p.unit}
                      {row.avg !== null ? (
                        <b>
                          <Star size={11} fill="currentColor" aria-hidden="true" /> {dec(row.avg)}
                        </b>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : null}
      {people.some((p) => p.rows.length > 5) ? <MoreToggle open={allPeople} onClick={() => setAllPeople((v) => !v)} count={Math.max(...people.map((p) => Math.min(12, p.rows.length)))} /> : null}
    </Chapter>
  );
}

const LANGUAGE = (() => {
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "language" });
  } catch {
    return null;
  }
})();
const REGION = (() => {
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" });
  } catch {
    return null;
  }
})();

function languageName(code: string) {
  try {
    return LANGUAGE?.of(code) ?? code;
  } catch {
    return code;
  }
}

function regionName(code: string) {
  try {
    return REGION?.of(code) ?? code;
  } catch {
    return code;
  }
}

/* ------------------------------------------------------------ 04 Notas */

export function RatingsChapter({ data, index }: { data: Data; index: number }) {
  const r = data.ratings;

  if (!r) return null;

  if (r.n === 0) {
    return (
      <Chapter id="notas" index={index} kicker="Notas" title="Como você avalia">
        <Empty cta={{ href: "/library?status=watched", label: "Avaliar o que já assisti" }}>Você ainda não avaliou títulos {periodWords(data)}. Suas notas ajudam a entender seu gosto e melhoram as recomendações.</Empty>
      </Chapter>
    );
  }

  return (
    <Chapter id="notas" index={index} kicker="Notas" title="Como você avalia">
      <div className="ins-rating-head">
        <div className="ins-rating-big">
          <span>Sua média</span>
          <strong>{r.mean !== null ? dec(r.mean) : "—"}</strong>
        </div>
        <dl className="ins-rating-facts">
          <div>
            <dt>Mediana</dt>
            <dd>{r.median !== null ? dec(r.median) : "—"}</dd>
          </div>
          <div>
            <dt>Nota mais usada</dt>
            <dd>{r.mode ?? "—"}</dd>
          </div>
          <div>
            <dt>Avaliados</dt>
            <dd>
              {nf.format(r.n)}
              {r.coverage !== null ? <small> · {pct(r.coverage)} do que assistiu</small> : null}
            </dd>
          </div>
        </dl>
      </div>

      <div className="ins-panel">
        <Histogram buckets={r.histogram} highlight={r.mode} />
      </div>

      <Notes data={data} section="ratings" max={3} exclude={r.community ? ["bias"] : []} />

      {r.community ? (
        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>Você × TMDB</h3>
            <HowTo>Compara sua nota com a média do TMDB nos títulos com pelo menos 100 votos. Divergências só com 300+ votos e diferença de 1,5 ponto ou mais.</HowTo>
          </div>
          <div className="ins-versus">
            <div>
              <span>Sua média nesses títulos</span>
              <strong>{dec(r.community.mine)}</strong>
            </div>
            <div>
              <span>Média do TMDB</span>
              <strong>{dec(r.community.tmdb)}</strong>
            </div>
            <p>
              {Math.abs(r.community.bias) < 0.15
                ? "Você avalia praticamente igual à média."
                : `Você tende a avaliar ${dec(Math.abs(r.community.bias))} ponto ${r.community.bias < 0 ? "abaixo" : "acima"} da média.`}
            </p>
          </div>
          {r.higher.length || r.lower.length ? (
            <div className="ins-duo ins-duo--tight">
              {r.higher.length ? (
                <div>
                  <h4 className="ins-sub">Você gostou bem mais</h4>
                  <ul className="ins-lines">
                    {r.higher.map((d) => (
                      <li key={`${d.type}-${d.tmdb_id}`}>
                        <Link href={`/title/${d.type}/${d.tmdb_id}`}>{d.title}</Link>
                        <small>
                          você {dec(d.rating)} · TMDB {dec(d.community)}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {r.lower.length ? (
                <div>
                  <h4 className="ins-sub">Você gostou bem menos</h4>
                  <ul className="ins-lines">
                    {r.lower.map((d) => (
                      <li key={`${d.type}-${d.tmdb_id}`}>
                        <Link href={`/title/${d.type}/${d.tmdb_id}`}>{d.title}</Link>
                        <small>
                          você {dec(d.rating)} · TMDB {dec(d.community)}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Chapter>
  );
}

/* ------------------------------------------------------------ 05 Filmes e séries */

export function TitlesChapter({ data, index }: { data: Data; index: number }) {
  const t = data.titles;
  const initial = data.meta.type === "movie" ? "movie" : data.meta.type === "tv" ? "tv" : (t?.series.minutes ?? 0) >= (t?.movies.minutes ?? 0) ? "tv" : "movie";
  const [view, setView] = useState<"tv" | "movie">(initial);
  const [allSeries, setAllSeries] = useState(false);

  if (!t) return null;

  const s = t.series;
  const m = t.movies;
  const showSwitch = data.meta.type === "all";

  return (
    <Chapter
      id="titulos"
      index={index}
      kicker="Filmes e séries"
      title={view === "tv" ? "Suas séries" : "Seus filmes"}
      aside={
        showSwitch ? (
          <Seg
            label="Ver filmes ou séries"
            value={view}
            onChange={setView}
            options={[
              ["tv", "Séries"],
              ["movie", "Filmes"],
            ]}
          />
        ) : null
      }
    >
      {view === "tv" ? (
        <>
          <div className="ins-facts">
            <Fact label="em andamento" value={nf.format(s.watching)} sub="agora" />
            <Fact label="concluídas" value={nf.format(s.completed)} sub={`${nf.format(s.seasonsCompleted)} temporadas`} />
            <Fact label={`episódios ${periodWords(data)}`} value={nf.format(s.episodes)} sub={`${durationLabel(s.minutes)} assistindo`} />
            {s.dropped ? <Fact label="abandonadas" value={nf.format(s.dropped)} sub={s.paused ? `${s.paused} pausadas` : undefined} /> : null}
          </div>

          <Notes data={data} section="titles" />

          {s.inProgress.length ? (
            <div className="ins-panel">
              <div className="ins-panel-head">
                <h3>
                  Você está acompanhando {s.inProgress.length} {s.inProgress.length === 1 ? "série" : "séries"}
                </h3>
                {s.remainingEpisodes ? (
                  <span className="ins-muted ins-small">
                    faltam {nf.format(s.remainingEpisodes)} episódios · ≈ {durationLabel(s.remainingMinutes)}
                  </span>
                ) : null}
              </div>
              <ul className="ins-progress">
                {s.inProgress.slice(0, allSeries ? 30 : 5).map((p) => {
                  const ratio = p.total ? Math.min(1, p.watched / p.total) : 0;

                  return (
                    <li key={p.tmdb_id}>
                      <Link href={`/title/tv/${p.tmdb_id}`} className="ins-progress-title">
                        {p.title}
                      </Link>
                      <span className="ins-progress-bar" role="img" aria-label={p.total ? `${p.watched} de ${p.total} episódios` : `${p.watched} episódios`}>
                        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
                      </span>
                      <small>
                        {p.total ? `${p.watched}/${p.total} ep.` : `${p.watched} ep.`}
                        {p.remaining ? ` · faltam ${p.remaining}` : ""}
                        {p.staleDays !== null && p.staleDays >= 30 ? ` · parada há ${p.staleDays} dias` : ""}
                      </small>
                    </li>
                  );
                })}
              </ul>
              {s.inProgress.length > 5 ? <MoreToggle open={allSeries} onClick={() => setAllSeries((v) => !v)} count={s.inProgress.length} /> : null}
            </div>
          ) : (
            <Empty cta={{ href: "/library?status=watching", label: "Abrir biblioteca" }}>Nenhuma série em andamento agora.</Empty>
          )}

          {s.nearlyDone.length ? (
            <div className="ins-panel">
              <div className="ins-panel-head">
                <h3>Quase lá</h3>
                <span className="ins-muted ins-small">a até 3 episódios do fim</span>
              </div>
              <PosterStrip items={s.nearlyDone.slice(0, 6)} caption={(item) => {
                const r = s.nearlyDone.find((x) => x.tmdb_id === item.tmdb_id)?.remaining ?? 0;

                return `${r} ${r === 1 ? "episódio restante" : "episódios restantes"}`;
              }} />
            </div>
          ) : null}
        </>
      ) : (
        <>
          {m.count === 0 ? (
            <Empty cta={{ href: "/discover", label: "Descobrir filmes" }}>Nenhum filme assistido {periodWords(data)}.</Empty>
          ) : (
            <>
              <div className="ins-facts">
                <Fact label="filmes assistidos" value={nf.format(m.count)} sub={`${durationLabel(m.minutes)} assistindo`} />
                <Fact label="duração média" value={m.avgRuntime ? `${m.avgRuntime} min` : "—"} />
                <Fact label="nota média" value={m.avgRating !== null ? dec(m.avgRating) : "—"} />
                <Fact label="reassistidos" value={nf.format(m.rewatches)} />
              </div>
              <ul className="ins-chips-row">
                {m.topGenre ? (
                  <li>
                    Gênero dominante <strong>{m.topGenre}</strong>
                  </li>
                ) : null}
                {m.topDecade ? (
                  <li>
                    Década dominante <strong>{m.topDecade.slice(0, 4)}</strong>
                  </li>
                ) : null}
                {m.topDirector ? (
                  <li>
                    Diretor mais assistido <strong>{m.topDirector}</strong>
                  </li>
                ) : null}
              </ul>
              {m.monthly.length >= 3 ? (
                <div className="ins-panel">
                  <div className="ins-panel-head">
                    <h3>Filmes por mês</h3>
                  </div>
                  <Columns data={m.monthly.map((x) => ({ label: monthShort(x.month), value: x.count, title: `${monthShort(x.month)} ${x.month.slice(0, 4)}: ${x.count} filmes` }))} height={140} />
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </Chapter>
  );
}

/* ------------------------------------------------------------ 06 Revistos e abandonos */

export function RewatchChapter({ data, index }: { data: Data; index: number }) {
  const r = data.rewatch;
  const d = data.dropped;

  if (!r && !d) return null;

  const hasRewatch = Boolean(r && (r.total > 0 || r.top.length));
  const hasDropped = Boolean(d && (d.count > 0 || (d.rate ?? 0) > 0));

  if (!hasRewatch && !hasDropped) return null;

  return (
    <Chapter id="revistos" index={index} kicker="Revistos e abandonos" title="O que você revê e o que deixa de lado">
      <div className="ins-duo">
        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>Reassistidos</h3>
          </div>
          {r && hasRewatch ? (
            <>
              <p className="ins-big">
                {nf.format(r.total)} <span>{r.total === 1 ? "reassistida" : "reassistidas"} {periodWords(data)}</span>
              </p>
              <p className="ins-muted ins-small">
                {[
                  r.share !== null ? `${pct(r.share)} dos títulos que você assistiu` : null,
                  r.intervalDays !== null ? `costuma rever depois de ${r.intervalDays >= 60 ? `${Math.round(r.intervalDays / 30)} meses` : `${r.intervalDays} dias`}` : null,
                  r.ratingChange ? `ao rever, a nota ${r.ratingChange.mean >= 0 ? "sobe" : "cai"} em média ${dec(Math.abs(r.ratingChange.mean))}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.top.length ? <PosterStrip items={r.top.slice(0, 5)} caption={(item) => `${r.top.find((x) => x.tmdb_id === item.tmdb_id)?.times ?? 1}× revisto`} /> : null}
            </>
          ) : (
            <p className="ins-muted">Quando você reassistir algo, seus títulos de conforto aparecem aqui.</p>
          )}
        </div>

        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>Abandonados</h3>
            <HowTo>Taxa = títulos marcados como abandonados sobre tudo o que você começou (biblioteca inteira, fora “Quero assistir”).</HowTo>
          </div>
          {d && hasDropped ? (
            <>
              <p className="ins-big">
                {nf.format(d.count)} <span>{periodWords(data)}</span>
              </p>
              {d.rate !== null ? <p className="ins-muted ins-small">{pct(d.rate)} de tudo o que você começa fica pelo caminho.</p> : null}
              {d.genres.length ? (
                <HBars tone="muted" rows={d.genres.map((g) => ({ label: g.name, value: g.rate, display: pct(g.rate), hint: `${g.dropped} de ${g.tracked} títulos` }))} />
              ) : null}
            </>
          ) : (
            <p className="ins-muted">Você não abandonou nenhum título {periodWords(data)}.</p>
          )}
        </div>
      </div>
      <Notes data={data} section="rewatch" max={3} />
    </Chapter>
  );
}

/* ------------------------------------------------------------ 07 Watchlist */

export function WatchlistChapter({ data, index }: { data: Data; index: number }) {
  const w = data.watchlist;

  if (!w) return null;

  if (w.size === 0) {
    return (
      <Chapter id="watchlist" index={index} kicker="Watchlist" title="O que está esperando por você">
        <Empty cta={{ href: "/discover", label: "Descobrir títulos" }}>Sua lista “Quero assistir” está vazia.</Empty>
      </Chapter>
    );
  }

  return (
    <Chapter id="watchlist" index={index} kicker="Watchlist" title="O que está esperando por você" aside={<Link href="/library?status=want" className="ins-link">Abrir watchlist <ArrowRight size={14} aria-hidden="true" /></Link>}>
      <div className="ins-facts">
        <Fact label="para assistir" value={nf.format(w.size)} sub={`${w.movies} filmes · ${w.series} séries`} />
        <Fact label={`adicionados ${periodWords(data)}`} value={nf.format(w.addedInPeriod)} />
        {w.converted ? (
          <Fact
            label="do que entrou, você já começou"
            value={pct(w.converted.watched / w.converted.added)}
            sub={`${w.converted.watched} de ${w.converted.added}`}
          />
        ) : null}
        {w.avgAgeDays !== null ? <Fact label="tempo médio na lista" value={w.avgAgeDays >= 60 ? `${Math.round(w.avgAgeDays / 30)} meses` : `${w.avgAgeDays} dias`} /> : null}
      </div>

      {w.clearMonths !== null ? (
        <p className="ins-callout">
          No seu ritmo atual, seriam necessários <strong>aproximadamente {w.clearMonths >= 24 ? `${Math.round(w.clearMonths / 12)} anos` : `${w.clearMonths} ${w.clearMonths === 1 ? "mês" : "meses"}`}</strong> para assistir toda a sua watchlist.
          <HowTo>Soma a duração estimada de tudo em “Quero assistir” (filmes pela duração; séries pelo nº de episódios) e divide pelo seu tempo médio assistido por dia nos últimos 90 dias. É uma ordem de grandeza, não uma previsão exata.</HowTo>
        </p>
      ) : null}

      <Notes data={data} section="watchlist" exclude={["clear"]} />

      {w.oldest.length ? (
        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>Está aqui há um tempo</h3>
          </div>
          <PosterStrip
            items={w.oldest}
            caption={(item) => {
              const days = w.oldest.find((x) => x.tmdb_id === item.tmdb_id)?.days ?? 0;

              return days >= 60 ? `há ${Math.round(days / 30)} meses` : `há ${days} dias`;
            }}
          />
        </div>
      ) : null}
    </Chapter>
  );
}

/* ------------------------------------------------------------ 08 Evolução */

export function EvolutionChapter({ data, index }: { data: Data; index: number }) {
  const e = data.evolution;

  if (!e || e.years.length < 2) return null;

  return (
    <Chapter id="evolucao" index={index} kicker="Evolução" title="Seu gosto está mudando?" lead={`${e.fromYear} × ${e.toYear}${e.toYear === Number(data.meta.today.slice(0, 4)) ? " (até agora)" : ""}`}>
      {e.changes.length ? (
        <ul className="ins-changes">
          {e.changes.map((c) => (
            <li key={c.id}>
              <span className="ins-change-label">{c.label}</span>
              <span className="ins-change-bars" aria-hidden="true">
                <span style={{ width: `${c.unit === "rating" ? c.from * 10 : c.from * 100}%` }} className="is-from" />
                <span style={{ width: `${c.unit === "rating" ? c.to * 10 : c.to * 100}%` }} className="is-to" />
              </span>
              <span className="ins-change-values">
                {c.unit === "rating" ? dec(c.from) : pct(c.from)} <ArrowRight size={13} aria-hidden="true" /> <strong>{c.unit === "rating" ? dec(c.to) : pct(c.to)}</strong>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ins-muted">
          Nenhuma mudança relevante entre {e.fromYear} e {e.toYear}: seu gosto está estável. <HowTo>Mostramos só mudanças de 6 pontos percentuais ou mais (gêneros), 5 pontos (épocas e origem) ou 0,3 na nota média, com pelo menos 10 títulos em cada ano.</HowTo>
        </p>
      )}

      <div className="ins-panel">
        <div className="ins-panel-head">
          <h3>Títulos por ano</h3>
        </div>
        <Columns
          data={e.years.map((y) => ({ label: String(y.year), value: y.count, title: `${y.year}: ${y.count} títulos${y.avg !== null ? ` · nota média ${dec(y.avg)}` : ""}` }))}
          height={140}
          highlight={e.years.length - 1}
        />
      </div>
    </Chapter>
  );
}

/* ------------------------------------------------------------ 09 IA */

export function AiChapter({ data, index }: { data: Data; index: number }) {
  const ai = data.ai;

  if (!ai) return null;

  const watched = ai.tools.reduce((s, t) => s + t.watched, 0);
  const liked = ai.tools.reduce((s, t) => s + t.liked, 0);
  const started = ai.tools.reduce((s, t) => s + t.started, 0);
  const shown = ai.tools.reduce((s, t) => s + t.shown, 0);
  const ratings = ai.tools.filter((t) => t.avgRating !== null && t.watched > 0);
  const avg = ratings.length ? ratings.reduce((s, t) => s + (t.avgRating as number) * t.watched, 0) / ratings.reduce((s, t) => s + t.watched, 0) : null;
  const toolsWithData = ai.tools.filter((t) => t.shown > 0);
  const sinceText = ai.since ? `desde ${ai.since.split("-").reverse().join("/")}` : "";

  return (
    <Chapter id="ia" index={index} kicker="IA e descoberta" title="A IA está te conhecendo?" lead="Resultados reais das recomendações do MyCatalog AI, Escolha pra mim, Sugerir agora e Para você.">
      {!ai.tracking ? (
        <Empty>As recomendações ainda não são registradas neste ambiente. Assim que forem, você verá aqui quantas assistiu e quantas gostou.</Empty>
      ) : watched < 3 ? (
        <Empty cta={{ href: "/for-you", label: "Ver recomendações" }}>
          Estamos acompanhando suas recomendações {sinceText}
          {shown ? ` (${nf.format(shown)} exibidas até agora)` : ""}. Quando você assistir algumas, mostramos aqui o quanto elas acertam.
        </Empty>
      ) : (
        <>
          <div className="ins-facts">
            <Fact label="recomendações assistidas" value={nf.format(watched)} sub={sinceText} />
            <Fact label="você gostou" value={nf.format(liked)} sub={`${pct(liked / watched)} das assistidas`} />
            <Fact label="nota média delas" value={avg !== null ? dec(avg) : "—"} />
            <Fact label="das que começou, terminou" value={started ? pct(watched / started) : "—"} />
          </div>
          <p className="ins-muted ins-small">
            “Gostou” = assistiu e deu nota 7,5 ou mais, ou curtiu. Só contam títulos que não estavam na sua biblioteca quando foram recomendados.
          </p>
          <Notes data={data} section="ai" />
          {ai.monthly.length >= 2 ? (
            <div className="ins-panel">
              <div className="ins-panel-head">
                <h3>Recomendações de que você gostou, por mês</h3>
              </div>
              <Columns data={ai.monthly.map((m) => ({ label: monthShort(m.month), value: m.liked, title: `${monthShort(m.month)} ${m.month.slice(0, 4)}: gostou de ${m.liked} de ${m.watched} assistidas` }))} height={130} />
            </div>
          ) : null}
          {toolsWithData.length ? (
            <div className="ins-table-wrap">
              <table className="ins-table">
                <thead>
                  <tr>
                    <th scope="col">Ferramenta</th>
                    <th scope="col">Exibidas</th>
                    <th scope="col">Salvas</th>
                    <th scope="col">Assistidas</th>
                    <th scope="col">Gostou</th>
                    <th scope="col">Nota média</th>
                  </tr>
                </thead>
                <tbody>
                  {toolsWithData.map((t) => (
                    <tr key={t.tool}>
                      <th scope="row">{SOURCE_LABEL[t.tool] ?? t.tool}</th>
                      <td>{nf.format(t.shown)}</td>
                      <td>{nf.format(t.added)}</td>
                      <td>{nf.format(t.watched)}</td>
                      <td>{nf.format(t.liked)}</td>
                      <td>{t.avgRating !== null ? dec(t.avgRating) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      {ai.tracking && ai.sources.length ? (
        <div className="ins-panel">
          <div className="ins-panel-head">
            <h3>De onde vêm os títulos que você salva</h3>
            <HowTo>Registrado quando um título entra na sua biblioteca: a ferramenta que o mostrou nas últimas 2 horas ou a página em que você estava. Nota média com pelo menos 3 assistidos.</HowTo>
          </div>
          <HBars
            rows={ai.sources.slice(0, 6).map((s) => ({
              label: SOURCE_LABEL[s.source] ?? s.source,
              value: s.added,
              display: `${s.added}${s.avgRating !== null ? ` · ★ ${dec(s.avgRating)}` : ""}`,
              hint: `${s.added} salvos · ${s.watched} assistidos · gostou de ${s.liked}`,
            }))}
          />
        </div>
      ) : null}

      {ai.hidden > 0 ? (
        <p className="ins-muted ins-small">
          Você marcou {nf.format(ai.hidden)} {ai.hidden === 1 ? "título" : "títulos"} como “Não tenho interesse” — {ai.hidden === 1 ? "ele nunca volta" : "eles nunca voltam"} nas recomendações.
        </p>
      ) : null}
    </Chapter>
  );
}

/* ------------------------------------------------------------ 10 Favoritos */

export function FavoritesChapter({ data, index }: { data: Data; index: number }) {
  if (!data.ranking.length) return null;

  const typeParam = data.meta.type !== "all" ? `?type=${data.meta.type}` : "";

  return (
    <Chapter
      id="favoritos"
      index={index}
      kicker="Ranking"
      title="Seus favoritos"
      lead="Suas maiores notas de todos os tempos."
      aside={
        <Link href={`/ranking${typeParam}`} className="ins-link">
          Ver ranking completo <ArrowRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <ol className="ins-top">
        {data.ranking.map((item, i) => (
          <li key={`${item.type}-${item.tmdb_id}`}>
            <Link href={`/title/${item.type}/${item.tmdb_id}`} className="mc-focusable">
              <span className="ins-top-rank">{i + 1}</span>
              <span className="ins-top-poster">
                <Poster path={item.poster_path} alt="" sizes="120px" />
              </span>
              <span className="ins-top-text">
                <strong>{item.title}</strong>
                <small>{item.type === "tv" ? "Série" : "Filme"}</small>
              </span>
              <span className="ins-top-rating">
                <Star size={13} fill="currentColor" aria-hidden="true" /> {dec(item.rating)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Chapter>
  );
}

/* ------------------------------------------------------------ 11 Seu ano */

export function YearChapter({ data, index }: { data: Data; index: number }) {
  const y = data.year;

  if (!y || y.core.movies + y.core.series === 0) return null;

  const isCurrent = y.year === Number(data.meta.today.slice(0, 4));

  return (
    <Chapter
      id="ano"
      index={index}
      kicker="Retrospectiva"
      title={`Seu ${y.year}${isCurrent ? " até agora" : ""}`}
      aside={
        <Link href={`/retrospective?year=${y.year}`} className="btn primary">
          Ver retrospectiva completa
        </Link>
      }
    >
      <div className="ins-year">
        <div className="ins-year-numbers">
          <div>
            <strong>{nf.format(y.core.movies)}</strong>
            <span>filmes</span>
          </div>
          <div>
            <strong>{nf.format(y.core.episodes)}</strong>
            <span>episódios</span>
          </div>
          <div>
            <strong>{nf.format(y.core.hours)}h</strong>
            <span>assistidas</span>
          </div>
        </div>
        <dl className="ins-year-picks">
          {y.bestMovie ? (
            <div>
              <dt>Filme do ano</dt>
              <dd>{y.bestMovie.title}</dd>
            </div>
          ) : null}
          {y.bestSeries ? (
            <div>
              <dt>Série do ano</dt>
              <dd>{y.bestSeries.title}</dd>
            </div>
          ) : null}
          {y.topGenre ? (
            <div>
              <dt>Gênero do ano</dt>
              <dd>{y.topGenre}</dd>
            </div>
          ) : null}
          {y.busiestMonth ? (
            <div>
              <dt>Mês mais ativo</dt>
              <dd>{monthName(y.busiestMonth).split(" de ")[0]}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      {y.top.length ? <PosterStrip items={y.top} caption={(item) => `★ ${dec(y.top.find((x) => x.tmdb_id === item.tmdb_id)?.rating ?? 0)}`} /> : null}
    </Chapter>
  );
}
