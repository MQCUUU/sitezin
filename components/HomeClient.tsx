"use client";

import { getLibraryVersion } from "@/lib/library-cache";
import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Compass,
  Film,
  LogIn,
  Sparkles,
  Tv,
  UserPlus,
} from "lucide-react";

import { Search } from "@/components/Search";
import { Poster } from "@/components/Poster";
import { CarouselRail } from "@/components/CarouselRail";
import { PosterGrid } from "@/components/PosterGrid";
import { PickForMe } from "@/components/PickForMe";
import { ErrorState } from "@/components/AsyncState";
import { authClient } from "@/lib/auth/client";
import { Reveal } from "@/components/ui/premium";
import { HomeEmpty, HomeHero, HomeSkeleton, SummaryStrip } from "@/components/home/HomeParts";
import { detailLabel, personalLine, typeLabel } from "@/components/calendar/copy";
import { dayHeading, daysBetween, relativeWhen } from "@/lib/calendar/dates";
import { detail as momentDetail, formatRating, headline, momentAria } from "@/lib/diary/copy";
import {
  activeHero,
  heroKind,
  homeSections,
  homeAgenda,
  homeMetrics,
  pickHeroItem,
  summaryCards,
  watchingSummaryLine,
  URGENT_DAYS,
  type HomeTotals,
} from "@/lib/home/home";

import type { CalendarEvent, CalendarResponse } from "@/lib/calendar/types";
import type { DiaryMoment } from "@/lib/diary/types";
import type { LibraryItem } from "@/lib/types";

type UserSummary = {
  name: string;
  email: string;
};

/*
 * Home V3.0 — central pessoal: o que continuar agora, o que mais está em
 * andamento, o que está chegando, o que aconteceu e o estado da Biblioteca.
 * Três fontes independentes (uma falha não derruba as outras):
 *   GET /api/home               totais + prateleiras (progresso = Biblioteca)
 *   GET /api/calendar/events    Agenda (domínio do Calendário V2.4)
 *   GET /api/diary/recent       Atividade (momentos do Diário V2.5)
 * Regras de seleção/ordem/visibilidade: lib/home/home.ts (puro, testado).
 */

type HomeData = {
  totals: HomeTotals;
  watching: LibraryItem[];
  want: LibraryItem[];
  best: LibraryItem[];
  liked: LibraryItem[];
};

