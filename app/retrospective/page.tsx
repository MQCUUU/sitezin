"use client";


import "@/styles/features/insights.css";
import "@/styles/insights.css";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles, Star } from "lucide-react";

import { Search } from "@/components/Search";
import { Poster } from "@/components/Poster";
import { RetrospectiveShare } from "@/components/RetrospectiveShare";
import { Heatmap } from "@/components/insights/charts";
import { MonthlyChart, type MonthMetric } from "@/components/insights/charts-story";
import { dec, durationLabel, nf, pct } from "@/components/insights/ui";
import { monthName } from "@/lib/insights/rules";
import type { InsightsPayload, RatedRef } from "@/lib/insights/types";

/*
 * V2.3 — Retrospectiva reconstruída sobre o MESMO motor do Insights
 * (GET /api/insights?period=AAAA), então os números batem com a página
 * principal. Antes ela contava EVENTOS do Diário (adições, mudanças de
 * status), que não são consumo. Preservado: Gerar card / Compartilhar /
 * Baixar (components/RetrospectiveShare.tsx, tudo local no navegador).
 */

function Pick({ label, item, extra }: { label: string; item: RatedRef; extra?: string }) {
  return (
    <Link href={`/title/${item.type}/${item.tmdb_id}`} className="ins-retro-pick mc-focusable">
      <span className="ins-retro-pick-poster">
        <Poster path={item.poster_path} alt="" sizes="160px" />
      </span>
      <span className="ins-retro-pick-text">
        <span className="ins-kicker">{label}</span>
        <strong>{item.title}</strong>
        <small>
          <Star size={12} fill="currentColor" aria-hidden="true" /> {dec(item.rating)}
          {extra ? ` · ${extra}` : ""}
        </small>
      </span>
    </Link>
  );
}

