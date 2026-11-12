"use client";

import "@/styles/features/home-smart.css";
import { getLibraryVersion } from "@/lib/library-cache";
import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { Poster } from "@/components/Poster";
import { ConnectedPosterActions } from "@/components/media/ConnectedPosterActions";
import { CarouselRail } from "@/components/CarouselRail";
import { PosterGrid } from "@/components/PosterGrid";
import { ErrorState } from "@/components/AsyncState";
import { authClient } from "@/lib/auth/client";
import { HomeSkeleton } from "@/components/home/HomeParts";
import { HomeFeature } from "@/components/home/HomeFeature";
import { ProjectionProvider } from "@/components/screen/ProjectionProvider";
import { HomeRows, HomeSection, type HomeRow } from "@/components/home/HomeSections";
import { FriendsRail } from "@/components/home/FriendsRail";
import { detailLabel, personalLine, typeLabel } from "@/components/calendar/copy";
import { dayHeading, relativeWhen } from "@/lib/calendar/dates";
import { detail as momentDetail, formatRating, headline, momentAria } from "@/lib/diary/copy";
import {
  activeHero,
  heroKind,
  homeSections,
  homeAgenda,
  pickHeroItem,
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

  const { watching, want, best, totals } = homeData;
  const librarySize = totals.library;

  const agendaView = useMemo(() => (agenda ? homeAgenda(agenda.events, agenda.today) : null), [agenda]);
  const agendaToday = agenda?.today ?? "";
  const nextEvent = agendaView?.next ?? null;

  const heroItem = useMemo(() => pickHeroItem(watching), [watching]);
  const urgentEvent = Boolean(nextEvent && agendaView?.nextInDays !== null && (agendaView?.nextInDays ?? 99) <= URGENT_DAYS);
  const kind = heroKind({ hero: heroItem, urgentEvent, queue: want.length > 0 });

  const hero = useMemo(() => {
    if (kind === "watching" && heroItem) {
      return { ...activeHero(heroItem), title: heroItem.title, backdrop: heroItem.backdrop_path || null };
    }

    if (kind === "calendar" && nextEvent) {
      const days = agendaView?.nextInDays ?? 0;
      const extra = detailLabel(nextEvent);

      return {
        eyebrow: days === 0 ? "É hoje" : days === 1 ? "É amanhã" : "Está chegando",
        title: nextEvent.title,
        description: `${typeLabel(nextEvent)}${extra ? `, ${extra}` : ""}`,
        href: `/title/${nextEvent.media_type}/${nextEvent.tmdb_id}`,
        action: "Ver lançamento",
        meta: personalLine(nextEvent),
        bar: null,
        backdrop: nextEvent.backdrop_path || null,
      };
    }

    if (kind === "queue" && want[0]) {
      return {
        eyebrow: "Da sua fila",
        title: want[0].title,
        description:
          totals.want === 1
            ? "O único título na sua lista Quero assistir."
            : `O último a entrar na sua lista Quero assistir, com ${totals.want} títulos esperando.`,
        href: `/title/${want[0].media_type}/${want[0].tmdb_id}`,
        action: "Ver título",
        meta: null,
        bar: null,
        backdrop: want[0].backdrop_path || null,
      };
    }

    return {
      eyebrow: "Descubra algo novo",
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

  /* ------------------------------------------- sessão ainda carregando */

  /*
   * Fase 1 — "sessão carregando" não é visitante nem autenticado: até a sessão
   * ser conhecida, nenhuma das duas Homes aparece (antes a Home logada piscava
   * para visitantes). Só a busca, comum às duas, e o skeleton do hero/trilho.
   * Os dados pessoais já esperavam a sessão; nada é atrasado depois dela.
   */
  if (!authReady) {
    return (
      // Fase 4 (P2-08): key por variante — a troca neutra → visitante/logada substitui o conteúdo em vez de
      // "mover" o mesmo <section> (o React reaproveitava o nó e o navegador contava um layout shift).
      <div key="home-neutral" className="home-smart" aria-busy="true">

        <section className="section home-session-skeleton">
          <HomeSkeleton />
        </section>
      </div>
    );
  }

  /* ------------------------------------------------------- visitante */

  if (
    !user
  ) {
    return (
      <div key="home-guest" className="home-smart hm-screen">

        {/*
         * Fase 4 — visitante: título grande, uma frase e UMA ação clara (Criar
         * conta). "Entrar" fica só no topo (antes repetia aqui embaixo).
         */}
        <section className="hm-guest" aria-labelledby="hm-guest-title">
          <h1 id="hm-guest-title" className="hm-feature-title">Seu catálogo começa aqui.</h1>
          <p className="hm-feature-text">
            Organize o que você assiste, acompanhe séries episódio por episódio, dê notas e descubra o que vale seu tempo.
          </p>
          <div className="hm-feature-actions">
            <Link href="/signup" className="btn primary hm-action">
              Criar conta
            </Link>
            <Link href="/discover" className="btn hm-action hm-action--quiet">
              Explorar o catálogo
            </Link>
          </div>
        </section>

        {/* Só recursos que existem de verdade, em três frases curtas. */}
        <section className="hm-guest-features" aria-label="O que o MyCatalog faz">
          <div>
            <h2>Acompanhe</h2>
            <p>Filmes e séries com status e progresso por episódio, tudo num só lugar.</p>
          </div>
          <div>
            <h2>Descubra</h2>
            <p>Recomendações pelo seu gosto, filtros por gênero e por onde assistir, e o assistente para sugerir algo na hora.</p>
          </div>
          <div>
            <h2>Lembre</h2>
            <p>Notas, diário, estatísticas e a retrospectiva do seu ano, além de listas do seu jeito.</p>
          </div>
        </section>

        {/*
         * V2.1-C — prévia real (não screenshot), via /api/discover
         * (já público). Degrada graciosamente: erro ou vazio não
         * quebram a Home, só omitem a seção.
         */}
        {trendingGuestState === "pronto" && trendingGuest.length > 0 && (
          <HomeSection id="hm-trending" title="Em alta agora" href="/discover" linkLabel="Ver mais no Descobrir" className="home-guest-trending">
            <CarouselRail className="home-guest-trending-rail">
              {trendingGuest.map((item) => (
                <div key={`${item.media_type}-${item.id}`} className="home-guest-trending-item">
                  <div className="poster mc-pa-host">
                    <Link href={`/title/${item.media_type}/${item.id}`} tabIndex={-1} aria-hidden="true" className="poster-link">
                      <Poster
                        path={item.poster_path}
                        alt=""
                        sizes="150px"
                      />
                    </Link>
                    <ConnectedPosterActions
                      media={{ tmdbId: Number(item.id), mediaType: item.media_type === "tv" ? "tv" : "movie", title: item.title || item.name || "Sem título", posterPath: item.poster_path }}
                    />
                  </div>
                  <Link href={`/title/${item.media_type}/${item.id}`} className="home-guest-trending-name">
                    {item.title || item.name}
                  </Link>
                </div>
              ))}
            </CarouselRail>
          </HomeSection>
        )}
      </div>
    );
  }

  /* -------------------------------------------------- autenticado */

  /*
   * Fase 4 — Início na direção "Tela 2.39:1": o destaque (faixa + título +
   * uma ação), pôsteres do que está em andamento e da fila, e duas colunas em
   * texto (agenda e diário). Saíram a saudação com métricas, o resumo, os
   * "Melhores avaliados" (estão no Ranking) e a animação de seções ao rolar.
   */
  const agendaRows: HomeRow[] = (agendaView?.preview ?? []).map((event) => {
    const extra = detailLabel(event);
    return {
      key: event.id,
      href: `/title/${event.media_type}/${event.tmdb_id}`,
      when: relativeWhen(event.date, agendaToday),
      title: event.title,
      what: `, ${lowerFirst(typeLabel(event))}${extra ? ` (${extra})` : ""}`,
    };
  });

  const diaryRows: HomeRow[] = moments.slice(0, 5).map((moment) => {
    const extra = momentDetail(moment);
    const rating = moment.rating !== null ? ` e deu nota ${formatRating(moment.rating)}` : "";
    return {
      key: moment.id,
      href: moment.media ? `/title/${moment.media.media_type}/${moment.media.tmdb_id}` : "/diary",
      when: dayHeading(moment.day, activity?.today ?? moment.day),
      title: moment.media?.title || "Título não identificado",
      what: `, ${lowerFirst(headline(moment))}${extra ? ` (${lowerFirst(extra)})` : ""}${rating}`,
      ariaLabel: momentAria(moment),
    };
  });

  const featureSecondary =
    kind === "watching" && heroItem && hero.href !== `/title/${heroItem.media_type}/${heroItem.tmdb_id}`
      ? { href: `/title/${heroItem.media_type}/${heroItem.tmdb_id}`, label: heroItem.media_type === "tv" ? "Abrir a série" : "Abrir o filme" }
      : kind !== "discover"
        ? { href: "/discover", label: "Quero outra coisa" }
        : librarySize === 0
          ? { href: "/search", label: "Buscar o que já assisti" }
          : null;

  return (
    <ProjectionProvider>
    <div key="home-auth" className="home-smart hm-screen">
      {show.skeleton ? (
        <HomeSkeleton />
      ) : show.error ? (
        <section className="section">
          <ErrorState
            compact
            title="Não foi possível carregar seu Início"
            description="Sua biblioteca não respondeu agora. A agenda e o diário abaixo continuam disponíveis."
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        </section>
      ) : (
        <HomeFeature
          lead={hero.eyebrow}
          title={hero.title}
          description={hero.description}
          href={hero.href}
          action={hero.action}
          backdropPath={hero.backdrop}
          meta={hero.meta}
          bar={hero.bar}
          secondary={featureSecondary}
        />
      )}

      {show.resume && (
        <HomeSection id="hm-resume" title="Continuar assistindo" href="/library?status=watching" linkLabel="Ver todos">
          <PosterGrid items={watching} carousel />
        </HomeSection>
      )}

      {/* Indicações (0010): só com indicações pendentes de amigos. */}
      <FriendsRail />

      {show.queue && (
        <HomeSection id="hm-queue" title="Na sua fila" href="/watchlist" linkLabel="Ver a fila inteira">
          <PosterGrid items={want} carousel />
        </HomeSection>
      )}

      {(show.agenda || show.activity) && (
        <div className="hm-columns">
          {show.agenda && (
            <HomeSection id="hm-week" title="O que está chegando" href="/calendar" linkLabel="Abrir o calendário">
              <HomeRows rows={agendaRows} loading={agendaState === "loading"} loadingLabel="Carregando agenda" />
            </HomeSection>
          )}

          {show.activity && (
            <HomeSection id="hm-diary" title="No seu diário" href="/diary" linkLabel="Abrir o diário">
              <HomeRows rows={diaryRows} loading={activityState === "loading"} loadingLabel="Carregando diário" />
            </HomeSection>
          )}
        </div>
      )}
    </div>
    </ProjectionProvider>
  );
}

function lowerFirst(text: string) {
  return text ? text.charAt(0).toLocaleLowerCase("pt-BR") + text.slice(1) : text;
}

