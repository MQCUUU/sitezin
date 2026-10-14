/*
 * Calendário — modelo de evento normalizado.
 *
 * Tipos (poucos, sem over-engineering):
 *   movie_release    estreia de filme
 *   series_premiere  estreia de série (T1)
 *   season_premiere  nova temporada (T2+) — nunca confundida com série nova
 *   season_release   temporada inteira disponível de uma vez (binge drop)
 *   episode_release  novo(s) episódio(s); vários no mesmo dia viram 1 evento
 *
 * Identidade (`id`) — 1 evento por coisa real, nunca por fonte:
 *   movie:{tmdb}                  filme (biblioteca e descobertas se fundem)
 *   tv:{tmdb}:premiere            estreia de série
 *   tv:{tmdb}:s{S}:{data}         lançamento de temporada/episódios naquele dia
 */

export type CalendarEventType =
  | "movie_release"
  | "series_premiere"
  | "season_premiere"
  | "season_release"
  | "episode_release";

/**
 * Relação pessoal (dados reais da biblioteca):
 *   following  série que você acompanha (assistindo, reassistindo, concluída
 *              ou com episódios marcados)
 *   watchlist  "Quero assistir"
 *   library    está na biblioteca, sem acompanhar ativamente (ex.: pausada)
 */
export type Relationship = "following" | "watchlist" | "library";

export type Progress =
  | { kind: "caught_up" }
  | { kind: "behind"; episodes: number }
  | { kind: "in_season"; season: number }
  | { kind: "not_started" };

export type CalendarEvent = {
  id: string;
  date: string;
  type: CalendarEventType;
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  season_number: number | null;
  episode_from: number | null;
  episode_to: number | null;
  episode_count: number;
  /** Filmes: Cinema / Digital, só quando a fonte informa. */
  release_label: string | null;
  relationship: Relationship | null;
  progress: Progress | null;
  /** Você já assistiu (episódio marcado / filme assistido). */
  watched: boolean;
  popularity: number;
};

export type CalendarResponse = {
  from: string;
  to: string;
  today: string;
  events: CalendarEvent[];
  /** Fontes que falharam (o resto continua): "library" | "discoveries". */
  partial: string[];
  /** Usuário tem algo na biblioteca que poderia gerar eventos pessoais. */
  hasPersonalSources: boolean;
};
