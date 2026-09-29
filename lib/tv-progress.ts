/*
 * V2.1-E — progresso real de séries e próximo episódio.
 *
 * Fonte canônica (V2.1-A): `episodes_progress.watched = true`. Nunca
 * inferimos episódio assistido. A estrutura da série (temporadas e
 * quantidade de episódios) vem do `media.raw` já guardado no banco
 * (`raw.seasons`, `raw.last_episode_to_air`, `raw.status`) — zero chamadas
 * externas e zero N+1: quem chama busca o progresso de VÁRIAS séries em
 * uma query (`media_id = ANY(...)`) e agrupa aqui.
 *
 * Regras (documentadas em docs/V2.1-E-HIGH-VALUE-FEATURES.md):
 *  - Temporada 0 ("Especiais") não entra em total/percentual/próximo:
 *    especiais não são o caminho principal da série.
 *  - "Próximo" = PRIMEIRO episódio regular, já exibido, ainda NÃO assistido,
 *    em ordem cronológica. Um buraco (E1 ✓, E2 ✗, E3 ✓) nunca é pulado
 *    em silêncio: próximo = E2.
 *  - `rewatching`: `episodes_progress` é o histórico (uma linha por
 *    episódio, sem ciclo de reassistida). Não sabemos onde está a
 *    reassistida → estado "rewatching", SEM próximo e SEM percentual
 *    (dívida V3, ver docs). Nunca inventamos SxEy.
 *  - Estrutura possivelmente desatualizada (`media.raw` só é reescrito ao
 *    adicionar o título; `seasons_count`/`episodes_count` são atualizados
 *    depois por sync-seasons): se as contagens mais novas excedem a
 *    estrutura conhecida (`stale`), não afirmamos "em dia"/"concluída" nem
 *    percentual — degradamos para "unknown".
 *  - Episódios que ainda não foram ao ar (depois de `last_episode_to_air`)
 *    não contam como disponíveis: sem próximo → `caught_up` (em dia).
 *  - `completed` só quando TUDO foi assistido E a série terminou
 *    (Ended/Canceled); série em exibição em dia é `caught_up`.
 *  - Sem dados de temporadas: não inventamos total nem próximo (null).
 */

export type SeasonInfo = {
  season_number: number;
  episode_count: number;
};

export type WatchedEpisode = {
  season_number: number;
  episode_number: number;
};

export type TvProgressState =
  | "not_started"
  | "in_progress"
  | "caught_up"
  | "completed"
  | "rewatching"
  | "unknown";

export type TvProgress = {
  state: TvProgressState;
  watched: number;
  /** Episódios já exibidos (temporadas regulares); null se sem dados. */
  total: number | null;
  /** 0–100 ou null quando total é desconhecido. */
  percent: number | null;
  next: { season: number; episode: number } | null;
};

export type TvStructure = {
  seasons: SeasonInfo[];
  aired_through: { season: number; episode: number } | null;
  ended: boolean;
  /** `media.seasons_count/episodes_count` indicam mais conteúdo que `raw.seasons`. */
  stale: boolean;
};

type RawLike = Record<string, unknown> | null | undefined;

/** Extrai a estrutura da série de `media.raw` (sem rede). */
export function tvStructureFromRaw(
  raw: RawLike,
  counts?: { seasons_count?: number | null; episodes_count?: number | null }
): TvStructure {
  const seasonsRaw = Array.isArray(raw?.seasons) ? (raw!.seasons as unknown[]) : [];

  const seasons: SeasonInfo[] = seasonsRaw
    .map((season) => {
      const item = season as Record<string, unknown>;
      return {
        season_number: Number(item?.season_number),
        episode_count: Number(item?.episode_count),
      };
    })
    .filter(
      (season) =>
        Number.isInteger(season.season_number) &&
        season.season_number >= 1 &&
        Number.isInteger(season.episode_count) &&
        season.episode_count >= 1
    )
    .sort((a, b) => a.season_number - b.season_number);

  const last = raw?.last_episode_to_air as Record<string, unknown> | null | undefined;
  const lastSeason = Number(last?.season_number);
  const lastEpisode = Number(last?.episode_number);

  const status = typeof raw?.status === "string" ? raw.status : "";

  const knownSeasons = seasons.length ? seasons[seasons.length - 1].season_number : 0;
  const knownEpisodes = seasons.reduce((total, season) => total + season.episode_count, 0);
  const stale =
    seasons.length > 0 &&
    ((Number(counts?.seasons_count) > knownSeasons) ||
      (Number(counts?.episodes_count) > knownEpisodes));

  return {
    seasons,
    aired_through:
      Number.isInteger(lastSeason) && Number.isInteger(lastEpisode) && lastSeason >= 1 && lastEpisode >= 1
        ? { season: lastSeason, episode: lastEpisode }
        : null,
    ended: status === "Ended" || status === "Canceled",
    stale,
  };
}

