"use client";

import {
  useEffect,
  useState,
} from "react";

import { Search } from "@/components/Search";
import { InsightsSubNav } from "@/components/InsightsSubNav";

import {
  Film,
  Tv,
  Star,
  Heart,
  Clock3,
  Play,
  Check,
  XCircle,
  Clock,
  RotateCcw,
  Trophy,
  Loader2,
} from "lucide-react";

import type { StatsSummary } from "@/app/api/stats/route";

/*
 * F1 — antes esta página buscava a biblioteca inteira via /api/library
 * (sem paginated=true) e agregava tudo (contagens, médias, distribuição
 * de notas, gêneros, anos, tempo assistido) em useMemo no browser (F0,
 * HIGH). Agora só consome o resumo já pronto de GET /api/stats — a
 * página nunca vê as linhas da biblioteca.
 *
 * Bug real encontrado durante a consolidação: o painel "Gêneros mais
 * presentes" renderizava `years.map(...)` em vez de `genres.map(...)`
 * (cópia-e-cola) — mostrava anos duas vezes e a lista de gêneros nunca
 * aparecia. Corrigido junto, não é um comportamento a preservar.
 *
 * V2.1-A — STATS-01/02/03 (docs/V2.1-POST-V2-AUDIT.md): "Tempo
 * estimado"/"Episódios" contavam o catálogo inteiro (qualquer status,
 * inclusive "want" nunca assistido) como se fosse consumo real. A tela
 * agora separa "Sua biblioteca" (o que você tem catalogado) de "Seu
 * histórico" (o que você realmente assistiu, via `summary.watched`).
 * Ver docs/V2.1-A-DATA-INTEGRITY.md para a semântica canônica completa.
 */

type Estado = "carregando" | "erro" | "pronto";

