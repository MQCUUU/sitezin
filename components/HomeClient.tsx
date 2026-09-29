"use client";

import { getLibraryVersion } from "@/lib/library-cache";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Check,
  Clock,
  Compass,
  Film,
  Heart,
  Library,
  Loader2,
  LogIn,
  Play,
  RefreshCcw,
  Sparkles,
  Star,
  Tv,
  UserPlus,
} from "lucide-react";

import {
  Search,
} from "@/components/Search";

import { Poster } from "@/components/Poster";
import { CarouselRail } from "@/components/CarouselRail";

import {
  PosterGrid,
} from "@/components/PosterGrid";

import {
  PickForMe,
} from "@/components/PickForMe";

import { authClient } from "@/lib/auth/client";

import type {
  LibraryItem,
} from "@/lib/types";

type CalendarEvent = {
  tmdb_id:
    number;

  media_type:
    "movie" |
    "tv";

  title:
    string;

  poster_path:
    string |
    null;

  backdrop_path:
    string |
    null;

  date:
    string |
    null;

  event_type:
    | "movie_release"
    | "episode"
    | "season"
    | "series_premiere";

  season_number:
    number |
    null;

  episode_number:
    number |
    null;

  episode_name:
    string |
    null;

  release_label:
    string |
    null;
};

type ActivityEvent = {
  id:
    string;

  event_type:
    string;

  metadata?:
    Record<
      string,
      any
    > |
    null;

  occurred_at:
    string;

  media?:
    {
      id?:
        string;

      tmdb_id?:
        number;

      media_type?:
        "movie" |
        "tv";

      title?:
        string;

      poster_path?:
        string |
        null;
    } |
    null;
};

type UserSummary = {
  name:
    string;

  email:
    string;
};

function parseDate(
  value:
    string
) {
  return new Date(
    `${value}T12:00:00`
  );
}

function startOfToday() {
  const now =
    new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
}

function daysUntil(
  value:
    string |
    null
) {
  if (
    !value
  ) {
    return null;
  }

  const target =
    parseDate(
      value
    );

  const today =
    startOfToday();

  const targetDay =
    new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );

  return Math.round(
    (
      targetDay.getTime() -
      today.getTime()
    ) /
      86400000
  );
}

function relativeDate(
  value:
    string |
    null
) {
  const days =
    daysUntil(
      value
    );

  if (
    days ===
    null
  ) {
    return "";
  }

  if (
    days < 0
  ) {
    return "Já lançou";
  }

  if (
    days ===
    0
  ) {
    return "Hoje";
  }

  if (
    days ===
    1
  ) {
    return "Amanhã";
  }

  if (
    days <=
    7
  ) {
    return `Em ${days} dias`;
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day:
        "2-digit",

      month:
        "short",
    }
  )
    .format(
      parseDate(
        value!
      )
    )
    .replace(
      ".",
      ""
    );
}

function calendarEventLabel(
  event:
    CalendarEvent
) {
  if (
    event.event_type ===
    "movie_release"
  ) {
    return (
      event.release_label ||
      "Lançamento"
    );
  }

  if (
    event.event_type ===
    "season"
  ) {
    return event.season_number
      ? `Temporada ${event.season_number}`
      : "Nova temporada";
  }

  if (
    event.event_type ===
    "series_premiere"
  ) {
    return "Estreia da série";
  }

  if (
    event.season_number &&
    event.episode_number
  ) {
    return `T${event.season_number} · E${event.episode_number}`;
  }

  return "Novo episódio";
}

function formatActivityDate(
  date:
    string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day:
        "2-digit",

      month:
        "short",

      hour:
        "2-digit",

      minute:
        "2-digit",
    }
  )
    .format(
      new Date(
        date
      )
    )
    .replace(
      ".",
      ""
    );
}

function activityLabel(
  event:
    ActivityEvent
) {
  const title =
    event.media?.title ||
    event.metadata?.title ||
    "Título";

  const meta =
    event.metadata ||
    {};

  switch (
    event.event_type
  ) {
    case "watch_logged":
      if (
        meta.is_rewatch
      ) {
        return meta.rating !==
          null &&
          meta.rating !==
            undefined
          ? `Você reassistiu ${title} · ${Number(
              meta.rating
            ).toFixed(
              1
            )}`
          : `Você reassistiu ${title}`;
      }

      return meta.rating !==
        null &&
        meta.rating !==
          undefined
        ? `Você assistiu ${title} · ${Number(
            meta.rating
          ).toFixed(
            1
          )}`
        : `Você assistiu ${title}`;

    case "library_added":
      return `${title} entrou na biblioteca`;

    case "season_completed":
      return `${title}: temporada ${
        meta.season ||
        ""
      } concluída`;

    case "series_completed":
      return `${title} foi concluída`;

    case "rewatch_started":
      return `Você começou a reassistir ${title}`;

    case "status_changed":
      return `${title} mudou de status`;

    default:
      return title;
  }
}

