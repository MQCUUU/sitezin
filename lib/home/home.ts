import type { CalendarEvent } from "../calendar/types";
import type { LibraryProgress } from "../library/progress";
import type { TvProgress } from "../tv-progress";

/*
 * Home V3.0 — regras de apresentação, PURAS (sem rede/banco/React; testadas em
 * scripts/test-home.mjs). A Home não tem domínio próprio de progresso, agenda
 * ou diário: recebe o que a Biblioteca (library_progress), o Calendário
 * (CalendarEvent) e o Diário (DiaryMoment) já calcularam e só decide O QUE
 * mostrar e EM QUE ORDEM.
 */

export type HomeItem = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  status: string;
  runtime?: number | null;
  backdrop_path?: string | null;
  personal_rating?: number | null;
  /** Contagem global (episódios exibidos) — mesma fonte de library_progress. */
  progress?: TvProgress | null;
  library_progress?: LibraryProgress | null;
  episode_runtime?: number | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const code = (next: { season: number; episode: number }) => `T${next.season}:E${pad(next.episode)}`;

/* ------------------------------------------------------------------ Hero */

/**
 * Há algo a fazer AGORA com este título ativo?
 *  - filme Assistindo: sim (o produto não rastreia minutos — continuar é o filme);
 *  - Reassistindo: sim (o progresso da nova passada não é por episódio);
 *  - série com próximo episódio exibido, ainda não começada, sem estrutura
 *    conhecida ou legado: sim;
 *  - série em dia (nada exibido para ver) ou concluída: não.
 */
export function isActionable(item: HomeItem) {
  if (item.media_type === "movie" || item.status === "rewatching") return true;

  const state = item.library_progress?.state;

  return state !== "caught_up" && state !== "completed";
}

/**
 * Título do destaque "Continue de onde parou". `active` já chega na ordem da
 * última atividade (desempate por id, no SQL — ver /api/home). Ganha o
 * primeiro com algo a fazer agora; se nenhum tiver, o mais recente.
 */
export function pickHeroItem<T extends HomeItem>(active: T[]): T | null {
  return active.find(isActionable) ?? active[0] ?? null;
}

export function formatRuntime(minutes: number | null | undefined) {
  const m = Number(minutes);

  if (!Number.isFinite(m) || m <= 0) return null;

  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);

  return h ? (rest ? `${h}h ${pad(rest)}min` : `${h}h`) : `${rest} min`;
}

export type HeroBar = { percent: number; label: string };

export type ActiveHero = {
  eyebrow: string;
  description: string;
  href: string;
  action: string;
  /** Linha de contexto; quando há barra, é exatamente o que a barra mede. */
  meta: string | null;
  bar: HeroBar | null;
};

