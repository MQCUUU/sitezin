/*
 * V3.3 — regras PURAS das notificações de série (o único produtor é
 * app/api/library/sync-seasons). Testadas em scripts/test-settings.mjs.
 *
 * Quem conta: séries CURTIDAS (favorite) da biblioteca.
 *  - new_season: a temporada mais recente (nº ≥ 2) foi anunciada sem data,
 *    estreia no futuro ou estreou há até RECENT_SEASON_DAYS dias. Regra POR
 *    USUÁRIO — antes dependia de `media.seasons_count` (campo do catálogo
 *    compartilhado, atualizado pelo próprio produtor): o primeiro usuário a
 *    sincronizar "consumia" a novidade e os demais nunca eram avisados.
 *  - new_episode: o TMDB informa o próximo episódio com data.
 * Datas são date-only (mesma semântica do Calendário: dia de Brasília).
 * Dedup: `event_key` estável + UNIQUE (user_id, event_key) no banco.
 */
import { addDays, isDay } from "../calendar/dates";

export const RECENT_SEASON_DAYS = 30;

export type NotificationPrefs = { new_season_site?: boolean | null; new_episode_site?: boolean | null } | null;

export type SeriesNotice = {
  event_key: string;
  type: "new_season" | "new_episode";
  title: string;
  message: string;
  href: string;
  release_at: string | null;
  release_precision: "date";
  metadata: Record<string, number>;
};

type TvDetails = {
  name?: string;
  number_of_seasons?: number;
  seasons?: { season_number?: number; air_date?: string | null }[];
  next_episode_to_air?: { season_number?: number; episode_number?: number; air_date?: string | null; name?: string | null } | null;
};

/** Meio-dia UTC do dia: exibido como a mesma data em qualquer fuso do Brasil. */
export const dateAtNoonUtc = (date?: string | null) => (date && isDay(date) ? `${date}T12:00:00.000Z` : null);

export function buildSeriesNotices(input: {
  tmdbId: number;
  title: string;
  favorite: boolean;
  details: TvDetails | null | undefined;
  prefs: NotificationPrefs;
  /** Hoje em Brasília (YYYY-MM-DD). */
  today: string;
}): SeriesNotice[] {
  const { tmdbId, favorite, details, prefs, today } = input;

  if (!favorite || !details || !tmdbId) return [];

  const name = details.name || input.title;
  const href = `/title/tv/${tmdbId}`;
  const notices: SeriesNotice[] = [];
  const latest = Number(details.number_of_seasons || 0);

  if (prefs?.new_season_site !== false && latest >= 2) {
    const season = (details.seasons || []).find((row) => Number(row.season_number) === latest);
    const airDate = season?.air_date && isDay(season.air_date) ? season.air_date : null;
    const recent = !airDate || airDate >= addDays(today, -RECENT_SEASON_DAYS);

    if (season && recent) {
      notices.push({
        event_key: `season:${tmdbId}:${latest}`,
        type: "new_season",
        title: `Nova temporada de ${name}`,
        message: !airDate
          ? `A temporada ${latest} foi anunciada.`
          : airDate > today
            ? `A temporada ${latest} vai estrear.`
            : `A temporada ${latest} estreou.`,
        href,
        release_at: dateAtNoonUtc(airDate),
        release_precision: "date",
        metadata: { tmdb_id: tmdbId, season_number: latest },
      });
    }
  }

  const episode = details.next_episode_to_air;

  if (prefs?.new_episode_site !== false && episode?.air_date && isDay(episode.air_date)) {
    notices.push({
      event_key: `episode:${tmdbId}:${episode.season_number}:${episode.episode_number}:${episode.air_date}`,
      type: "new_episode",
      title: `Novo episódio de ${name}`,
      message: `T${episode.season_number} E${episode.episode_number}${episode.name ? ` · ${episode.name}` : ""}`,
      href,
      release_at: dateAtNoonUtc(episode.air_date),
      release_precision: "date",
      metadata: {
        tmdb_id: tmdbId,
        season_number: Number(episode.season_number),
        episode_number: Number(episode.episode_number),
      },
    });
  }

  return notices;
}