function RetrospectiveContent() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const thisYear = new Date().getFullYear();
  const requested = Number(search.get("year"));
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= thisYear ? requested : thisYear;
  const years = useMemo(() => Array.from({ length: 10 }, (_, i) => thisYear - i), [thisYear]);

  const [data, setData] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [metric, setMetric] = useState<MonthMetric>("minutes");

  useEffect(() => {
    const controller = new AbortController();

    setError(false);
    setData(null);

    fetch(`/api/insights?period=${year}`, { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((payload: InsightsPayload) => setData(payload))
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(true);
      });

    return () => controller.abort();
  }, [year, attempt]);

  const setYear = (value: number) => router.replace(value === thisYear ? pathname : `${pathname}?year=${value}`, { scroll: false });

  const c = data?.summary.cur;
  const p = data?.summary.prev;
  const y = data?.year;
  const empty = data && c && c.movies + c.series === 0;
  const isCurrent = year === thisYear;
  // Só frases sobre o ANO (fora: "quase terminando", watchlist, IA — são do agora).
  const yearInsights = (data?.insights ?? []).filter((i) => ["summary", "taste", "ratings", "rewatch", "evolution"].includes(i.section)).slice(0, 4);
  const changes = [
    p && p.minutes >= 60 && c ? { label: "tempo assistido", from: p.minutes, to: c.minutes, fmt: durationLabel } : null,
    p && p.movies >= 3 && c ? { label: "filmes", from: p.movies, to: c.movies, fmt: (v: number) => nf.format(v) } : null,
    p && p.episodes >= 5 && c ? { label: "episódios", from: p.episodes, to: c.episodes, fmt: (v: number) => nf.format(v) } : null,
  ].filter(Boolean) as { label: string; from: number; to: number; fmt: (v: number) => string }[];

  return (
    <>
      <Search />

      <header className="ins-header ins-header--sub">
        <div>
          <Link href="/insights" className="ins-back">
            <ArrowLeft size={16} aria-hidden="true" /> Insights
          </Link>
          <span className="ins-eyebrow">Retrospectiva</span>
          <h1>
            Seu {year}
            {isCurrent ? <span className="ins-h1-soft"> até agora</span> : null}
          </h1>
        </div>
        <label className="ins-year-select is-standalone">
          <span className="ins-sr">Escolher ano</span>
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? (
        <div className="empty" role="alert">
          <strong>Não foi possível montar sua retrospectiva agora.</strong>
          <button type="button" className="btn primary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {!error && !data ? (
        <div className="ins-skeleton" role="status" aria-label="Montando sua retrospectiva">
          <div className="mc-skeleton ins-skel-hero" />
          <div className="ins-skel-duo">
            <div className="mc-skeleton ins-skel-card" />
            <div className="mc-skeleton ins-skel-card" />
          </div>
        </div>
      ) : null}

      {data && empty ? (
        <section className="ins-hero ins-hero--empty">
          <span className="ins-kicker">{year}</span>
          <p className="ins-hero-title">Nenhum filme ou episódio registrado em {year}.</p>
          <p className="ins-hero-sub">A retrospectiva usa as datas em que você marcou filmes e episódios como assistidos.</p>
          {year !== thisYear ? (
            <button type="button" className="btn primary" onClick={() => setYear(thisYear)}>
              Ver {thisYear}
            </button>
          ) : null}
        </section>
      ) : null}

      {data && c && y && !empty ? (
        <div className="ins-story">
          <section className="ins-retro-hero">
            <p className="ins-retro-lead">Em {year}, você passou</p>
            <p className="ins-hero-number">
              {nf.format(c.hours)} <span>{c.hours === 1 ? "hora" : "horas"}</span>
            </p>
            <p className="ins-hero-sub">
              assistindo filmes e séries{c.minutes >= 1440 ? ` — cerca de ${durationLabel(c.minutes)}` : ""}.
            </p>
            <div className="ins-retro-numbers">
              <div>
                <strong>{nf.format(c.movies)}</strong>
                <span>{c.movies === 1 ? "filme" : "filmes"}</span>
              </div>
              <div>
                <strong>{nf.format(c.episodes)}</strong>
                <span>episódios</span>
              </div>
              <div>
                <strong>{nf.format(c.series)}</strong>
                <span>{c.series === 1 ? "série" : "séries"}</span>
              </div>
              <div>
                <strong>{nf.format(c.activeDays)}</strong>
                <span>dias com atividade</span>
              </div>
              {c.avgRating !== null ? (
                <div>
                  <strong>{dec(c.avgRating)}</strong>
                  <span>nota média</span>
                </div>
              ) : null}
            </div>
            {changes.length ? (
              <ul className="ins-retro-compare">
                {changes.map((ch) => (
                  <li key={ch.label}>
                    {ch.label}: {ch.fmt(ch.from)} em {year - 1} → <strong>{ch.fmt(ch.to)}</strong>
                    {isCurrent ? " até agora" : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {y.bestMovie || y.bestSeries ? (
            <section className="ins-chapter" aria-label="Destaques do ano">
              <header className="ins-chapter-head">
                <div>
                  <span className="ins-kicker">Destaques</span>
                  <h2>O que marcou seu {year}</h2>
                </div>
              </header>
              <div className="ins-retro-picks">
                {y.bestMovie ? <Pick label="Filme do ano" item={y.bestMovie} /> : null}
                {y.bestSeries ? <Pick label="Série do ano" item={y.bestSeries} /> : null}
              </div>
              <dl className="ins-year-picks">
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
                {data.activity && data.activity.longestStreak >= 2 ? (
                  <div>
                    <dt>Maior sequência</dt>
                    <dd>{data.activity.longestStreak} dias seguidos</dd>
                  </div>
                ) : null}
                {c.rewatches ? (
                  <div>
                    <dt>Reassistidas</dt>
                    <dd>{nf.format(c.rewatches)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {yearInsights.length ? (
            <section className="ins-chapter" aria-label="O que seus dados dizem">
              <ul className="ins-headlines">
                {yearInsights.map((i) => (
                  <li key={i.id}>
                    <Sparkles size={16} aria-hidden="true" />
                    <span>{i.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.activity ? (
            <section className="ins-chapter" aria-labelledby="retro-ritmo">
              <header className="ins-chapter-head">
                <div>
                  <span className="ins-kicker">Ritmo</span>
                  <h2 id="retro-ritmo">Seu ano mês a mês</h2>
                </div>
                <div className="ins-seg" role="radiogroup" aria-label="Métrica">
                  {(
                    [
                      ["minutes", "Horas"],
                      ["movies", "Filmes"],
                      ["episodes", "Episódios"],
                    ] as [MonthMetric, string][]
                  ).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={metric === value} className={metric === value ? "is-active" : ""} onClick={() => setMetric(value)}>
                      {label}
                    </button>
                  ))}
                </div>
              </header>
              <div className="ins-panel">
                <MonthlyChart data={data.activity.monthly} metric={metric} />
              </div>
              <div className="ins-panel">
                <Heatmap days={data.activity.days} years={[year]} />
              </div>
            </section>
          ) : null}

          {y.top.length ? (
            <section className="ins-chapter" aria-labelledby="retro-top">
              <header className="ins-chapter-head">
                <div>
                  <span className="ins-kicker">Suas maiores notas</span>
                  <h2 id="retro-top">Os melhores do seu {year}</h2>
                </div>
              </header>
              <ol className="ins-top">
                {y.top.map((item, i) => (
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
                        <Star size={14} fill="currentColor" aria-hidden="true" /> {dec(item.rating)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <RetrospectiveShare
            data={{
              year,
              hours: c.hours,
              movies: c.movies,
              episodes: c.episodes,
              series: c.series,
              rewatches: c.rewatches,
              topGenre: y.topGenre,
              topMonth: y.busiestMonth ? monthName(y.busiestMonth).split(" de ")[0] : null,
              highlightTitle: y.top[0]?.title ?? null,
            }}
          />

          <p className="ins-muted ins-small ins-retro-foot">
            Horas são estimativa (duração de filmes e episódios marcados como assistidos em {year}
            {c.movies + c.series ? `; ${pct(c.movieMinutes / Math.max(1, c.minutes))} em filmes` : ""}). O registro dia a dia está no{" "}
            <Link href="/diary">Diário</Link>.{" "}
            <Link href={`/insights?period=${year}`} className="ins-link">
              Ver {year} no Insights <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </p>
        </div>
      ) : null}
    </>
  );
}

export default function RetrospectivePage() {
  return (
    <Suspense fallback={null}>
      <RetrospectiveContent />
    </Suspense>
  );
}
