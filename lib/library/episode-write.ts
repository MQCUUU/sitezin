import { computeTvProgress, tvStructureFromRaw, type TvProgress } from "../tv-progress";
import { deriveSeasonFields, deriveSeriesStatus, type EpisodeAction } from "./episode-status";

/*
 * V3.1 — plano PURO de uma marcação de episódios: dado o estado atual (status,
 * estrutura de media.raw, episódios já vistos) e as mudanças pedidas, devolve
 * o conjunto final de episódios vistos, o progresso canônico resultante e o
 * estado derivado da série. A rota grava episódios + estado numa transação.
 * Testado em scripts/test-title.mjs.
 */

export type SeriesRow = {
  status: string;
  seasons_count?: number | null;
  episodes_count?: number | null;
  _seasons?: unknown;
  _last_episode?: unknown;
  _series_status?: unknown;
};

export type EpisodeChange = { season_number: number; episode_number: number; watched: boolean };

export type SeriesPlan = {
  progress: TvProgress;
  status: string;
  completed_seasons: number;
  current_season: number;
};

export function planSeriesUpdate(input: {
  row: SeriesRow;
  watchedBefore: { season_number: number; episode_number: number }[];
  changes: EpisodeChange[];
  action: EpisodeAction;
}): SeriesPlan {
  const structure = tvStructureFromRaw(
    { seasons: input.row._seasons, last_episode_to_air: input.row._last_episode, status: input.row._series_status },
    { seasons_count: input.row.seasons_count, episodes_count: input.row.episodes_count }
  );
  const key = (s: number, e: number) => `${s}:${e}`;
  const seen = new Map<string, { season_number: number; episode_number: number }>();

  for (const e of input.watchedBefore) seen.set(key(e.season_number, e.episode_number), e);

  for (const c of input.changes) {
    if (c.watched) seen.set(key(c.season_number, c.episode_number), { season_number: c.season_number, episode_number: c.episode_number });
    else seen.delete(key(c.season_number, c.episode_number));
  }

  const watched = [...seen.values()];
  // Decisão pelos FATOS (sem o atalho "rewatching" do computeTvProgress).
  const progress = computeTvProgress(structure, watched);
  const status = deriveSeriesStatus(input.row.status, input.action, progress);
  const seasons = deriveSeasonFields(structure, watched, progress);

  return { progress, status, ...seasons };
}