function itemTimestamp(
  item:
    any
) {
  const value =
    item.updated_at ||
    item.watched_at ||
    item.added_at ||
    0;

  const parsed =
    new Date(
      value
    ).getTime();

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

/*
 * V2.1-D — contrato de GET /api/home (ver app/api/home/route.ts).
 * As linhas chegam no mesmo formato de GET /api/library
 * ({ id, status, ..., media: {...} }); `flattenHomeItem` faz o mesmo
 * achatamento que a Home sempre fez (`library_id` + `...item.media`).
 */
type HomeTotals = {
  library: number;
  watching: number;
  want: number;
  watched: number;
  favorites: number;
  rated: number;
  average_rating: number | null;
  completion_base: number;
};

type HomeData = {
  totals: HomeTotals;
  watching: LibraryItem[];
  want: LibraryItem[];
  best: LibraryItem[];
  recent: LibraryItem[];
};

const EMPTY_HOME_DATA: HomeData = {
  totals: {
    library: 0,
    watching: 0,
    want: 0,
    watched: 0,
    favorites: 0,
    rated: 0,
    average_rating: null,
    completion_base: 0,
  },
  watching: [],
  want: [],
  best: [],
  recent: [],
};

function flattenHomeItem(item: any): LibraryItem {
  return {
    ...item,
    library_id: item.id,
    ...item.media,
  };
}

function normalizeHomeData(raw: any): HomeData {
  const shelf = (value: unknown): LibraryItem[] =>
    Array.isArray(value) ? value.map(flattenHomeItem) : [];

  return {
    totals: { ...EMPTY_HOME_DATA.totals, ...(raw?.totals || {}) },
    watching: shelf(raw?.watching),
    want: shelf(raw?.want),
    best: shelf(raw?.best),
    recent: shelf(raw?.recent),
  };
}

/*
 * Valida o formato ANTES de usar (resposta da API OU cache de
 * sessionStorage) — um cache antigo/incompatível nunca deve quebrar a
 * Home; simplesmente é ignorado.
 */
function isHomeData(value: any): value is HomeData {
  return (
    value &&
    typeof value === "object" &&
    value.totals &&
    typeof value.totals.library === "number" &&
    Array.isArray(value.watching) &&
    Array.isArray(value.want) &&
    Array.isArray(value.best) &&
    Array.isArray(value.recent)
  );
}

export default function HomeClient() {
  /*
   * V2.1-D — antes: `data` = biblioteca INTEIRA (GET /api/library).
   * Agora: só o que a Home usa (GET /api/home) — 4 prateleiras com
   * limite fixo + totais agregados no SQL.
   */
  const [
    homeData,
    setHomeData,
  ] =
    useState<HomeData>(
      EMPTY_HOME_DATA
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    calendar,
    setCalendar,
  ] =
    useState<
      CalendarEvent[]
    >([]);

  const [nextProgressEpisode, setNextProgressEpisode] = useState<any>(null);

  const [
    calendarLoading,
    setCalendarLoading,
  ] =
    useState(
      true
    );

  const [
    activity,
    setActivity,
  ] =
    useState<
      ActivityEvent[]
    >([]);

  const [
    activityLoading,
    setActivityLoading,
  ] =
    useState(
      true
    );

  const [
    user,
    setUser,
  ] =
    useState<
      UserSummary |
      null
    >(null);

  /*
   * V2.1-C — "Em alta agora" na Home de visitante. Reaproveita
   * /api/discover (já público — aceita requisições sem sessão e só
   * usa `session` para sobrepor status de biblioteca quando existe,
   * ver app/api/discover/route.ts:527) em vez de duplicar qualquer
   * lógica do Discover. Só busca quando o guest branch é o que vai
   * renderizar (authReady && !user), 1 chamada, 10 itens, sem filtro.
   */
  const [
    trendingGuest,
    setTrendingGuest,
  ] =
    useState<any[]>([]);

  const [
    trendingGuestState,
    setTrendingGuestState,
  ] =
    useState<"carregando" | "erro" | "pronto">("carregando");

  const [
    authReady,
    setAuthReady,
  ] =
    useState(
      false
    );

  /*
   * ==========================================
   * CONTA
   * ==========================================
   */

  useEffect(() => {
    let mounted =
      true;

    authClient
      .getSession()
      .then(
        ({
          data,
        }: {
          data: any;
        }) => {
          if (
            !mounted
          ) {
            return;
          }

          const current =
            data?.user;

          if (
            current
          ) {
            const name =
              current.name ||
              current.email
                ?.split(
                  "@"
                )[0] ||
              "você";

            setUser({
              name,

              email:
                current.email ||
                "",
            });
          } else {
            setUser(
              null
            );
          }

          setAuthReady(
            true
          );
        }
      );

    return () => {
      mounted =
        false;
    };
  }, []);

  /*
   * ==========================================
   * CARREGAR HOME
   * ==========================================
   */

  useEffect(() => {
    if (
      !authReady
    ) {
      return;
    }

    if (
      !user
    ) {
      setHomeData(EMPTY_HOME_DATA);

      setCalendar(
        []
      );

      setActivity(
        []
      );

      setLoading(
        false
      );

      setCalendarLoading(
        false
      );

      setActivityLoading(
        false
      );

      return;
    }

    let cancelled =
      false;

    const homeCacheKey = `mycatalog:home:v3:${user.email}`;
    let hasLibraryCache = false;
    let hasCalendarCache = false;
    let hasActivityCache = false;
    try {
      const cached = JSON.parse(sessionStorage.getItem(homeCacheKey) || "null");
      if (
        cached &&
        Date.now() - cached.savedAt < 5 * 60 * 1000 &&
        // Não pinta estado que já se sabe desatualizado (mutação em outra tela).
        (cached.version ?? 0) === getLibraryVersion()
      ) {
        hasLibraryCache = isHomeData(cached.home);
        hasCalendarCache = Array.isArray(cached.calendar);
        hasActivityCache = Array.isArray(cached.activity);
        if (hasLibraryCache) setHomeData(cached.home);
        if (hasCalendarCache) setCalendar(cached.calendar);
        if (hasActivityCache) setActivity(cached.activity);
        if (hasLibraryCache) setLoading(false);
        if (hasCalendarCache) setCalendarLoading(false);
        if (hasActivityCache) setActivityLoading(false);
      }
    } catch { /* cache é apenas uma otimização */ }

    const versionAtStart = getLibraryVersion();

    function saveHomeCache(partial: Record<string, unknown>) {
      try { const current = JSON.parse(sessionStorage.getItem(homeCacheKey) || "{}"); sessionStorage.setItem(homeCacheKey, JSON.stringify({ ...current, ...partial, version: versionAtStart, savedAt: Date.now() })); } catch { /* storage pode estar indisponível */ }
    }

    async function loadLibrary() {
      try {
        if (!hasLibraryCache) setLoading(true);

        const response = await fetch("/api/home", { cache: "no-store" });
        const result = await response.json().catch(() => null);

        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            result?.error || "Não foi possível carregar a Home."
          );
        }

        const home = normalizeHomeData(result);

        if (!isHomeData(home)) {
          throw new Error("Resposta da Home em formato inesperado.");
        }

        if (!cancelled) {
          setHomeData(home);
          saveHomeCache({ home });
        }
      } catch (error) {
        console.error("Erro ao carregar Home:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function loadCalendar() {
      try {
        if (!hasCalendarCache) setCalendarLoading(true);

        const response =
          await fetch(
            "/api/calendar?scope=library",
            {
              cache:
                "no-store",
            }
          );

        const result =
          await response
            .json()
            .catch(
              () => null
            );

        if (
          response.status ===
          401
        ) {
          return;
        }

        if (
          !response.ok
        ) {
          throw new Error(
            result?.error ||
            "Não foi possível carregar o calendário."
          );
        }

        const events =
          Array.isArray(
            result?.library
          )
            ? result.library
            : Array.isArray(
                result?.all
              )
              ? result.all
              : Array.isArray(
                  result
                )
                ? result
                : [];

        const upcoming =
          events
            .filter(
              (
                event:
                  CalendarEvent
              ) =>
                Boolean(
                  event.date
                ) &&
                (
                  daysUntil(
                    event.date
                  ) ??
                  -1
                ) >=
                  0
            )
            .sort(
              (
                a:
                  CalendarEvent,
                b:
                  CalendarEvent
              ) =>
                String(
                  a.date
                ).localeCompare(
                  String(
                    b.date
                  )
                )
            )
            .slice(
              0,
              6
            );

        if (
          !cancelled
        ) {
          setCalendar(
            upcoming
          );
          saveHomeCache({ calendar: upcoming });
        }
      } catch (
        error
      ) {
        console.error(
          "Erro ao carregar calendário da Home:",
          error
        );
      } finally {
        if (
          !cancelled
        ) {
          setCalendarLoading(
            false
          );
        }
      }
    }

    async function loadActivity() {
      try {
        if (!hasActivityCache) setActivityLoading(true);

        const response =
          await fetch(
            "/api/activity?limit=6",
            {
              cache:
                "no-store",
            }
          );

        const result =
          await response
            .json()
            .catch(
              () => null
            );

        if (
          response.status ===
          401
        ) {
          return;
        }

        if (
          !response.ok
        ) {
          throw new Error(
            result?.error ||
            "Não foi possível carregar a atividade."
          );
        }

        if (
          !cancelled
        ) {
          setActivity(
            Array.isArray(
              result
            )
              ? result.slice(
                  0,
                  6
                )
                : []
          );
          saveHomeCache({ activity: Array.isArray(result) ? result.slice(0, 6) : [] });
        }
      } catch (
        error
      ) {
        console.error(
          "Erro ao carregar atividade da Home:",
          error
        );
      } finally {
        if (
          !cancelled
        ) {
          setActivityLoading(
            false
          );
        }
      }
    }

    Promise.all([
      loadLibrary(),
      loadCalendar(),
      loadActivity(),
    ]);

    return () => {
      cancelled =
        true;
    };
  }, [
    authReady,
    user?.email,
  ]);

  useEffect(() => {
    if (!authReady || user) return;

    let cancelled = false;
    setTrendingGuestState("carregando");

    fetch("/api/discover", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const results = Array.isArray(payload?.results) ? payload.results.slice(0, 10) : [];
        setTrendingGuest(results);
        setTrendingGuestState("pronto");
      })
      .catch(() => {
        if (!cancelled) setTrendingGuestState("erro");
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  /*
   * ==========================================
   * DADOS INTELIGENTES
   * ==========================================
   */

  /*
   * V2.1-D — as prateleiras já chegam ordenadas e limitadas do
   * servidor; os totais (contagens/média) já chegam agregados. Nada
   * mais é filtrado/ordenado sobre a biblioteca inteira no browser.
   */
  const watching = homeData.watching;
  const want = homeData.want;
  const best = homeData.best;
  const recent = homeData.recent;

  const librarySize = homeData.totals.library;
  const watchingCount = homeData.totals.watching;
  const watched = homeData.totals.watched;
  const wantCount = homeData.totals.want;
  const favorites = homeData.totals.favorites;
  const ratedCount = homeData.totals.rated;

  const averageRating =
    homeData.totals.average_rating !== null
      ? homeData.totals.average_rating.toFixed(1)
      : "—";

  const completionBase = homeData.totals.completion_base;

  const progress =
    completionBase > 0
      ? Math.round((watched / completionBase) * 100)
      : 0;

  const nextEvent =
    calendar[
      0
    ] ||
    null;

  const nextEventDays =
    nextEvent
      ? daysUntil(
          nextEvent.date
        )
      : null;

  const primaryWatching =
    watching[
      0
    ] ||
    null;

  useEffect(() => {
    let cancelled = false;
    async function loadNextEpisode() {
      if (!primaryWatching || primaryWatching.media_type !== "tv" || !(primaryWatching as any).library_id) {
        setNextProgressEpisode(null);
        return;
      }
      const season = Number((primaryWatching as any).current_season || 1);
      const [seasonResponse, progressResponse] = await Promise.all([
        fetch(`/api/tv/${primaryWatching.tmdb_id}/season/${season}`),
        fetch(`/api/episodes?library_id=${(primaryWatching as any).library_id}&season=${season}`, { cache: "no-store" }),
      ]);
      const [seasonData, progressData] = await Promise.all([seasonResponse.json(), progressResponse.json()]);
      const watched = new Set((Array.isArray(progressData) ? progressData : []).filter((item: any) => item.watched).map((item: any) => Number(item.episode_number)));
      const next = (Array.isArray(seasonData?.episodes) ? seasonData.episodes : []).find((item: any) =>
        !watched.has(Number(item.episode_number)) && (!item.air_date || new Date(`${item.air_date}T23:59:59`) <= new Date())
      );
      if (!cancelled) setNextProgressEpisode(next ? { ...next, season_number: season } : null);
    }
    loadNextEpisode().catch(() => { if (!cancelled) setNextProgressEpisode(null); });
    return () => { cancelled = true; };
  }, [primaryWatching?.tmdb_id, (primaryWatching as any)?.library_id, (primaryWatching as any)?.current_season]);

  const primaryWant =
    want[
      0
    ] ||
    null;

  const smartAction =
    useMemo(
      () => {
        /*
         * 1. Algo da agenda acontecendo agora ou muito perto.
         */
        if (
          nextEvent &&
          nextEventDays !==
            null &&
          nextEventDays <=
            2
        ) {
          return {
            kind:
              "calendar" as const,

            eyebrow:
              nextEventDays ===
                0
                ? "É HOJE"
                : nextEventDays ===
                    1
                  ? "É AMANHÃ"
                  : "ESTÁ CHEGANDO",

            title:
              nextEvent.title,

            description:
              `${calendarEventLabel(
                nextEvent
              )}${
                nextEvent.episode_name
                  ? ` · ${nextEvent.episode_name}`
                  : ""
              }`,

            href:
              `/title/${nextEvent.media_type}/${nextEvent.tmdb_id}`,

            action:
              "Ver lançamento",
          };
        }

        /*
         * 2. Retomar algo em andamento.
         */
        if (
          primaryWatching
        ) {
          return {
            kind:
              "watching" as const,

            eyebrow:
              primaryWatching.status ===
                "rewatching"
                ? "CONTINUE REASSISTINDO"
                : "CONTINUE DE ONDE PAROU",

            title:
              primaryWatching.title,

            description:
              nextProgressEpisode
                ? `Próximo: T${nextProgressEpisode.season_number} · E${nextProgressEpisode.episode_number} · ${nextProgressEpisode.name}`
                : primaryWatching.media_type ===
                "tv" &&
              (primaryWatching as any)
                .current_season
                ? `Você está na temporada ${(primaryWatching as any).current_season}.`
                : "Esse é o título mais recente que você deixou em andamento.",

            href:
              nextProgressEpisode
                ? `/title/tv/${primaryWatching.tmdb_id}/season/${nextProgressEpisode.season_number}/episode/${nextProgressEpisode.episode_number}`
                : `/title/${primaryWatching.media_type}/${primaryWatching.tmdb_id}`,

            action:
              "Continuar",
          };
        }

        /*
         * 3. Se nada em andamento, puxar a fila.
         */
        if (
          primaryWant
        ) {
          return {
            kind:
              "queue" as const,

            eyebrow:
              "DA SUA FILA",

            title:
              primaryWant.title,

            description:
              `Você ainda tem ${wantCount} ${
                wantCount ===
                1
                  ? "título"
                  : "títulos"
              } esperando na lista Quero assistir.`,

            href:
              `/title/${primaryWant.media_type}/${primaryWant.tmdb_id}`,

            action:
              "Ver título",
          };
        }

        return {
          kind:
            "discover" as const,

          eyebrow:
            "DESCUBRA ALGO NOVO",

          title:
            librarySize >
            0
              ? "Que tal encontrar seu próximo título?"
              : "Comece seu catálogo",

          description:
            librarySize >
            0
              ? "Use o Descobrir, Para você ou deixe a roleta escolher."
              : "Pesquise, descubra e adicione seus primeiros filmes e séries.",

          href:
            "/discover",

          action:
            "Descobrir",
        };
      },
      [
        librarySize,
        nextEvent,
        nextEventDays,
        primaryWatching,
      primaryWant,
      nextProgressEpisode,
        wantCount,
      ]
    );

  /*
   * ==========================================
   * BACKDROP DO HERO
   * ==========================================
   *
   * Reaproveita o backdrop_path que já vem de dentro dos mesmos
   * dados que alimentam o smartAction — nenhum fetch novo.
   */

  const heroBackdropPath =
    smartAction.kind === "calendar"
      ? nextEvent?.backdrop_path || null
      : smartAction.kind === "watching"
        ? (primaryWatching as any)?.backdrop_path || null
        : smartAction.kind === "queue"
          ? (primaryWant as any)?.backdrop_path || null
          : null;

  /*
   * ==========================================
   * VISITANTE
   * ==========================================
   */

  if (
    authReady &&
    !user
  ) {
    return (
      <div className="home-smart">
        <div className="topbar home-topbar">
          <Search />
        </div>

        <section className="home-guest-hero panel">
          <div className="home-guest-icon">
            <Sparkles
              size={28}
            />
          </div>

          <div className="eyebrow">
            MYCATALOG
          </div>

          <h1>
            Seu catálogo começa aqui.
          </h1>

          <p className="muted">
            Organize o que você assiste, acompanhe séries, registre notas e descubra o que vale seu tempo.
          </p>

          {/*
           * V2.1-C — hierarquia de CTA: "Criar conta" primário,
           * "Explorar catálogo" secundário, "Entrar" sem disputar
           * visualmente com os dois (link simples, não um .btn) —
           * continua fácil de achar, só não compete com o CTA
           * principal.
           */}
          <div className="home-guest-actions">
            <Link
              href="/signup"
              className="btn primary"
            >
              <UserPlus
                size={16}
              />

              Criar conta
            </Link>

            <Link
              href="/discover"
              className="btn"
            >
              <Compass
                size={16}
              />

              Explorar catálogo
            </Link>
          </div>

          <Link
            href="/login"
            className="home-guest-login-link"
          >
            <LogIn size={14} />
            Já tem conta? Entrar
          </Link>
        </section>

        {/*
         * V2.1-C — "o que o MyCatalog faz", em 10-20s de leitura.
         * Só recursos que existem de verdade (nenhum item inventado).
         */}
        <section className="section home-guest-features" aria-label="O que o MyCatalog faz">
          <div className="home-guest-feature">
            <div className="home-guest-feature-icon">
              <Tv size={20} />
            </div>
            <h2>Acompanhe</h2>
            <p className="muted">
              Filmes, séries, episódios e temporadas — status, progresso e reassistidas, tudo num só lugar.
            </p>
          </div>

          <div className="home-guest-feature">
            <div className="home-guest-feature-icon">
              <Compass size={20} />
            </div>
            <h2>Descubra</h2>
            <p className="muted">
              Recomendações personalizadas, filtros por gênero e onde assistir, e o MyCatalog AI para sugerir algo na hora.
            </p>
          </div>

          <div className="home-guest-feature">
            <div className="home-guest-feature-icon">
              <BookOpenText size={20} />
            </div>
            <h2>Lembre</h2>
            <p className="muted">
              Notas, Diário, Estatísticas e Retrospectiva do seu ano — e listas para organizar do seu jeito.
            </p>
          </div>
        </section>

        {/*
         * V2.1-C — prévia real (não screenshot), via /api/discover
         * (já público). Degrada graciosamente: erro ou vazio não
         * quebram a Home, só omitem a seção.
         */}
        {trendingGuestState === "pronto" && trendingGuest.length > 0 && (
          <section className="section home-guest-trending" aria-label="Em alta agora">
            <div className="title-section-heading">
              <span>Direto do catálogo</span>
              <h2>Em alta agora</h2>
            </div>

            <CarouselRail className="home-guest-trending-rail">
              {trendingGuest.map((item) => (
                <Link
                  key={`${item.media_type}-${item.id}`}
                  href={`/title/${item.media_type}/${item.id}`}
                  className="home-guest-trending-item"
                >
                  <div className="poster">
                    <Poster
                      path={item.poster_path}
                      alt=""
                      sizes="150px"
                    />
                  </div>
                  <span>{item.title || item.name}</span>
                </Link>
              ))}
            </CarouselRail>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="home-smart">
      {/* ====================================== */}
      {/* TOPO */}
      {/* ====================================== */}

      <div className="topbar home-topbar">
        <Search />

        <div className="home-top-actions">
          <PickForMe />

          <Link
            href="/calendar"
            className="btn"
          >
            <CalendarDays
              size={15}
            />

            Calendário
          </Link>
        </div>
      </div>

      {/* ====================================== */}
      {/* SAUDAÇÃO */}
      {/* ====================================== */}

      <section className="section home-smart-intro">
        <div>
          <div className="eyebrow">
            SUA HOME
          </div>

          <h1>
            {user?.name
              ? `Olá, ${user.name.split(" ")[0]}.`
              : "Sua Home."}
          </h1>

          <p className="muted">
            Aqui fica só o que merece sua atenção agora.
          </p>
        </div>

        {!loading &&
          librarySize >
            0 && (
          <div className="home-smart-summary">
            <span>
              <strong>
                {
                  librarySize
                }
              </strong>
              na biblioteca
            </span>

            <span>
              <strong>
                {
                  watchingCount
                }
              </strong>
              em andamento
            </span>

            <span>
              <strong>
                {
                  calendar.length
                }
              </strong>
              próximos
            </span>
          </div>
        )}
      </section>

      {/* ====================================== */}
      {/* O QUE IMPORTA AGORA */}
      {/* ====================================== */}

      <section className="section">
        <div
          className={
            `home-focus-card mc-home-hero ${heroBackdropPath ? "mc-home-hero--photo" : ""} panel home-focus-${smartAction.kind}`
          }
        >
          {heroBackdropPath && (
            <div className="mc-home-hero-backdrop">
              <Poster
                path={heroBackdropPath}
                alt=""
                sizes="(max-width:760px) 100vw, 1100px"
                tmdbSize="w1280"
              />
              <div className="mc-home-hero-scrim" />
            </div>
          )}

          <div className="home-focus-icon mc-home-hero-layer">
            {smartAction.kind ===
            "calendar" ? (
              <CalendarDays
                size={23}
              />
            ) : smartAction.kind ===
              "watching" ? (
              <Play
                size={23}
              />
            ) : smartAction.kind ===
              "queue" ? (
              <Clock
                size={23}
              />
            ) : (
              <Sparkles
                size={23}
              />
            )}
          </div>

          <div className="home-focus-copy mc-home-hero-layer">
            <div className="eyebrow">
              {
                smartAction.eyebrow
              }
            </div>

            <h2>
              {
                smartAction.title
              }
            </h2>

            <p>
              {
                smartAction.description
              }
            </p>

            <div className="home-focus-actions">
              <Link
                href={
                  smartAction.href
                }
                className="btn primary"
              >
                {smartAction.kind ===
                "watching" ? (
                  <Play
                    size={15}
                  />
                ) : (
                  <ArrowRight
                    size={15}
                  />
                )}

                {
                  smartAction.action
                }
              </Link>

              {smartAction.kind !==
                "discover" && (
                <Link
                  href="/discover"
                  className="btn"
                >
                  <Compass
                    size={15}
                  />

                  Quero outra coisa
                </Link>
              )}
            </div>
          </div>

          <div className="home-focus-side mc-home-hero-layer">
            {calendarLoading ||
            loading ? (
              <Loader2
                size={20}
                className="spin"
              />
            ) : nextEvent ? (
              <>
                <span>
                  Próximo na agenda
                </span>

                <strong>
                  {relativeDate(
                    nextEvent.date
                  )}
                </strong>

                <small>
                  {
                    nextEvent.title
                  }
                </small>
              </>
            ) : (
              <>
                <span>
                  Seu progresso
                </span>

                <strong>
                  {
                    progress
                  }%
                </strong>

                <small>
                  {watched} concluídos
                </small>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ====================================== */}
      {/* ATALHOS */}
      {/* ====================================== */}

      <section className="section home-shortcuts smart">
        <QuickLink
          href="/library?status=watching"
          icon={
            <Play
              size={18}
            />
          }
          label="Em andamento"
          value={
            watchingCount
          }
        />

        <QuickLink
          href="/library?status=want"
          icon={
            <Clock
              size={18}
            />
          }
          label="Quero assistir"
          value={
            wantCount
          }
        />

        <QuickLink
          href="/favorites"
          icon={
            <Heart
              size={18}
            />
          }
          label="Curtidos"
          value={
            favorites
          }
        />

        <QuickLink
          href="/ranking"
          icon={
            <Star
              size={18}
            />
          }
          label="Avaliados"
          value={
            ratedCount
          }
        />

        <QuickLink
          href="/for-you"
          icon={
            <Sparkles
              size={18}
            />
          }
          label="Para você"
          value="→"
        />
      </section>

      {/* ====================================== */}
      {/* CONTINUAR ASSISTINDO */}
      {/* ====================================== */}

      {watching.length >
        0 && (
        <LibrarySection
          eyebrow="RETOMAR"
          title="Continuar assistindo"
          description="Os títulos que você deixou em andamento, mais recentes primeiro."
          href="/library?status=watching"
          items={
            watching
          }
        />
      )}

      {/* ====================================== */}
      {/* AGENDA DA SEMANA */}
      {/* ====================================== */}

      {(calendarLoading ||
        calendar.length >
          0) && (
        <section className="section">
          <SectionHead
            eyebrow="AGENDA"
            title="O que está chegando"
            description="Episódios, temporadas e lançamentos da sua biblioteca."
            href="/calendar"
            linkLabel="Ver calendário"
          />

          {calendarLoading ? (
            <div className="home-agenda-grid">
              {[1, 2, 3].map(
                (
                  item
                ) => (
                  <div
                    key={
                      item
                    }
                    className="panel home-agenda-skeleton"
                  />
                )
              )}
            </div>
          ) : (
            <div className="home-agenda-grid">
              {calendar
                .slice(
                  0,
                  6
                )
                .map(
                  (
                    event
                  ) => (
                    <Link
                      key={[
                        event.media_type,
                        event.tmdb_id,
                        event.event_type,
                        event.date,
                        event.season_number,
                        event.episode_number,
                      ].join(
                        "-"
                      )}
                      href={`/title/${event.media_type}/${event.tmdb_id}`}
                      className="panel home-agenda-card"
                    >
                      <div
                        className={
                          "home-agenda-when " +
                          (
                            (
                              daysUntil(
                                event.date
                              ) ??
                              99
                            ) <=
                            1
                              ? "urgent"
                              : ""
                          )
                        }
                      >
                        <CalendarDays
                          size={14}
                        />

                        {relativeDate(
                          event.date
                        )}
                      </div>

                      <div className="home-agenda-type">
                        {event.media_type ===
                        "tv" ? (
                          <Tv
                            size={13}
                          />
                        ) : (
                          <Film
                            size={13}
                          />
                        )}

                        {calendarEventLabel(
                          event
                        )}
                      </div>

                      <strong>
                        {
                          event.title
                        }
                      </strong>

                      {event.episode_name && (
                        <span>
                          {
                            event.episode_name
                          }
                        </span>
                      )}

                      <ArrowRight
                        size={14}
                      />
                    </Link>
                  )
                )}
            </div>
          )}
        </section>
      )}

      {/* ====================================== */}
      {/* PARA VOCÊ / DESCOBRIR */}
      {/* ====================================== */}

      <section className="section">
        <div className="home-discovery-grid">
          <Link
            href="/for-you"
            className="panel home-discovery-card featured"
          >
            <div>
              <span className="home-discovery-icon">
                <Sparkles
                  size={20}
                />
              </span>

              <div className="eyebrow">
                PERSONALIZADO
              </div>

              <h2>
                Para você
              </h2>

              <p>
                Recomendações aprendidas a partir das suas notas, curtidos e histórico.
              </p>
            </div>

            <span className="home-discovery-cta">
              Abrir recomendações
              <ArrowRight
                size={14}
              />
            </span>
          </Link>

          <Link
            href="/discover"
            className="panel home-discovery-card"
          >
            <div>
              <span className="home-discovery-icon">
                <Compass
                  size={20}
                />
              </span>

              <div className="eyebrow">
                EXPLORAR
              </div>

              <h2>
                Descobrir
              </h2>

              <p>
                Navegue por gênero, streaming, país, nota e outros filtros.
              </p>
            </div>

            <span className="home-discovery-cta">
              Explorar
              <ArrowRight
                size={14}
              />
            </span>
          </Link>
        </div>
      </section>

      {/* ====================================== */}
      {/* ATIVIDADE + RESUMO */}
      {/* ====================================== */}

      <section className="section home-two-columns">
        <div>
          <SectionHead
            eyebrow="DIÁRIO"
            title="Atividade recente"
            href="/diary"
            linkLabel="Ver diário"
          />

          <div className="panel home-activity-panel">
            {activityLoading ? (
              <div className="home-inline-loading">
                <Loader2
                  size={17}
                  className="spin"
                />

                Carregando atividade...
              </div>
            ) : activity.length >
              0 ? (
              activity.map(
                (
                  event
                ) => {
                  const href =
                    event.media
                      ?.tmdb_id &&
                    event.media
                      ?.media_type
                      ? `/title/${event.media.media_type}/${event.media.tmdb_id}`
                      : "/diary";

                  return (
                    <Link
                      key={
                        event.id
                      }
                      href={
                        href
                      }
                      className="home-activity-item"
                    >
                      <span className="home-activity-dot" />

                      <div>
                        <strong>
                          {activityLabel(
                            event
                          )}
                        </strong>

                        <small>
                          {formatActivityDate(
                            event.occurred_at
                          )}
                        </small>
                      </div>

                      <ArrowRight
                        size={14}
                      />
                    </Link>
                  );
                }
              )
            ) : (
              <div className="home-mini-empty">
                <BookOpenText
                  size={21}
                />

                <span>
                  Sua atividade vai aparecer aqui.
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          <SectionHead
            eyebrow="RESUMO"
            title="Seu catálogo agora"
            href="/stats"
            linkLabel="Estatísticas"
          />

          <div className="home-overview-card panel">
            <OverviewStat
              label="Biblioteca"
              value={
                loading
                  ? "—"
                  : librarySize
              }
              icon={
                <Library
                  size={17}
                />
              }
            />

            <OverviewStat
              label="Concluídos"
              value={
                loading
                  ? "—"
                  : watched
              }
              icon={
                <Check
                  size={17}
                />
              }
            />

            <OverviewStat
              label="Nota média"
              value={
                loading
                  ? "—"
                  : averageRating
              }
              icon={
                <Star
                  size={17}
                />
              }
            />

            <div className="home-overview-progress">
              <div>
                <span>
                  Progresso
                </span>

                <strong>
                  {
                    progress
                  }%
                </strong>
              </div>

              <div className="home-progress-bar">
                <span
                  style={{
                    width:
                      `${Math.min(
                        100,
                        progress
                      )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================== */}
      {/* FILA */}
      {/* ====================================== */}

      {want.length >
        0 && (
        <LibrarySection
          eyebrow="SUA FILA"
          title="Quero assistir"
          description="Algumas opções que já estão esperando por você."
          href="/library?status=want"
          items={
            want
          }
        />
      )}

      {/* ====================================== */}
      {/* MELHORES */}
      {/* ====================================== */}

      {best.length >
        0 && (
        <LibrarySection
          eyebrow="SEUS FAVORITOS DE NOTA"
          title="Melhores avaliados"
          description="O topo do seu gosto até agora."
          href="/ranking"
          items={
            best
          }
        />
      )}

      {/* ====================================== */}
      {/* RECENTES */}
      {/* ====================================== */}

      {recent.length >
        0 && (
        <LibrarySection
          eyebrow="BIBLIOTECA"
          title="Adicionados recentemente"
          href="/library"
          items={
            recent
          }
        />
      )}

      {/* ====================================== */}
      {/* VAZIO */}
      {/* ====================================== */}

      {!loading &&
        librarySize ===
          0 && (
        <section className="section">
          <div className="panel home-empty-state">
            <Library
              size={35}
            />

            <div>
              <h2>
                Sua biblioteca ainda está vazia.
              </h2>

              <p className="muted">
                Comece procurando um título ou explore o Descobrir.
              </p>
            </div>

            <Link
              href="/discover"
              className="btn primary"
            >
              <Compass
                size={16}
              />

              Descobrir títulos
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  value,
}: {
  href:
    string;

  icon:
    React.ReactNode;

  label:
    string;

  value:
    number |
    string;
}) {
  return (
    <Link
      href={
        href
      }
      className="panel home-quick-link"
    >
      <span className="home-quick-icon">
        {
          icon
        }
      </span>

      <div>
        <span>
          {
            label
          }
        </span>

        <strong>
          {
            value
          }
        </strong>
      </div>

      <ArrowRight
        size={14}
      />
    </Link>
  );
}

function SectionHead({
  eyebrow,
  title,
  description,
  href,
  linkLabel =
    "Ver todos",
}: {
  eyebrow:
    string;

  title:
    string;

  description?:
    string;

  href:
    string;

  linkLabel?:
    string;
}) {
  return (
    <div className="section-head home-section-head">
      <div>
        <div className="eyebrow">
          {
            eyebrow
          }
        </div>

        <h2>
          {
            title
          }
        </h2>

        {description && (
          <p className="muted">
            {
              description
            }
          </p>
        )}
      </div>

      <Link
        href={
          href
        }
        className="muted home-section-link"
      >
        {
          linkLabel
        }

        <ArrowRight
          size={14}
        />
      </Link>
    </div>
  );
}

function LibrarySection({
  eyebrow,
  title,
  description,
  href,
  items,
}: {
  eyebrow:
    string;

  title:
    string;

  description?:
    string;

  href:
    string;

  items:
    LibraryItem[];
}) {
  return (
    <section className="section">
      <SectionHead
        eyebrow={
          eyebrow
        }
        title={
          title
        }
        description={
          description
        }
        href={
          href
        }
      />

      <PosterGrid
        items={
          items
        }
        carousel
      />
    </section>
  );
}

function OverviewStat({
  label,
  value,
  icon,
}: {
  label:
    string;

  value:
    number |
    string;

  icon:
    React.ReactNode;
}) {
  return (
    <div className="home-overview-stat">
      <span>
        {
          icon
        }
      </span>

      <div>
        <small>
          {
            label
          }
        </small>

        <strong>
          {
            value
          }
        </strong>
      </div>
    </div>
  );
}
