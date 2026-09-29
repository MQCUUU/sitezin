/*
 * V2.1-E — "O que assistir agora?" (Smart Queue).
 *
 * Módulo PURO (sem rede/banco): filtros, elegibilidade, scoring e motivos.
 * Determinístico — mesma entrada, mesma saída (o único aleatório é a
 * escolha "Surpreenda-me", aplicada DEPOIS dos filtros, com RNG injetável).
 * Sem IA. Cada motivo exibido corresponde a um sinal realmente aplicado.
 */
import type { TvProgress } from "@/lib/tv-progress";

export type QueueType = "all" | "movie" | "tv";

export type QueueFilters = {
  /** Tempo disponível em minutos; null = sem limite. */
  minutes: number | null;
  type: QueueType;
  /** Nome do gênero (como em media.genres) ou null. */
  genre: string | null;
  /** Filtro estrito: só títulos comprovadamente nos serviços do usuário. */
  onlyMyServices: boolean;
};

export type QueueCandidate = {
  source: "library" | "discover";
  library_id: string | null;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  genres: string[];
  /** Filme: runtime total. Série: duração ESTIMADA do próximo episódio. */
  runtime_minutes: number | null;
  runtime_estimated: boolean;
  /**
   * Candidatos do Discover já passaram por `with_runtime.lte` no TMDB: cabem
   * no tempo sem termos o número exato.
   */
  fits_by_filter: boolean;
  status: "want" | "watching" | "rewatching" | "paused" | null;
  favorite: boolean;
  personal_rating: number | null;
  tmdb_rating: number | null;
  /** IDs (BR, flatrate/free/ads) conhecidos; null = sem dado de disponibilidade. */
  provider_ids: number[] | null;
  /** Discover com `with_watch_providers`: disponibilidade garantida pela consulta. */
  provider_guaranteed: boolean;
  tv_progress: TvProgress | null;
};

export type QueueContext = {
  /** Gêneros que o usuário mais gosta (nota ≥ 7 ou favoritos), já ordenados. */
  favoriteGenres: string[];
  /** provider_id → nome dos serviços do usuário. */
  myServices: Map<number, string>;
};

export type QueuePick = {
  candidate: QueueCandidate;
  score: number;
  reason: string;
  matched_services: string[];
};

/*
 * Pesos (pontos). Escala simples, somável e explicável:
 *  - STATUS: intenção explícita do usuário pesa mais que qualquer inferência.
 *  - CONTINUIDADE: série já iniciada com próximo episódio disponível.
 *  - GÊNERO: afinidade com o que o usuário já avalia bem.
 *  - PROVEDOR: disponível num serviço do usuário (bônus, nunca eliminatório
 *    a menos que o filtro estrito esteja ligado).
 *  - FAVORITO e QUALIDADE: desempates leves.
 */
export const WEIGHTS = {
  STATUS_WATCHING: 40,
  STATUS_REWATCHING: 30,
  STATUS_WANT: 25,
  STATUS_PAUSED: 10,
  STATUS_DISCOVER: 0,
  CONTINUITY: 15,
  GENRE_MATCH_EACH: 10,
  GENRE_MATCH_MAX: 20,
  PROVIDER: 15,
  FAVORITE: 8,
  QUALITY_MAX: 12,
} as const;

export const QUEUE_RESULT_LIMIT = 3;

function statusWeight(status: QueueCandidate["status"]): number {
  switch (status) {
    case "watching":
      return WEIGHTS.STATUS_WATCHING;
    case "rewatching":
      return WEIGHTS.STATUS_REWATCHING;
    case "want":
      return WEIGHTS.STATUS_WANT;
    case "paused":
      return WEIGHTS.STATUS_PAUSED;
    default:
      return WEIGHTS.STATUS_DISCOVER;
  }
}

/** Série com próximo episódio disponível? */
function hasNextEpisode(candidate: QueueCandidate): boolean {
  return Boolean(candidate.tv_progress?.next);
}

export function matchedServices(candidate: QueueCandidate, context: QueueContext): string[] {
  if (!candidate.provider_ids) return [];

  return candidate.provider_ids
    .filter((id) => context.myServices.has(id))
    .map((id) => context.myServices.get(id) as string);
}