export default function Stats() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");

  async function load() {
    setEstado("carregando");

    try {
      const response = await fetch("/api/stats", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));

      const result: StatsSummary = await response.json();
      setSummary(result);
      setEstado("pronto");
    } catch (error) {
      console.error("Estatísticas:", error);
      setEstado("erro");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const maxRatingCount = summary
    ? Math.max(...summary.ratings.distribution.map((item) => item.count), 1)
    : 1;
  const maxGenreCount = summary
    ? Math.max(...summary.genres.map((item) => item.count), 1)
    : 1;
  const maxYearCount = summary
    ? Math.max(...summary.years.map((item) => item.count), 1)
    : 1;

  return (
    <>
      <Search />

      <InsightsSubNav active="stats" />

      <div className="section">
        <div className="eyebrow">
          Biblioteca e histórico
        </div>

        <h1>Estatísticas</h1>

        <p className="muted">
          Sua biblioteca (o que você tem
          catalogado) e seu histórico (o
          que você realmente assistiu),
          separados.
        </p>
      </div>

      {estado === "carregando" && (
        <div className="empty library-page-loading" role="status" aria-live="polite">
          <Loader2 size={25} className="spin" />
          <span>Carregando estatísticas...</span>
        </div>
      )}

      {estado === "erro" && (
        <div className="empty" role="alert">
          <strong>Não foi possível carregar suas estatísticas.</strong>
          <p className="muted">Verifique sua conexão e tente novamente.</p>
          <button type="button" className="btn primary" onClick={load}>
            Tentar de novo
          </button>
        </div>
      )}

      {estado === "pronto" && summary && summary.totals.items === 0 && (
        <div className="empty">
          <strong>Sua biblioteca ainda está vazia.</strong>
          <p className="muted">Adicione títulos para ver suas estatísticas aqui.</p>
        </div>
      )}

      {estado === "pronto" && summary && summary.totals.items > 0 && (
        <>
          {/* SUA BIBLIOTECA — o que você tem catalogado, qualquer status */}

          <div className="section">
            <h2>Sua biblioteca</h2>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <Film size={18} />
              <span className="muted">Filmes</span>
              <b>{summary.totals.movies}</b>
            </div>

            <div className="stat">
              <Tv size={18} />
              <span className="muted">Séries</span>
              <b>{summary.totals.series}</b>
            </div>

            <div className="stat">
              <Star size={18} />
              <span className="muted">Nota média</span>
              <b>
                {summary.ratings.average_personal !== null
                  ? summary.ratings.average_personal.toFixed(1)
                  : "—"}
              </b>
            </div>

            <div className="stat">
              <Heart size={18} />
              <span className="muted">Curtidos</span>
              <b>{summary.favorites}</b>
            </div>
          </div>

          {/* SEU HISTÓRICO — só consumo com evidência real, nunca "want" */}

          <div className="section">
            <h2>Seu histórico</h2>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <Clock3 size={18} />
              <span className="muted">Tempo assistido (estimado)</span>
              <b>{summary.watched.watch_time.total_hours}h</b>
            </div>

            <div className="stat">
              <Play size={18} />
              <span className="muted">Episódios assistidos</span>
              <b>{summary.watched.episodes_watched}</b>
            </div>

            <div className="stat">
              <Check size={18} />
              <span className="muted">Filmes assistidos</span>
              <b>{summary.watched.movies_watched}</b>
            </div>

            <div className="stat">
              <Trophy size={18} />
              <span className="muted">Séries concluídas</span>
              <b>{summary.watched.series_completed}</b>
            </div>
          </div>

          {/* STATUS */}

          <div className="section">
            <h2>Status da biblioteca</h2>
          </div>

          <div className="stats-status-grid">
            <div className="stats-status-card">
              <Check size={18} />
              <span>Assistidos</span>
              <b>{summary.statuses.watched}</b>
            </div>

            <div className="stats-status-card">
              <Play size={18} />
              <span>Assistindo</span>
              <b>{summary.statuses.watching}</b>
            </div>

            <div className="stats-status-card">
              <Clock size={18} />
              <span>Quero assistir</span>
              <b>{summary.statuses.want}</b>
            </div>

            <div className="stats-status-card">
              <RotateCcw size={18} />
              <span>Reassistindo</span>
              <b>{summary.statuses.rewatching}</b>
            </div>

            <div className="stats-status-card">
              <XCircle size={18} />
              <span>Abandonados</span>
              <b>{summary.statuses.dropped}</b>
            </div>
          </div>

          {/* NOTAS + RESUMO */}

          <div className="two section">
            <div className="panel">
              <h3>Distribuição das suas notas</h3>

              <div className="rating-chart">
                {summary.ratings.distribution
                  .slice()
                  .reverse()
                  .map((item) => (
                    <div className="rating-row" key={item.rating}>
                      <span>{item.rating}</span>

                      <div className="rating-bar">
                        <div
                          style={{
                            width: `${
                              item.count
                                ? Math.max(5, (item.count / maxRatingCount) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>

                      <b>{item.count}</b>
                    </div>
                  ))}
              </div>
            </div>

            <div className="panel">
              <h3>Resumo</h3>

              <div className="row">
                <span>Títulos na biblioteca</span>
                <b>{summary.totals.items}</b>
              </div>

              <div className="row">
                <span>Avaliados</span>
                <b>{summary.totals.rated}</b>
              </div>

              <div className="row">
                <span>Nota média TMDB</span>
                <b>
                  {summary.ratings.average_tmdb !== null
                    ? summary.ratings.average_tmdb.toFixed(1)
                    : "—"}
                </b>
              </div>

              <div className="row">
                <span>Temporadas concluídas</span>
                <b>{summary.watched.seasons_completed}</b>
              </div>

              <div className="row">
                <span>Reassistências</span>
                <b>{summary.watched.rewatched}</b>
              </div>

              <div className="row">
                <span>Dias equivalentes (estimado)</span>
                <b>{summary.watched.watch_time.days_watched}</b>
              </div>
            </div>
          </div>

          {/* GÊNEROS + ANOS */}

          <div className="two section">
            <div className="panel">
              <h3>Gêneros mais presentes</h3>

              {summary.genres.length ? (
                summary.genres.map((item) => (
                  <div className="row" key={item.name}>
                    <span>{item.name}</span>

                    <div className="stats-bar-row">
                      <div className="stats-bar-track">
                        <div
                          className="stats-bar-fill"
                          style={{
                            width: `${(item.count / maxGenreCount) * 100}%`,
                          }}
                        />
                      </div>

                      <b>{item.count}</b>
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">Nenhum gênero disponível.</div>
              )}
            </div>

            <div className="panel">
              <h3>Títulos por ano</h3>

              {summary.years.length ? (
                summary.years.map((item) => (
                  <div className="row" key={item.year}>
                    <span>{item.year}</span>

                    <div className="stats-bar-row">
                      <div className="stats-bar-track">
                        <div
                          className="stats-bar-fill"
                          style={{
                            width: `${(item.count / maxYearCount) * 100}%`,
                          }}
                        />
                      </div>

                      <b>{item.count}</b>
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">Nenhum dado disponível.</div>
              )}
            </div>
          </div>

          {/* DESTAQUE */}

          {summary.highest_rated && (
            <div className="section">
              <div className="panel stats-highlight">
                <div>
                  <div className="eyebrow">Sua maior nota</div>

                  <h2>{summary.highest_rated.title}</h2>

                  <div className="stats-highlight-meta">
                    <Trophy size={16} />

                    <span>
                      Você deu{" "}
                      <strong>{summary.highest_rated.personal_rating.toFixed(1)}</strong>/10
                    </span>

                    {summary.highest_rated.tmdb_rating !== null && (
                      <span className="muted">
                        TMDB {summary.highest_rated.tmdb_rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="muted">
            * &ldquo;Sua biblioteca&rdquo; mostra tudo o que
            você catalogou, independente de já
            ter assistido. &ldquo;Seu histórico&rdquo; conta
            só o que você realmente assistiu —
            títulos em &ldquo;Quero assistir&rdquo; nunca
            entram aqui. O tempo assistido é uma
            estimativa baseada na duração média
            disponível de cada filme/episódio
            realmente assistido, não da série
            inteira.
          </p>
        </>
      )}
    </>
  );
}
