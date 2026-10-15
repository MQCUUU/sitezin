/*
 * Diário — dados crus × história apresentada.
 *
 *   RawItem[]  (activity_events, watch_entries, episodes_progress — intactos no banco)
 *      ↓  lib/diary/moments.ts (puro, determinístico, testado)
 *   DiaryDay[] (momentos + grupos recolhidos)
 *      ↓  components/diary
 *   UI
 *
 * Nenhum dado cru é apagado ou reescrito: cada momento guarda os ids das
 * linhas que representa (`raw`), inclusive as absorvidas.
 */

export type MediaRef = {
  id: number;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  /** Título reconhecido pelo nome gravado no evento (evento legado sem vínculo). */
  recovered?: boolean;
};

export type ActivityType =
  | "library_added"
  | "status_changed"
  | "season_completed"
  | "series_completed"
  | "rewatch_started"
  | "watch_logged"
  | "library_removed";

type Base = {
  id: string;
  /** Instante ISO — só para ordenar/agrupar; nunca exibido diretamente. */
  at: string;
  /** Dia civil em Brasília (AAAA-MM-DD). */
  day: string;
  /** "21:00" só com proveniência de horário; null = só a data. */
  time: string | null;
  media: MediaRef | null;
};

export type RawEvent = Base & {
  source: "event";
  type: ActivityType;
  meta: Record<string, unknown>;
};

export type RawWatch = Base & {
  source: "watch";
  rating: number | null;
  comment: string | null;
  is_rewatch: boolean;
  /** 1 = primeira visualização registrada do título. */
  watch_number: number;
};

export type RawEpisode = Base & {
  source: "episode";
  season: number;
  episode: number;
  /** Este episódio fechou a temporada (todos os episódios dela assistidos). */
  season_done: boolean;
  /** …e era a última temporada de uma série encerrada. */
  series_done: boolean;
};

export type RawItem = RawEvent | RawWatch | RawEpisode;

export type MomentKind =
  | "watched"
  | "rewatched"
  | "episodes"
  | "season_completed"
  | "series_completed"
  | "rewatch_started"
  | "started"
  | "resumed"
  | "dropped"
  | "added"
  | "removed"
  | "status"
  | "completed_unknown";

export type EpisodeRef = { season: number; episode: number };

export type DiaryMoment = {
  id: string;
  day: string;
  time: string | null;
  at: string;
  kind: MomentKind;
  /** primary = consumo/marco; secondary = organização da biblioteca. */
  tier: "primary" | "secondary";
  media: MediaRef | null;
  rating: number | null;
  comment: string | null;
  /** Reassistida: número da reassistida (1 = primeira), quando conhecido. */
  rewatch_number: number | null;
  /** Começou a reassistir neste mesmo momento (ex.: episódio da reassistida). */
  rewatch_started: boolean;
  episodes: EpisodeRef[];
  /** Episódios marcados de uma vez (mesma operação, segundos de diferença). */
  batch: boolean;
  seasons_completed: number[];
  series_completed: boolean;
  stopped_season: number | null;
  /** Status de destino, para "added"/"status". */
  status: string | null;
  /** Status de origem, para "resumed" (retomou depois de abandonar × voltou). */
  from_status: string | null;
  /** Ids crus representados (nada é perdido). */
  raw: string[];
};

export type DiaryGroup = {
  id: string;
  kind: "library" | "unlinked";
  moments: DiaryMoment[];
};

export type DiaryDay = {
  day: string;
  moments: DiaryMoment[];
  groups: DiaryGroup[];
};

export type DiaryFilter = "all" | "watched" | "rewatch" | "rated";

export type DiaryResponse = {
  month: string;
  today: string;
  filter: DiaryFilter;
  days: DiaryDay[];
  /** Mês anterior com atividade (cursor de "Carregar mais"). */
  prev: string | null;
  /** Meses com atividade, do mais recente ao mais antigo. */
  months: string[];
  /** O recorte bateu no limite de linhas do mês (nada some sem aviso). */
  truncated: boolean;
};