type AgendaData = { today: string; events: CalendarEvent[] };
type ActivityData = { today: string; moments: DiaryMoment[] };
type LoadState = "loading" | "ready" | "error";

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
  liked: [],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenHomeItem(item: any): LibraryItem {
  return {
    ...item,
    library_id: item.id,
    ...item.media,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeHomeData(raw: any): HomeData {
  const shelf = (value: unknown): LibraryItem[] => (Array.isArray(value) ? value.map(flattenHomeItem) : []);

  return {
    totals: { ...EMPTY_HOME_DATA.totals, ...(raw?.totals || {}) },
    watching: shelf(raw?.watching),
    want: shelf(raw?.want),
    best: shelf(raw?.best),
    liked: shelf(raw?.liked),
  };
}

/*
 * Valida o formato ANTES de usar (resposta da API OU cache de
 * sessionStorage) — um cache antigo/incompatível nunca quebra a Home.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isHomeData(value: any): value is HomeData {
  return (
    value &&
    typeof value === "object" &&
    value.totals &&
    typeof value.totals.library === "number" &&
    Array.isArray(value.watching) &&
    Array.isArray(value.want) &&
    Array.isArray(value.best) &&
    Array.isArray(value.liked)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAgendaData(value: any): value is AgendaData {
  return value && typeof value.today === "string" && Array.isArray(value.events) && value.events.every((e: CalendarEvent) => typeof e?.id === "string" && typeof e?.date === "string");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isActivityData(value: any): value is ActivityData {
  return value && typeof value.today === "string" && Array.isArray(value.moments) && value.moments.every((m: DiaryMoment) => typeof m?.id === "string" && typeof m?.kind === "string");
}

const HOME_CACHE_VERSION = "v5";
const HOME_CACHE_TTL = 5 * 60 * 1000;

async function getJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const result = await response.json().catch(() => null);

  if (response.status === 401) return { unauthorized: true as const, result: null };
  if (!response.ok) throw new Error(result?.error || `Falha ao carregar ${url}`);

  return { unauthorized: false as const, result };
}

export default function HomeClient() {
  const [homeData, setHomeData] = useState<HomeData>(EMPTY_HOME_DATA);
  const [homeState, setHomeState] = useState<LoadState>("loading");
  const [agenda, setAgenda] = useState<AgendaData | null>(null);
  const [agendaState, setAgendaState] = useState<LoadState>("loading");
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [activityState, setActivityState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [user, setUser] = useState<UserSummary | null>(null);

  /*
   * V2.1-C — "Em alta agora" na Home de visitante. Reaproveita
   * /api/discover (já público) em vez de duplicar lógica do Discover.
   * Só busca quando o guest branch é o que vai renderizar.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trendingGuest, setTrendingGuest] = useState<any[]>([]);
  const [trendingGuestState, setTrendingGuestState] = useState<"carregando" | "erro" | "pronto">("carregando");
  const [authReady, setAuthReady] = useState(false);

  /* ---------------------------------------------------------- conta */

  useEffect(() => {
    let mounted = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authClient.getSession().then(({ data }: { data: any }) => {
      if (!mounted) return;

      const current = data?.user;

      if (current) {
        const name = current.name || current.email?.split("@")[0] || "você";

        setUser({ name, email: current.email || "" });
      } else {
        setUser(null);
      }

      setAuthReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  /* ---------------------------------------------------------- dados */

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setHomeData(EMPTY_HOME_DATA);
      setAgenda(null);
      setActivity(null);
      setHomeState("ready");
      setAgendaState("ready");
      setActivityState("ready");
      return;
    }

    let cancelled = false;
    const cacheKey = `mycatalog:home:${HOME_CACHE_VERSION}:${user.email}`;
    let cachedHome = false;
    let cachedAgenda = false;
    let cachedActivity = false;

    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");

      if (
        cached &&
        Date.now() - cached.savedAt < HOME_CACHE_TTL &&
        // Não pinta estado que já se sabe desatualizado (mutação em outra tela).
        (cached.version ?? 0) === getLibraryVersion()
      ) {
        cachedHome = isHomeData(cached.home);
        cachedAgenda = isAgendaData(cached.agenda);
        cachedActivity = isActivityData(cached.activity);

        if (cachedHome) {
          setHomeData(cached.home);
          setHomeState("ready");
        }

        if (cachedAgenda) {
          setAgenda(cached.agenda);
          setAgendaState("ready");
        }

        if (cachedActivity) {
          setActivity(cached.activity);
          setActivityState("ready");
        }
      }
    } catch {
      /* cache é apenas uma otimização */
    }

    const versionAtStart = getLibraryVersion();

    function saveCache(partial: Record<string, unknown>) {
      try {
        const current = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");

        sessionStorage.setItem(cacheKey, JSON.stringify({ ...current, ...partial, version: versionAtStart, savedAt: Date.now() }));
      } catch {
        /* storage pode estar indisponível */
      }
    }

    async function loadHome() {
      if (!cachedHome) setHomeState("loading");

      try {
        const { unauthorized, result } = await getJson("/api/home");

        if (unauthorized || cancelled) return;

        const home = normalizeHomeData(result);

        if (!isHomeData(home)) throw new Error("Resposta da Home em formato inesperado.");

        setHomeData(home);
        setHomeState("ready");
        saveCache({ home });
      } catch (error) {
        console.error("Erro ao carregar Home:", error);
        // Com cache válido na tela, mantém o que já está visível.
        if (!cancelled && !cachedHome) setHomeState("error");
      }
    }

    async function loadAgenda() {
      if (!cachedAgenda) setAgendaState("loading");

      try {
        const { unauthorized, result } = await getJson("/api/calendar/events?scope=library");

        if (unauthorized || cancelled) return;

        const body = result as CalendarResponse;

        // Biblioteca indisponível = sem agenda pessoal confiável: não mostra "0 próximos".
        if (body?.partial?.includes("library")) throw new Error("Agenda parcial");

        const next: AgendaData = { today: String(body?.today || ""), events: Array.isArray(body?.events) ? body.events : [] };

        if (!isAgendaData(next)) throw new Error("Resposta da agenda em formato inesperado.");

        setAgenda(next);
        setAgendaState("ready");
        saveCache({ agenda: next });
      } catch (error) {
        console.error("Erro ao carregar agenda da Home:", error);
        if (!cancelled && !cachedAgenda) setAgendaState("error");
      }
    }

    async function loadActivity() {
      if (!cachedActivity) setActivityState("loading");

      try {
        const { unauthorized, result } = await getJson("/api/diary/recent");

        if (unauthorized || cancelled) return;

        if (!isActivityData(result)) throw new Error("Resposta da atividade em formato inesperado.");

        setActivity(result);
        setActivityState("ready");
        saveCache({ activity: result });
      } catch (error) {
        console.error("Erro ao carregar atividade da Home:", error);
        if (!cancelled && !cachedActivity) setActivityState("error");
      }
    }

    void Promise.all([loadHome(), loadAgenda(), loadActivity()]);

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.email, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ------------------------------------------------- dados derivados */

  const { watching, want, best, liked, totals } = homeData;
  const homeReady = homeState === "ready";
  const librarySize = totals.library;

  const agendaView = useMemo(() => (agenda ? homeAgenda(agenda.events, agenda.today) : null), [agenda]);
  const agendaToday = agenda?.today ?? "";
  const nextEvent = agendaView?.next ?? null;

  const heroItem = useMemo(() => pickHeroItem(watching), [watching]);
  const urgentEvent = Boolean(nextEvent && agendaView?.nextInDays !== null && (agendaView?.nextInDays ?? 99) <= URGENT_DAYS);
  const kind = heroKind({ hero: heroItem, urgentEvent, queue: want.length > 0 });
  const metrics = homeReady ? homeMetrics(totals, agendaState === "ready" ? agendaView : null) : [];
  const cards = summaryCards(totals);

  const hero = useMemo(() => {
    if (kind === "watching" && heroItem) {
      return { ...activeHero(heroItem), title: heroItem.title, backdrop: heroItem.backdrop_path || null };
    }

    if (kind === "calendar" && nextEvent) {
      const days = agendaView?.nextInDays ?? 0;
      const extra = detailLabel(nextEvent);

      return {
        eyebrow: days === 0 ? "É HOJE" : days === 1 ? "É AMANHÃ" : "ESTÁ CHEGANDO",
        title: nextEvent.title,
        description: `${typeLabel(nextEvent)}${extra ? ` · ${extra}` : ""}`,
        href: `/title/${nextEvent.media_type}/${nextEvent.tmdb_id}`,
        action: "Ver lançamento",
        meta: personalLine(nextEvent),
        bar: null,
        backdrop: nextEvent.backdrop_path || null,
      };
    }

    if (kind === "queue" && want[0]) {
      return {
        eyebrow: "DA SUA FILA",
        title: want[0].title,
        description:
          totals.want === 1
            ? "O único título na sua lista Quero assistir."
            : `O último a entrar na sua lista Quero assistir · ${totals.want} títulos esperando.`,
        href: `/title/${want[0].media_type}/${want[0].tmdb_id}`,
        action: "Ver título",
        meta: null,
        bar: null,
        backdrop: want[0].backdrop_path || null,
      };
    }

    return {
      eyebrow: "DESCUBRA ALGO NOVO",
      title: librarySize > 0 ? "Que tal encontrar seu próximo título?" : "Comece seu catálogo",
      description:
        librarySize > 0
          ? "Use o Descobrir, Para você ou deixe a roleta escolher."
          : "Explore o catálogo e adicione seus primeiros filmes e séries.",
      href: "/discover",
      action: "Descobrir",
      meta: null,
      bar: null,
      backdrop: null,
    };
  }, [kind, heroItem, nextEvent, agendaView, want, totals.want, librarySize]);

  /*
   * Painel ao lado do destaque: o próximo evento da agenda (quando o destaque
   * não é ele mesmo), senão quantos títulos você já concluiu. Nada útil → sem painel.
   */
  const heroSide = useMemo(() => {
    if (agendaState === "loading" && !agenda) return { loading: true, label: "", value: "", small: "" };

    const sideEvent = kind === "calendar" ? agendaView?.preview[1] ?? null : nextEvent;

    if (sideEvent && agendaToday) {
      return { loading: false, label: "Próximo na agenda", value: relativeWhen(sideEvent.date, agendaToday), small: sideEvent.title };
    }

    if (totals.watched > 0) {
      return { loading: false, label: "Concluídos", value: String(totals.watched), small: `de ${totals.completion_base} já iniciados` };
    }

    return null;
  }, [agendaState, agenda, kind, agendaView, nextEvent, agendaToday, totals.watched, totals.completion_base]);

  const moments = activity?.moments ?? [];
  const show = homeSections({
    homeState,
    agendaState,
    activityState,
    totals,
    watching: watching.length,
    want: want.length,
    best: best.length,
    kind,
    agendaCount: agendaView?.preview.length ?? 0,
    moments: moments.length,
  });

  /* ------------------------------------------------------- visitante */

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

  /* -------------------------------------------------- autenticado */

  return (
    <div className="home-smart">
      <div className="topbar home-topbar">
        <Search />

        <div className="home-top-actions">
          <PickForMe />

          <Link href="/calendar" className="btn">
            <CalendarDays size={15} />
            Calendário
          </Link>
        </div>
      </div>

      {/* SAUDAÇÃO + MÉTRICAS */}
      <section className="section home-smart-intro">
        <div>
          <div className="eyebrow">SUA HOME</div>
          <h1>{user?.name ? `Olá, ${user.name.split(" ")[0]}.` : "Sua Home."}</h1>
          <p className="muted">Aqui fica só o que merece sua atenção agora.</p>
        </div>

        {metrics.length > 0 && (
          <div className="home-smart-summary" aria-label="Resumo da sua biblioteca">
            {metrics.map((metric) => (
              <span key={metric.key} title={metric.hint}>
                <strong>{metric.value}</strong>
                {metric.label}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 1. AÇÃO IMEDIATA */}
      {show.skeleton ? (
        <HomeSkeleton />
      ) : show.error ? (
        <section className="section">
          <ErrorState
            compact
            title="Não foi possível carregar sua Home"
            description="Sua biblioteca não respondeu agora. A agenda e a atividade abaixo continuam disponíveis."
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        </section>
      ) : (
        <>
          <section className="section home-hero-section">
            <HomeHero
              kind={kind}
              eyebrow={hero.eyebrow}
              title={hero.title}
              description={hero.description}
              href={hero.href}
              action={hero.action}
              backdropPath={hero.backdrop}
              meta={hero.meta}
              bar={hero.bar}
              side={heroSide}
            />
          </section>

          {show.empty && <HomeEmpty />}
        </>
      )}

      {/* 2. ALTERNATIVAS ATIVAS */}
      {show.resume && (
        <LibrarySection
          eyebrow="RETOMAR"
          title="Continuar assistindo"
          description="Seus títulos em andamento, pela última atividade."
          href="/library?status=watching"
          items={watching}
        />
      )}

      {/* 3. PRÓXIMOS EVENTOS (prévia do Calendário) */}
      {show.agenda && (
        <section className="section">
          <SectionHead
            eyebrow="AGENDA"
            title="O que está chegando"
            description="Episódios, temporadas e estreias da sua biblioteca nos próximos 60 dias."
            href="/calendar"
            linkLabel="Ver calendário"
          />

          {agendaState === "loading" ? (
            <div className="home-agenda-grid" role="status" aria-label="Carregando agenda">
              {[1, 2, 3].map((item) => (
                <div key={item} className="panel home-agenda-skeleton" />
              ))}
            </div>
          ) : (
            <div className="home-agenda-grid">
              {agendaView?.preview.map((event) => {
                const extra = detailLabel(event);
                const personal = personalLine(event);
                const urgent = daysBetween(agendaToday, event.date) <= 1;

                return (
                  <Link
                    key={event.id}
                    href={`/title/${event.media_type}/${event.tmdb_id}`}
                    className="panel home-agenda-card"
                  >
                    <span className="home-agenda-thumb" aria-hidden="true">
                      <Poster path={event.poster_path || event.backdrop_path} alt="" sizes="48px" tmdbSize="w185" />
                    </span>
                    <div className="home-agenda-main">
                      <div className={`home-agenda-when ${urgent ? "urgent" : ""}`}>
                        <CalendarDays size={14} aria-hidden="true" />
                        {relativeWhen(event.date, agendaToday)}
                      </div>

                      <div className="home-agenda-type">
                        {event.media_type === "tv" ? <Tv size={13} aria-hidden="true" /> : <Film size={13} aria-hidden="true" />}
                        {typeLabel(event)}
                        {extra ? ` · ${extra}` : ""}
                      </div>

                      <strong>{event.title}</strong>

                      {personal && <span>{personal}</span>}
                    </div>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 4. CONTEXTO RECENTE (prévia do Diário) */}
      {show.activity && (
        <Reveal as="section" className="section home-two-columns home-activity-section">
          <div>
            <SectionHead eyebrow="DIÁRIO" title="Atividade recente" href="/diary" linkLabel="Ver diário" />

            <div className="panel home-activity-panel">
              {activityState === "loading" ? (
                <div role="status" aria-label="Carregando atividade">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="mc-skeleton home-activity-skeleton" />
                  ))}
                </div>
              ) : (
                moments.map((moment) => {
                  const href = moment.media ? `/title/${moment.media.media_type}/${moment.media.tmdb_id}` : "/diary";
                  const extra = momentDetail(moment);
                  const what = [headline(moment), extra, moment.rating !== null ? `★ ${formatRating(moment.rating)}` : null]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <Link key={moment.id} href={href} className="home-activity-item" aria-label={momentAria(moment)}>
                      <span className="home-activity-dot" aria-hidden="true" />

                      <div>
                        <strong>{moment.media?.title || "Título não identificado"}</strong>
                        <span className="home-activity-what">{what}</span>
                        <small>
                          {dayHeading(moment.day, activity?.today ?? moment.day)}
                          {moment.time ? ` · ${moment.time}` : ""}
                        </small>
                      </div>

                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/* 5. RESUMO DA BIBLIOTECA + BACKLOG */}
      {show.summary && (
        <section className="section home-summary-section" aria-label="Seu resumo">
          <SummaryStrip
            cards={cards}
            watching={watching}
            want={want}
            liked={liked}
            best={best}
            totals={{ watching: totals.watching, want: totals.want, favorites: totals.favorites, rated: totals.rated }}
            watchingLine={watchingSummaryLine(watching, kind === "watching" ? heroItem : null)}
          />
        </section>
      )}

      {show.queue && (
        <LibrarySection
          eyebrow="SUA FILA"
          title="Quero assistir"
          description="O que você já decidiu ver, adicionados por último primeiro."
          href="/library?status=want"
          items={want}
        />
      )}

      {show.best && (
        <LibrarySection
          eyebrow="SUAS NOTAS"
          title="Melhores avaliados"
          description="Suas maiores notas pessoais."
          href="/ranking"
          items={best}
        />
      )}
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  description,
  href,
  linkLabel = "Ver todos",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  href: string;
  linkLabel?: string;
}) {
  return (
    <div className="section-head home-section-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>

      <Link href={href} className="muted home-section-link" aria-label={`${linkLabel}: ${title}`}>
        {linkLabel}
        <ArrowRight size={14} aria-hidden="true" />
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
  eyebrow: string;
  title: string;
  description?: string;
  href: string;
  items: LibraryItem[];
}) {
  return (
    <Reveal as="section" className="section">
      <SectionHead eyebrow={eyebrow} title={title} description={description} href={href} />
      <PosterGrid items={items} carousel />
    </Reveal>
  );
}