/** Regras eliminatórias. Retorna null se elegível, ou o motivo da exclusão. */
export function ineligibleReason(
  candidate: QueueCandidate,
  filters: QueueFilters,
  context: QueueContext
): string | null {
  if (filters.type !== "all" && candidate.media_type !== filters.type) return "tipo";

  if (filters.genre && !candidate.genres.includes(filters.genre)) return "gênero";

  if (candidate.media_type === "tv" && candidate.tv_progress) {
    // Série em dia/concluída não tem o que assistir agora.
    if (candidate.tv_progress.state === "caught_up" || candidate.tv_progress.state === "completed") {
      return "sem episódio disponível";
    }
  }

  if (filters.minutes !== null) {
    // Sem duração conhecida (e sem garantia do filtro) NÃO comparamos: exclui.
    if (candidate.fits_by_filter) {
      // ok — a consulta já garantiu o limite
    } else if (candidate.runtime_minutes === null) {
      return "duração desconhecida";
    } else if (candidate.runtime_minutes > filters.minutes) {
      return "não cabe no tempo";
    }

    // Série: só compara com o PRÓXIMO episódio, nunca com a duração total.
    if (
      candidate.media_type === "tv" &&
      candidate.source === "library" &&
      !hasNextEpisode(candidate) &&
      // Reassistindo: não há próximo episódio conhecido, mas a duração
      // estimada de UM episódio continua sendo a comparação honesta.
      candidate.tv_progress?.state !== "rewatching" &&
      !candidate.fits_by_filter
    ) {
      return "sem próximo episódio conhecido";
    }
  }

  if (filters.onlyMyServices) {
    const guaranteed = candidate.provider_guaranteed;
    const known = matchedServices(candidate, context).length > 0;

    if (!guaranteed && !known) return "fora dos meus serviços";
  }

  return null;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

export function limitLabel(minutes: number | null): string {
  return minutes === null ? "sem limite de tempo" : `até ${formatMinutes(minutes)}`;
}

/**
 * Pontua e monta o motivo. O motivo usa SOMENTE sinais aplicados:
 * cada fragmento nasce da mesma condição que soma pontos.
 */
export function scoreCandidate(
  candidate: QueueCandidate,
  filters: QueueFilters,
  context: QueueContext
): { score: number; reason: string; matched_services: string[] } {
  let score = statusWeight(candidate.status);
  const fragments: string[] = [];

  const services = matchedServices(candidate, context);
  const next = candidate.tv_progress?.next ?? null;

  // Continuidade de série já iniciada.
  const continuing =
    candidate.media_type === "tv" &&
    candidate.tv_progress?.state === "in_progress" &&
    next !== null &&
    (candidate.status === "watching" || candidate.status === "rewatching");

  if (continuing && next) {
    score += WEIGHTS.CONTINUITY;
    const runtime =
      candidate.runtime_minutes !== null
        ? ` (~${formatMinutes(candidate.runtime_minutes)}, estimativa)`
        : "";
    fragments.push(`Você já começou essa série: o próximo episódio é S${next.season} E${next.episode}${runtime}`);
  } else if (candidate.status === "rewatching") {
    // Sem SxEy: o modelo atual não guarda progresso por ciclo de reassistida.
    fragments.push("Você está reassistindo");
  } else if (candidate.status === "watching") {
    fragments.push("Você está assistindo");
  } else if (candidate.status === "want") {
    fragments.push("Está na sua lista");
  } else if (candidate.status === "paused") {
    fragments.push("Você deixou em pausa");
  }

  // Afinidade de gênero.
  const matchingGenres = candidate.genres.filter((genre) => context.favoriteGenres.includes(genre));
  const genrePoints = Math.min(WEIGHTS.GENRE_MATCH_MAX, matchingGenres.length * WEIGHTS.GENRE_MATCH_EACH);

  if (genrePoints > 0) {
    score += genrePoints;
    const shown = matchingGenres.slice(0, 2);
    fragments.push(
      `combina com ${shown.join(" e ")}, ${shown.length > 1 ? "gêneros que você avalia" : "gênero que você avalia"} bem`
    );
  }

  // Serviços.
  if (services.length > 0) {
    score += WEIGHTS.PROVIDER;
    fragments.push(`disponível em ${services.slice(0, 2).join(" e ")}`);
  } else if (candidate.provider_guaranteed) {
    score += WEIGHTS.PROVIDER;
    fragments.push("está nos seus serviços");
  }

  if (candidate.favorite) {
    score += WEIGHTS.FAVORITE;
  }

  if (candidate.tmdb_rating !== null && candidate.tmdb_rating > 6) {
    score += Math.min(WEIGHTS.QUALITY_MAX, (candidate.tmdb_rating - 6) * 3);
  }

  // Encaixe no tempo (só quando há limite e temos o dado ou a garantia).
  if (filters.minutes !== null) {
    fragments.push(`cabe no seu tempo (${limitLabel(filters.minutes)})`);
  }

  if (candidate.source === "discover" && fragments.length === 0) {
    fragments.push("Popular e bem avaliado");
  }

  const text = fragments.join(", ");

  return {
    score,
    reason: (text.charAt(0).toUpperCase() + text.slice(1)).replace(/,$/, "") + ".",
    matched_services: services,
  };
}

/** Elegíveis + pontuados, ordem determinística. */
export function rankCandidates(
  candidates: QueueCandidate[],
  filters: QueueFilters,
  context: QueueContext
): QueuePick[] {
  const picks: QueuePick[] = [];

  for (const candidate of candidates) {
    if (ineligibleReason(candidate, filters, context) !== null) continue;

    const scored = scoreCandidate(candidate, filters, context);
    picks.push({ candidate, ...scored });
  }

  return picks.sort(
    (a, b) =>
      b.score - a.score ||
      a.candidate.title.localeCompare(b.candidate.title, "pt-BR") ||
      a.candidate.tmdb_id - b.candidate.tmdb_id
  );
}

/** "Surpreenda-me": aleatório SÓ entre os candidatos válidos já filtrados. */
export function pickSurprise(picks: QueuePick[], random: () => number = Math.random): QueuePick | null {
  if (picks.length === 0) return null;

  const index = Math.min(picks.length - 1, Math.floor(random() * picks.length));

  return picks[index];
}
