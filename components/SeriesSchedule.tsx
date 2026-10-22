"use client";


import "@/styles/features/title-detail.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, Radio, Tv } from "lucide-react";

import { img } from "@/lib/tmdb";
import { useAuthState } from "@/hooks/useLibraryAuth";
import { longDate, relativeWhen, shortDate, todayIn } from "@/lib/calendar/dates";

/*
 * Agenda da série na página de título.
 *
 * V3.1 — mesma semântica de datas do Calendário (lib/calendar/dates.ts): data
 * pura do TMDB, "hoje" = dia civil de Brasília, rótulos relativos iguais aos
 * do Calendário. Sem progresso próprio (o "onde estou" é o painel "Seu
 * progresso", canônico). Série encerrada sem nada anunciado não ganha bloco
 * vazio; em produção sem data, uma linha compacta.
 */

type Episode = {
  id: number;
  season_number: number;
  episode_number: number;
  name: string;
  overview: string;
  air_date: string;
  runtime: number | null;
  still_path: string | null;
};

type Schedule = { in_production: boolean; upcoming: Episode[] };

const pad = (n: number) => String(n).padStart(2, "0");
const code = (e: Episode) => `T${e.season_number}:E${pad(e.episode_number)}`;

export function SeriesSchedule({ tvId, inProduction }: { tvId: number | string; inProduction: boolean }) {
  // Fase 1 (P3-10): página pública — o Calendário (privado) só é pré-carregado com sessão.
  const authState = useAuthState();
  const [data, setData] = useState<Schedule | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/tv/${tvId}/schedule`)
      .then(async (response) => {
        const result = await response.json().catch(() => null);

        if (!response.ok || result?.error) throw new Error("schedule");
        if (!cancelled) {
          setData({ in_production: Boolean(result?.in_production), upcoming: Array.isArray(result?.upcoming) ? result.upcoming : [] });
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [tvId]);

  // Falha da agenda nunca derruba a página: some.
  if (state === "error") return null;

  const today = todayIn();
  const upcoming = (data?.upcoming ?? []).filter((e) => e.air_date && e.air_date >= today).slice(0, 8);
  const next = upcoming[0] ?? null;

  if (state === "loading") {
    // Série encerrada: nada a reservar enquanto carrega.
    return inProduction ? (
      <section className="section mc-title-section title-series-schedule-section" aria-busy="true">
        <div className="mc-skeleton series-schedule-skeleton" />
      </section>
    ) : null;
  }

  if (!next) {
    if (!(data?.in_production ?? inProduction)) return null;

    return (
      <section className="section mc-title-section title-series-schedule-section">
        <p className="series-schedule-compact muted">
          <CalendarDays size={16} aria-hidden="true" /> Em produção — sem data anunciada para o próximo episódio.
        </p>
      </section>
    );
  }

  const when = relativeWhen(next.air_date, today);

  return (
    <section className="section mc-title-section title-series-schedule-section">
      <div className="series-schedule">
        <div className="series-schedule-head">
          <div>
            <span className="eyebrow">AGENDA DA SÉRIE</span>
            <h2>Próximos episódios</h2>
            <p className="muted">Datas informadas pelo TMDB para os próximos lançamentos.</p>
          </div>

          <Link href="/calendar" className="btn" prefetch={authState === "authenticated" ? undefined : false}>
            <CalendarDays size={16} aria-hidden="true" />
            Ver calendário
          </Link>
        </div>

        <div className="series-next-episode panel">
          <div className="series-next-visual">
            {next.still_path ? (
              <img loading="lazy" decoding="async" src={img(next.still_path, "w780")} alt="" />
            ) : (
              <div className="series-next-placeholder">
                <Tv size={34} aria-hidden="true" />
              </div>
            )}
            <span className="series-next-countdown">
              <Radio size={12} aria-hidden="true" />
              {when}
            </span>
          </div>

          <div className="series-next-copy">
            <div className="series-next-kicker">PRÓXIMO LANÇAMENTO</div>
            <div className="series-next-code">{code(next)}</div>
            <h3>{next.name || `Episódio ${next.episode_number}`}</h3>
            <div className="series-next-meta">
              <span>
                <CalendarDays size={14} aria-hidden="true" />
                {longDate(next.air_date, today)}
              </span>
              {next.runtime ? (
                <span>
                  <Clock3 size={14} aria-hidden="true" />
                  {next.runtime} min
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {upcoming.length > 1 && (
          <div className="series-episode-list">
            {upcoming.map((episode, index) => {
              const { day, month } = shortDate(episode.air_date);

              return (
                <Link
                  key={`${episode.season_number}-${episode.episode_number}-${episode.id}`}
                  href={`/title/tv/${tvId}/season/${episode.season_number}/episode/${episode.episode_number}`}
                  className={`series-episode-row panel ${index === 0 ? "next" : ""}`}
                >
                  <div className="series-episode-date">
                    <strong>{day}</strong>
                    <span>{month}</span>
                  </div>
                  <div className="series-episode-number">{code(episode)}</div>
                  <div className="series-episode-info">
                    <strong>{episode.name || `Episódio ${episode.episode_number}`}</strong>
                    <span>
                      {longDate(episode.air_date, today)}
                      {episode.runtime ? ` · ${episode.runtime} min` : ""}
                    </span>
                  </div>
                  <div className="series-episode-when">
                    {relativeWhen(episode.air_date, today)}
                  </div>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