/** Destaque de um título ativo. Copy de série = a da Biblioteca (library_progress). */
export function activeHero(item: HomeItem): ActiveHero {
  const titleHref = `/title/${item.media_type}/${item.tmdb_id}`;
  const rewatching = item.status === "rewatching";
  const eyebrow = rewatching ? "CONTINUE REASSISTINDO" : isActionable(item) ? "CONTINUE DE ONDE PAROU" : "EM ANDAMENTO";

  if (item.media_type === "movie") {
    const runtime = formatRuntime(item.runtime);

    return {
      eyebrow,
      description: rewatching ? "Você está reassistindo este filme." : "Você marcou este filme como Assistindo.",
      href: titleHref,
      action: "Continuar",
      meta: runtime ? `Filme · ${runtime}` : "Filme",
      bar: null,
    };
  }

  const lp = item.library_progress ?? null;
  const progress = item.progress ?? null;
  const runtime = item.episode_runtime ? ` · ~${item.episode_runtime} min por episódio` : "";
  const episodeHref = (next: { season: number; episode: number }) => `/title/tv/${item.tmdb_id}/season/${next.season}/episode/${next.episode}`;

  // Barra = episódios exibidos assistidos / episódios exibidos (série inteira, sem especiais).
  const globalBar = (): Pick<ActiveHero, "meta" | "bar"> => {
    if (!progress || !progress.total || progress.percent === null) return { meta: null, bar: null };

    const label = `${progress.watched} de ${progress.total} episódios exibidos`;

    return { meta: `${label}${runtime}`, bar: { percent: progress.percent, label } };
  };

  if (!lp) {
    return { eyebrow, description: "Série em andamento.", href: titleHref, action: "Ver série", meta: null, bar: null };
  }

  switch (lp.state) {
    case "in_progress":
      return {
        eyebrow,
        description: lp.next ? `Próximo episódio: ${code(lp.next)}` : lp.title ?? "Série em andamento.",
        href: lp.next ? episodeHref(lp.next) : titleHref,
        action: "Continuar",
        ...globalBar(),
      };
    case "not_started":
      return {
        eyebrow,
        description: lp.next ? `Ainda não começou · começa em ${code(lp.next)}` : "Ainda não começou.",
        href: lp.next ? episodeHref(lp.next) : titleHref,
        action: "Começar",
        ...globalBar(),
      };
    case "rewatching":
      return { eyebrow, description: lp.detail ?? "Reassistindo.", href: titleHref, action: "Continuar", meta: null, bar: null };
    case "caught_up":
    case "completed":
      return { eyebrow, description: `${lp.title}. ${lp.detail ?? ""}`.trim(), href: titleHref, action: "Ver série", meta: null, bar: null };
    default:
      // unknown / legacy: só o fato registrado, sem barra nem próximo inventado.
      return { eyebrow, description: lp.title ?? "Série em andamento.", href: titleHref, action: "Ver série", meta: lp.detail, bar: null };
  }
}

export type HeroKind = "watching" | "calendar" | "queue" | "discover";

/**
 * Ordem do destaque:
 *  1. título ativo com algo a fazer agora;
 *  2. evento da agenda hoje/amanhã/depois de amanhã;
 *  3. título ativo sem nada exibido para ver (em dia/concluída);
 *  4. o último que entrou na fila;
 *  5. descobrir.
 */
export function heroKind(input: { hero: HomeItem | null; urgentEvent: boolean; queue: boolean }): HeroKind {
  if (input.hero && isActionable(input.hero)) return "watching";
  if (input.urgentEvent) return "calendar";
  if (input.hero) return "watching";
  if (input.queue) return "queue";

  return "discover";
}

/* ---------------------------------------------------------------- Agenda */

export const HOME_AGENDA_LIMIT = 6;
export const URGENT_DAYS = 2;

function daysFrom(today: string, day: string) {
  const parse = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

  return Math.round((parse(day) - parse(today)) / 86_400_000);
}

/**
 * Prévia da Agenda a partir dos eventos do Calendário (scope=library):
 * só a partir de hoje (Brasília, data pura), pessoais, ainda não assistidos,
 * sem repetição, em ordem cronológica (mesmo dia: ordem do Calendário).
 * `count` (métrica "próximos") e `preview` saem da MESMA lista.
 */
export function homeAgenda(events: CalendarEvent[], today: string, limit = HOME_AGENDA_LIMIT) {
  const seen = new Set<string>();
  const upcoming = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.date >= today && !event.watched && Boolean(event.relationship))
    .sort((a, b) => (a.event.date === b.event.date ? a.index - b.index : a.event.date < b.event.date ? -1 : 1))
    .map(({ event }) => event)
    .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)));
  const next = upcoming[0] ?? null;

  return {
    count: upcoming.length,
    preview: upcoming.slice(0, limit),
    next,
    nextInDays: next ? daysFrom(today, next.date) : null,
  };
}

/* ------------------------------------------------------------- Métricas */