/**
 * Duração estimada de um episódio (minutos) — SEMPRE estimativa: o banco não
 * guarda a duração de cada episódio. Null se não houver dado.
 */
export function estimateEpisodeRuntime(raw: RawLike): number | null {
  const list = Array.isArray(raw?.episode_run_time) ? (raw!.episode_run_time as unknown[]) : [];
  const first = Number(list.find((value) => Number(value) > 0));

  if (Number.isFinite(first) && first > 0) return Math.round(first);

  const last = raw?.last_episode_to_air as Record<string, unknown> | null | undefined;
  const lastRuntime = Number(last?.runtime);

  return Number.isFinite(lastRuntime) && lastRuntime > 0 ? Math.round(lastRuntime) : null;
}

export function computeTvProgress(
  structure: TvStructure,
  watchedEpisodes: WatchedEpisode[],
  options: { rewatching?: boolean } = {}
): TvProgress {
  const { seasons, aired_through: airedThrough, ended, stale } = structure;

  if (options.rewatching) {
    return {
      state: "rewatching",
      watched: new Set(
        watchedEpisodes
          .filter((episode) => episode.season_number >= 1)
          .map((episode) => `${episode.season_number}:${episode.episode_number}`)
      ).size,
      total: null,
      percent: null,
      next: null,
    };
  }

  const watchedSet = new Set(
    watchedEpisodes
      .filter((episode) => episode.season_number >= 1)
      .map((episode) => `${episode.season_number}:${episode.episode_number}`)
  );

  if (seasons.length === 0) {
    // Sem estrutura conhecida: mostramos só o que é fato (quantos assistidos).
    return {
      state: watchedSet.size > 0 ? "unknown" : "not_started",
      watched: watchedSet.size,
      total: null,
      percent: null,
      next: null,
    };
  }

  // Lista ordenada de episódios já exibidos (regulares).
  const aired: { season: number; episode: number }[] = [];

  for (const season of seasons) {
    for (let episode = 1; episode <= season.episode_count; episode++) {
      if (
        airedThrough &&
        (season.season_number > airedThrough.season ||
          (season.season_number === airedThrough.season && episode > airedThrough.episode))
      ) {
        continue;
      }

      aired.push({ season: season.season_number, episode });
    }
  }

  const total = aired.length;
  const watchedAired = aired.filter((item) => watchedSet.has(`${item.season}:${item.episode}`));
  const watched = watchedAired.length;
  const percent = total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : null;

  if (watched === 0) {
    return {
      state: "not_started",
      watched: 0,
      total,
      percent: total > 0 ? 0 : null,
      next: aired[0] ? { season: aired[0].season, episode: aired[0].episode } : null,
    };
  }

  // Primeiro episódio exibido e não assistido, em ordem cronológica.
  const nextItem = aired.find((item) => !watchedSet.has(`${item.season}:${item.episode}`)) ?? null;

  if (!nextItem) {
    if (stale) {
      // Há conteúdo mais novo que a estrutura salva: não afirmamos "em dia".
      return { state: "unknown", watched, total: null, percent: null, next: null };
    }

    return {
      state: ended ? "completed" : "caught_up",
      watched,
      total,
      percent: 100,
      next: null,
    };
  }

  return {
    state: "in_progress",
    watched,
    total: stale ? null : total,
    percent: stale ? null : percent,
    next: { season: nextItem.season, episode: nextItem.episode },
  };
}

/** Agrupa linhas de `episodes_progress` (várias séries, 1 query) por media_id. */
export function groupWatchedByMedia(
  rows: { media_id: number; season_number: number; episode_number: number }[]
): Map<number, WatchedEpisode[]> {
  const map = new Map<number, WatchedEpisode[]>();

  for (const row of rows) {
    const list = map.get(row.media_id) ?? [];
    list.push({ season_number: row.season_number, episode_number: row.episode_number });
    map.set(row.media_id, list);
  }

  return map;
}
