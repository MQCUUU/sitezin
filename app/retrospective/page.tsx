"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import { Search } from "@/components/Search";
import { img } from "@/lib/tmdb";
import { InsightsSubNav } from "@/components/InsightsSubNav";
import {
  type ActivityEvent,
  deduplicateActivityEvents,
} from "@/lib/activity-events";

import {
  CalendarRange,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Eye,
  Film,
  RefreshCcw,
  Star,
  Trophy,
  Tv,
} from "lucide-react";

function currentYear() {
  return new Date().getFullYear();
}

function getYearFromDate(
  date: string
) {
  return new Date(
    date
  ).getFullYear();
}

export default function RetrospectivePage() {
  const [year, setYear] =
    useState(
      currentYear()
    );

  const [events, setEvents] =
    useState<
      ActivityEvent[]
    >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [retryTick, setRetryTick] =
    useState(0);

  /*
   * ==========================================
   * CARREGAR RETROSPECTIVA
   * ==========================================
   */

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const response =
          await fetch(
            `/api/activity?year=${year}&limit=1000`
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          data?.error
        ) {
          throw new Error(
            data?.error ||
              "Não foi possível carregar a retrospectiva."
          );
        }

        setEvents(
          Array.isArray(
            data
          )
            ? deduplicateActivityEvents(data)
            : []
        );
      } catch (err) {
        console.error(
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar retrospectiva."
        );
      } finally {
        setLoading(
          false
        );
      }
    }

    load();
  }, [year, retryTick]);

  /*
   * ==========================================
   * ANOS DISPONÍVEIS
   * ==========================================
   */

  const yearOptions =
    useMemo(() => {
      const now =
        currentYear();

      return Array.from(
        {
          length: 10,
        },
        (_, index) =>
          now - index
      );
    }, []);

  /*
   * ==========================================
   * EVENTOS IMPORTANTES
   * ==========================================
   */

  const addedEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "library_added"
        ),
      [events]
    );

  const seasonEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "season_completed"
        ),
      [events]
    );

  const completedEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "series_completed"
        ),
      [events]
    );

  const rewatchEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "rewatch_started"
        ),
      [events]
    );

  /*
   * V2.1-A — RETRO-01: `watch_logged` é o evento mais fiel a "eu
   * realmente assisti isso" (inserido por POST /api/watch-history, o
   * fluxo de Diário/avaliação), mas antes não tinha nenhuma
   * representação própria na Retrospectiva.
   */
  const watchLoggedEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "watch_logged"
        ),
      [events]
    );

  /*
   * V2.1-A (2º ajuste pós-gate — precedência por título era ampla
   * demais) — auditoria confirmou que NENHUM caminho de código emite
   * `watch_logged` e `status_changed` na mesma ação: `watch-history/
   * route.ts` só insere `watch_logged`; `library/[id]/route.ts` e
   * `library/route.ts` só inserem `status_changed`/`library_added`/
   * `rewatch_started` — nenhuma das duas rotas chama a outra
   * internamente, e `metadata` de um nunca referencia o outro (sem
   * `watch_entry_id` em `status_changed`, sem `to`/`from` em
   * `watch_logged`). Sem prova de dupla emissão pela mesma ação, a
   * versão anterior (suprimir TODO `status_changed` de um título só
   * porque existe QUALQUER `watch_logged` daquele título, mesmo em
   * datas totalmente diferentes) apagava eventos históricos legítimos
   * — ex.: `status_changed(to=watched)` em 2025 sendo descartado só
   * por existir um `watch_logged` de 2026 no mesmo título. Removida.
   *
   * Regra final: `watch_logged` e `status_changed(to=watched/
   * rewatched)` são sempre eventos independentes e legítimos — cada um
   * conta por si, sem um suprimir o outro. Múltiplos eventos do mesmo
   * tipo para o mesmo título (ex.: duas reassistidas datadas
   * diferentes) também são preservados, pois cada um representa uma
   * interação real distinta no tempo.
   */
  const statusWatchedFallbackEvents =
    useMemo(
      () =>
        events.filter((event) => {
          if (event.event_type !== "status_changed") return false;
          const to = event.metadata?.to;
          return to === "watched" || to === "rewatched";
        }),
      [events]
    );

  /*
   * V2.1-A — RETRO-02: eventos que não representam consumo real
   * (`library_added`, `status_changed` para status que não implicam
   * conclusão) ficam de fora do cálculo de "gênero mais presente" e
   * "mês mais ativo" — do contrário, só catalogar um título (sem nunca
   * assistir) infla essas métricas tanto quanto realmente assisti-lo.
   * `status_changed(to=watched/rewatched)` participa via
   * `statusWatchedFallbackEvents`, já deduplicado por título contra
   * `watch_logged`.
   */
  const consumptionEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type === "watch_logged" ||
            event.event_type === "season_completed" ||
            event.event_type === "series_completed" ||
            event.event_type === "rewatch_started"
        ).concat(statusWatchedFallbackEvents),
      [events, statusWatchedFallbackEvents]
    );

  /*
   * ==========================================
   * FILMES E SÉRIES ADICIONADOS
   * ==========================================
   */

  const moviesAdded =
    useMemo(
      () =>
        addedEvents.filter(
          (event) =>
            event.media
              ?.media_type ===
            "movie"
        ),
      [addedEvents]
    );

  const showsAdded =
    useMemo(
      () =>
        addedEvents.filter(
          (event) =>
            event.media
              ?.media_type ===
            "tv"
        ),
      [addedEvents]
    );

  /*
   * ==========================================
   * GÊNERO MAIS PRESENTE
   * ==========================================
   */

  const topGenre =
    useMemo(() => {
      const counts =
        new Map<
          string,
          number
        >();

      /*
       * Alguns registros do banco podem ter
       * gêneros como string:
       *
       * "Drama"
       *
       * e outros como objeto do TMDB:
       *
       * { id: 18, name: "Drama" }
       *
       * Aqui normalizamos os dois formatos.
       */

      for (
        const event
        of consumptionEvents
      ) {
        const genres =
          event.media
            ?.genres ||
          [];

        for (
          const genre
          of genres
        ) {
          const genreName =
            typeof genre ===
            "string"
              ? genre
              : genre?.name;

          if (!genreName) {
            continue;
          }

          counts.set(
            genreName,
            (
              counts.get(
                genreName
              ) || 0
            ) + 1
          );
        }
      }

      const sorted =
        Array.from(
          counts.entries()
        ).sort(
          (a, b) =>
            b[1] -
            a[1]
        );

      if (
        sorted.length ===
        0
      ) {
        return null;
      }

      return {
        name:
          sorted[0][0],

        count:
          sorted[0][1],
      };
    }, [
      consumptionEvents,
    ]);

  /*
   * ==========================================
   * TÍTULOS MAIS IMPORTANTES
   * ==========================================
   */

  const highlights =
    useMemo(() => {
      const map =
        new Map<
          string,
          {
            media:
              NonNullable<
                ActivityEvent["media"]
              >;

            score:
              number;
          }
        >();

      /*
       * V2.1-A — RETRO-02: `library_added` (só catalogar, sem nunca
       * assistir) não pontua mais aqui — antes tinha peso 1 e podia
       * colocar um título nunca visto entre os "títulos que marcaram seu
       * ano". `status_changed` nunca pontuou (mantido assim). Pesos
       * agora refletem só evidência real de consumo, com `watch_logged`
       * (evento mais direto de "eu assisti") pesando mais que
       * `season_completed` (dado incerto — sem produtor ativo, ver
       * docs/V2.1-A-DATA-INTEGRITY.md), mas menos que concluir uma série
       * inteira.
       */
      for (
        const event
        of consumptionEvents
      ) {
        if (
          !event.media
        ) {
          continue;
        }

        const key =
          `${event.media.media_type}-${event.media.tmdb_id}`;

        const current =
          map.get(
            key
          ) || {
            media:
              event.media,

            score: 0,
          };

        if (
          event.event_type ===
          "season_completed"
        ) {
          current.score +=
            2;
        }

        if (
          event.event_type ===
          "watch_logged"
        ) {
          current.score +=
            3;
        }

        /*
         * V2.1-A — status_changed(to=watched/rewatched) sempre conta,
         * independente de existir watch_logged para o mesmo título (ver
         * comentário de statusWatchedFallbackEvents — os dois nunca são
         * emitidos pela mesma ação, sem prova de dupla emissão não há
         * base para suprimir um pelo outro). Peso menor que
         * watch_logged/rewatch_started — é um sinal real e datado, mas
         * menos deliberado que registrar no Diário.
         */
        if (
          event.event_type ===
            "status_changed" &&
          (event.metadata?.to === "watched" ||
            event.metadata?.to === "rewatched")
        ) {
          current.score +=
            1;
        }

        if (
          event.event_type ===
          "rewatch_started"
        ) {
          current.score +=
            3;
        }

        if (
          event.event_type ===
          "series_completed"
        ) {
          current.score +=
            5;
        }

        map.set(
          key,
          current
        );
      }

      return Array.from(
        map.values()
      )
        .sort(
          (a, b) =>
            b.score -
            a.score
        )
        .slice(
          0,
          6
        );
    }, [
      consumptionEvents,
    ]);

  /*
   * ==========================================
   * MESES MAIS ATIVOS
   * ==========================================
   */

  const topMonth =
    useMemo(() => {
      const counts =
        new Map<
          number,
          number
        >();

      for (
        const event
        of consumptionEvents
      ) {
        const month =
          new Date(
            event.occurred_at
          ).getMonth();

        counts.set(
          month,
          (
            counts.get(
              month
            ) || 0
          ) + 1
        );
      }

      const sorted =
        Array.from(
          counts.entries()
        ).sort(
          (a, b) =>
            b[1] -
            a[1]
        );

      if (
        sorted.length ===
        0
      ) {
        return null;
      }

      const monthName =
        new Intl.DateTimeFormat(
          "pt-BR",
          {
            month:
              "long",
          }
        ).format(
          new Date(
            year,
            sorted[0][0],
            1
          )
        );

      return {
        name:
          monthName,

        count:
          sorted[0][1],
      };
    }, [
      consumptionEvents,
      year,
    ]);

  /*
   * ==========================================
   * TOTAL DE ATIVIDADES
   * ==========================================
   */

  const totalActivity =
    events.length;

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <InsightsSubNav active="retrospective" />

      <section className="section retrospective-head">

        <div>

          <div className="eyebrow">
            Seu ano no MyCatalog
          </div>

          <h1>
            Retrospectiva
          </h1>

          <p className="muted">
            Veja como foi seu ano
            entre filmes, séries,
            temporadas e
            reassistidas.
          </p>

        </div>

        <label className="retrospective-year">

          <CalendarRange
            size={17}
          />

          <select
            value={year}
            onChange={(
              event
            ) =>
              setYear(
                Number(
                  event.target
                    .value
                )
              )
            }
          >

            {yearOptions.map(
              (
                option
              ) => (
                <option
                  key={
                    option
                  }
                  value={
                    option
                  }
                >
                  {option}
                </option>
              )
            )}

          </select>

        </label>

      </section>

      {loading && (

        <div className="empty" role="status" aria-live="polite">
          Montando sua
          retrospectiva...
        </div>

      )}

      {!loading &&
        error && (

        <div className="empty" role="alert">
          <strong>{error}</strong>
          <button
            type="button"
            className="btn primary"
            onClick={() => setRetryTick((tick) => tick + 1)}
          >
            Tentar de novo
          </button>
        </div>

      )}

      {!loading &&
        !error &&
        events.length ===
          0 && (

        <div className="empty retrospective-empty">

          <Trophy
            size={38}
          />

          <strong>
            Ainda não há
            atividades em{" "}
            {year}
          </strong>

          <span>
            Conforme você usar
            o MyCatalog, sua
            retrospectiva será
            criada
            automaticamente.
          </span>

        </div>

      )}

      {!loading &&
        !error &&
        events.length >
          0 && (
        <>

          {/* RESUMO */}

          <section className="section">

            <div className="retrospective-stats">

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Eye
                    size={20}
                  />
                </div>

                <span>
                  Visualizações registradas
                </span>

                <strong>
                  {
                    watchLoggedEvents.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <CheckCircle2
                    size={20}
                  />
                </div>

                <span>
                  Marcados como assistidos
                </span>

                <strong>
                  {
                    statusWatchedFallbackEvents.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Film
                    size={20}
                  />
                </div>

                <span>
                  Filmes adicionados
                </span>

                <strong>
                  {
                    moviesAdded.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Tv
                    size={20}
                  />
                </div>

                <span>
                  Séries adicionadas
                </span>

                <strong>
                  {
                    showsAdded.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <CheckCircle2
                    size={20}
                  />
                </div>

                <span>
                  Temporadas concluídas
                </span>

                <strong>
                  {
                    seasonEvents.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Trophy
                    size={20}
                  />
                </div>

                <span>
                  Séries concluídas
                </span>

                <strong>
                  {
                    completedEvents.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <RefreshCcw
                    size={20}
                  />
                </div>

                <span>
                  Reassistidas
                </span>

                <strong>
                  {
                    rewatchEvents.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Clock3
                    size={20}
                  />
                </div>

                <span>
                  Atividades registradas
                </span>

                <strong>
                  {
                    totalActivity
                  }
                </strong>

              </div>

            </div>

            <p className="muted">
              * &ldquo;Adicionados&rdquo; conta o que
              entrou na sua biblioteca, não
              necessariamente o que você
              assistiu. &ldquo;Visualizações
              registradas&rdquo;, &ldquo;Marcados como
              assistidos&rdquo; e &ldquo;Reassistidas&rdquo;
              refletem consumo real.
            </p>

            <p className="muted">
              * Esta retrospectiva considera
              atividades registradas com data
              no MyCatalog. Títulos antigos
              marcados como assistidos sem um
              registro datado podem não
              aparecer aqui.
            </p>

          </section>

          {/* DESTAQUES */}

          <section className="section">

            <div className="title-section-heading">

              <span>
                Destaques
              </span>

              <h2>
                Seu {year}
              </h2>

            </div>

            <div className="retrospective-highlights">

              <div className="panel retrospective-highlight">

                <Star
                  size={20}
                />

                <span>
                  Gênero mais presente
                </span>

                <strong>
                  {topGenre
                    ? topGenre.name
                    : "—"}
                </strong>

                {topGenre && (
                  <small>
                    apareceu em{" "}
                    {
                      topGenre.count
                    }{" "}
                    atividades
                  </small>
                )}

              </div>

              <div className="panel retrospective-highlight">

                <CalendarRange
                  size={20}
                />

                <span>
                  Mês mais ativo
                </span>

                <strong className="capitalize">
                  {topMonth
                    ? topMonth.name
                    : "—"}
                </strong>

                {topMonth && (
                  <small>
                    {
                      topMonth.count
                    }{" "}
                    atividades
                  </small>
                )}

              </div>

              <div className="panel retrospective-highlight">

                <CheckCircle2
                  size={20}
                />

                <span>
                  Temporadas finalizadas
                </span>

                <strong>
                  {
                    seasonEvents.length
                  }
                </strong>

                <small>
                  durante {year}
                </small>

              </div>

              <div className="panel retrospective-highlight">

                <RefreshCcw
                  size={20}
                />

                <span>
                  Reassistidas iniciadas
                </span>

                <strong>
                  {
                    rewatchEvents.length
                  }
                </strong>

                <small>
                  durante {year}
                </small>

              </div>

            </div>

          </section>

          {/* TÍTULOS MARCANTES */}

          {highlights.length >
            0 && (

            <section className="section">

              <div className="title-section-heading">

                <span>
                  Memórias do ano
                </span>

                <h2>
                  Títulos que marcaram seu {year}
                </h2>

              </div>

              <div className="retrospective-posters">

                {highlights.map(
                  (
                    highlight
                  ) => {

                    const media =
                      highlight.media;

                    return (
                      <Link
                        key={`${media.media_type}-${media.tmdb_id}`}
                        href={`/title/${media.media_type}/${media.tmdb_id}`}
                        className="panel retrospective-media"
                      >

                        {media.poster_path ? (

                          <img loading="lazy" decoding="async"
                            src={img(
                              media.poster_path
                            )}
                            alt={
                              media.title
                            }
                          />

                        ) : (

                          <div className="retrospective-media-placeholder">

                            {media.media_type ===
                            "tv" ? (
                              <Tv
                                size={30}
                              />
                            ) : (
                              <Clapperboard
                                size={30}
                              />
                            )}

                          </div>

                        )}

                        <div>

                          <strong>
                            {
                              media.title
                            }
                          </strong>

                          <span className="muted">
                            {media.media_type ===
                            "tv"
                              ? "Série"
                              : "Filme"}
                          </span>

                        </div>

                      </Link>
                    );
                  }
                )}

              </div>

            </section>

          )}

          {/* LINHA DO TEMPO RESUMIDA */}

          <section className="section">

            <div className="title-section-heading">

              <span>
                Linha do tempo
              </span>

              <h2>
                Atividades de {year}
              </h2>

            </div>

            <div className="retrospective-timeline">

              {events
                .slice(
                  0,
                  12
                )
                .map(
                  (
                    event
                  ) => {

                    const media =
                      event.media;

                    return (
                      <div
                        key={
                          event.id
                        }
                        className="panel retrospective-timeline-item"
                      >

                        <div className="retrospective-timeline-date">

                          {new Intl.DateTimeFormat(
                            "pt-BR",
                            {
                              day:
                                "2-digit",
                              month:
                                "short",
                            }
                          ).format(
                            new Date(
                              event.occurred_at
                            )
                          )}

                        </div>

                        <div>

                          <strong>
                            {media
                              ?.title ||
                              "Título removido"}
                          </strong>

                          <span className="muted">

                            {event.event_type ===
                              "library_added" &&
                              "Adicionado à biblioteca"}

                            {event.event_type ===
                              "season_completed" &&
                              `Temporada ${event.metadata?.season ?? "—"} concluída`}

                            {event.event_type ===
                              "series_completed" &&
                              "Série concluída"}

                            {event.event_type ===
                              "rewatch_started" &&
                              "Começou a reassistir"}

                            {event.event_type ===
                              "watch_logged" &&
                              (event.metadata?.is_rewatch
                                ? "Reassistiu e registrou no Diário"
                                : "Assistiu e registrou no Diário")}

                            {event.event_type ===
                              "status_changed" &&
                              event.metadata?.to ===
                                "dropped" &&
                              `Abandonou na temporada ${
                                event.metadata
                                  ?.stopped_season ||
                                event.metadata
                                  ?.current_season ||
                                "?"
                              }`}

                            {event.event_type ===
                              "status_changed" &&
                              (event.metadata?.to ===
                                "watched" ||
                                event.metadata?.to ===
                                  "rewatched") &&
                              "Marcado como assistido"}

                            {event.event_type ===
                              "status_changed" &&
                              event.metadata?.to !==
                                "dropped" &&
                              event.metadata?.to !==
                                "watched" &&
                              event.metadata?.to !==
                                "rewatched" &&
                              `Mudou o status para ${
                                event.metadata
                                  ?.to ||
                                "—"
                              }`}

                          </span>

                        </div>

                      </div>
                    );
                  }
                )}

            </div>

          </section>

        </>
      )}
    </>
  );
}