export type HomeTotals = {
  library: number;
  watching: number;
  want: number;
  /** Assistido + Reassistindo + Reassistido (já terminou ao menos uma vez). */
  watched: number;
  favorites: number;
  rated: number;
  average_rating: number | null;
  /** Tudo que não é Quero assistir. */
  completion_base: number;
  by_status?: Record<string, number>;
};

export type HomeMetric = { key: string; value: string; label: string; hint?: string };

/**
 * Métricas do topo. Nenhuma métrica zerada vira ruído: cada uma só aparece
 * quando tem base. "concluídos" é contagem (não %), para não sugerir uma
 * fração da Biblioteca inteira que a fórmula não mede.
 */
export function homeMetrics(totals: HomeTotals, agenda: { count: number } | null): HomeMetric[] {
  const out: HomeMetric[] = [];

  if (totals.library > 0) out.push({ key: "library", value: String(totals.library), label: totals.library === 1 ? "título" : "títulos" });

  if (totals.watched > 0) {
    out.push({
      key: "watched",
      value: String(totals.watched),
      label: totals.watched === 1 ? "concluído" : "concluídos",
      hint: "Títulos com status Assistido, Reassistindo ou Reassistido",
    });
  }

  if (totals.average_rating !== null && totals.rated > 0) {
    out.push({ key: "rating", value: `★ ${totals.average_rating.toFixed(1)}`, label: "nota média", hint: totals.rated === 1 ? "Sua única nota pessoal" : `Média das suas ${totals.rated} notas pessoais` });
  }

  if (agenda && agenda.count > 0) out.push({ key: "agenda", value: String(agenda.count), label: agenda.count === 1 ? "próximo" : "próximos", hint: "Eventos da sua biblioteca nos próximos 60 dias" });

  return out;
}

/* --------------------------------------------------------- Cards-resumo */

export type SummaryKey = "watching" | "want" | "favorites" | "rated";

/** Só os cards com conteúdo (um "0" não leva a lugar nenhum). Dimensões ortogonais: nunca somadas. */
export function summaryCards(totals: Pick<HomeTotals, SummaryKey>): SummaryKey[] {
  return (["watching", "want", "favorites", "rated"] as SummaryKey[]).filter((key) => totals[key] > 0);
}

/**
 * Linha do card "Em andamento": o que o destaque NÃO está mostrando (o
 * título do Hero já está logo acima — repetir seria redundância).
 */
export function watchingSummaryLine(active: HomeItem[], hero: HomeItem | null): string {
  const others = active.filter((item) => item !== hero);
  const withNext = others.find((item) => item.library_progress?.state === "in_progress" && item.library_progress.next);

  if (withNext?.library_progress?.next) return `${withNext.title} · ${code(withNext.library_progress.next)}`;
  if (others[0]) return `Também: ${others[0].title}`;

  return "Ver na Biblioteca";
}

/* ------------------------------------------------- Elegibilidade/totais */

/** Status que entram em "Continue de onde parou" e em Retomar. Pausado, Abandonado etc. não. */
export const ACTIVE_STATUSES = ["watching", "rewatching"] as const;

export function isActiveStatus(status: string) {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/* ------------------------------------------------- Última atividade */

/**
 * Fatos de CONTINUIDADE de um título ativo (lidos em lote — lib/home/load.ts).
 * `library_items.updated_at` NÃO entra: ele muda com nota, Curtir, review e
 * sync automático de temporadas, que não são continuar assistindo.
 */
export type ActivityFacts = {
  id: string;
  /** Entrada na Biblioteca — só vale quando não há nenhum fato melhor. */
  added_at: string | Date;
  /** Último episódio marcado (episodes_progress.watched_at). */
  last_episode_at: string | Date | null;
  /** Última visualização registrada (watch_entries.watched_at). */
  last_watch_at: string | Date | null;
  /** Última entrada em Assistindo/Reassistindo (activity_events — ver CONTINUITY_EVENTS). */
  last_continuity_at: string | Date | null;
};

/**
 * Eventos de `activity_events` que contam como continuidade:
 *  - status_changed com `to` = watching | rewatching (transição real; só é
 *    gravado quando o status muda — PATCH e POST /api/library);
 *  - rewatch_started (início de reassistida);
 *  - library_added com `status` = watching | rewatching (entrou já ativo).
 * Nota, Curtir, review e tags não geram evento algum.
 */
export const CONTINUITY_STATUSES = ["watching", "rewatching"] as const;

const time = (value: string | Date | null | undefined) => {
  if (value === null || value === undefined) return null;
  const t = new Date(value).getTime();

  return Number.isFinite(t) ? t : null;
};

/** Mais recente entre episódio, visualização e evento de continuidade; senão a entrada na Biblioteca. */
export function lastActivityOf(facts: ActivityFacts): string {
  const best = [facts.last_episode_at, facts.last_watch_at, facts.last_continuity_at]
    .map(time)
    .filter((t): t is number => t !== null);
  const at = best.length ? Math.max(...best) : time(facts.added_at) ?? 0;

  return new Date(at).toISOString();
}

/** Ordem de "Em andamento": última atividade (desc), desempate por id (desc). */
export function orderActive(facts: ActivityFacts[], limit: number) {
  return facts
    .map((f) => ({ ...f, last_activity_at: lastActivityOf(f) }))
    .sort((a, b) => (a.last_activity_at === b.last_activity_at ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.last_activity_at < b.last_activity_at ? 1 : -1))
    .slice(0, limit);
}

/** Já terminou ao menos uma vez: Assistido, Reassistindo (reassistir pressupõe ter visto) e Reassistido. */
export const COMPLETED_STATUSES = ["watched", "rewatching", "rewatched"] as const;

/**
 * Totais por status (exclusivos: somam a Biblioteca). Curtidos e Avaliados
 * são dimensões ortogonais e NÃO entram aqui.
 *  - watching:        Assistindo + Reassistindo
 *  - watched:         concluídos (COMPLETED_STATUSES)
 *  - completion_base: tudo que não é Quero assistir (o que você já começou)
 */
export function statusTotals(byStatus: Record<string, number>) {
  const n = (key: string) => Number(byStatus[key] || 0);
  const library = Object.values(byStatus).reduce((sum, value) => sum + Number(value || 0), 0);

  return {
    library,
    watching: ACTIVE_STATUSES.reduce((sum, key) => sum + n(key), 0),
    want: n("want"),
    watched: COMPLETED_STATUSES.reduce((sum, key) => sum + n(key), 0),
    completion_base: library - n("want"),
  };
}

/* ------------------------------------------------------------- Seções */

type LoadState = "loading" | "ready" | "error";

/**
 * Quais seções aparecem. Nenhuma seção vazia; carregando mostra esqueleto;
 * a falha de uma fonte só esconde a parte dela.
 */
export function homeSections(input: {
  homeState: LoadState;
  agendaState: LoadState;
  activityState: LoadState;
  totals: Pick<HomeTotals, "library">;
  watching: number;
  want: number;
  best: number;
  kind: HeroKind;
  agendaCount: number;
  moments: number;
}) {
  const ready = input.homeState === "ready";
  const skeleton = input.homeState === "loading";

  return {
    skeleton,
    error: input.homeState === "error",
    hero: ready,
    empty: ready && input.totals.library === 0,
    // Um único ativo que já é o destaque: Retomar repetiria o destaque.
    resume: ready && input.watching > 0 && !(input.watching === 1 && input.kind === "watching"),
    agenda: !skeleton && (input.agendaState === "loading" || (input.agendaState === "ready" && input.agendaCount > 0)),
    activity: !skeleton && (input.activityState === "loading" || (input.activityState === "ready" && input.moments > 0)),
    summary: ready && input.totals.library > 0,
    queue: ready && input.want > 0,
    best: ready && input.best > 0,
  };
}
