/*
 * V3.3 — backup do MyCatalog: regras PURAS (sem banco/rede), testadas em
 * scripts/test-settings.mjs. A rota de restauração só executa o plano.
 *
 * Contrato do arquivo:
 *  - `mycatalog_backup: true` + `version` 1 ou 2 (2 = inclui progresso de
 *    episódios e chaves TMDB em todas as linhas; 1 continua aceito);
 *  - NADA do arquivo é autoridade de dono: `account.id`/`user_id`/`id` das
 *    linhas são ignorados — tudo vai para o usuário da sessão;
 *  - títulos são identificados por (tmdb_id, media_type), nunca por ids
 *    internos de outra conta/instância.
 *
 * Mesclagem determinística (a copy da UI diz exatamente isto):
 *  - título que não existe na conta → adicionado;
 *  - título que existe nos dois → fica a versão editada mais recentemente
 *    (`updated_at`); empate = a da conta (o backup não sobrescreve);
 *  - nada da conta é apagado;
 *  - visualizações/episódios/ocultos/atividade já existentes não duplicam.
 */

export const BACKUP_VERSION = 2;
export const SUPPORTED_VERSIONS = [1, 2];
export const MAX_BACKUP_ITEMS = 20_000;

const STATUSES = ["want", "watching", "watched", "paused", "dropped", "rewatching", "rewatched"];
const EVENT_TYPES = [
  "library_added",
  "status_changed",
  "season_completed",
  "series_completed",
  "rewatch_started",
  "watch_logged",
];

type Json = Record<string, unknown>;
type MediaKey = { tmdb_id: number; media_type: "movie" | "tv" };

const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.slice(0, max) : null);
const int = (value: unknown, min = 0, max = 1_000_000_000) => {
  const n = Number(value);

  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const rating = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 10) / 10 : null;
};
const isoDate = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;

  const time = Date.parse(value);

  if (!Number.isFinite(time)) return null;

  const iso = new Date(time).toISOString();

  // Só anos 0001–9999 (o Postgres recusa o ano 0 e o resto do arquivo cairia junto).
  return /^\d{4}-/.test(iso) && !iso.startsWith("0000") ? iso : null;
};
const dayOnly = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const precision = (value: unknown) => (value === "date" || value === "datetime" ? value : null);

function mediaKey(media: Json): MediaKey | null {
  const tmdbId = int(media.tmdb_id, 1);
  const mediaType = media.media_type === "movie" || media.media_type === "tv" ? media.media_type : null;

  return tmdbId && mediaType ? { tmdb_id: tmdbId, media_type: mediaType } : null;
}

export type RestorePlan = {
  library: (MediaKey & {
    title: string;
    original_title: string | null;
    overview: string | null;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string | null;
    first_air_date: string | null;
    status: string;
    favorite: boolean;
    personal_rating: number | null;
    review: string | null;
    watched_at: string | null;
    watched_at_precision: string | null;
    rewatch_count: number;
    current_season: number | null;
    completed_seasons: number;
    stopped_season: number | null;
    added_at: string;
    updated_at: string;
  })[];
  watches: (MediaKey & {
    watched_at: string;
    watched_at_precision: string | null;
    rating: number | null;
    comment: string | null;
    is_rewatch: boolean;
    created_at: string;
    updated_at: string;
  })[];
  episodes: (MediaKey & {
    season_number: number;
    episode_number: number;
    watched: boolean;
    watched_at: string | null;
    watched_at_precision: string | null;
    comment: string | null;
    is_rewatch: boolean;
  })[];
  hidden: (MediaKey & { reason: string; created_at: string })[];
  activity: (MediaKey & { event_type: string; metadata: Json; occurred_at: string })[];
  skipped: number;
};

export type PlanResult = { ok: true; plan: RestorePlan } | { ok: false; error: string };

/** Valida o arquivo inteiro ANTES de qualquer escrita; nada parcial. */
export function planRestore(input: unknown, now = new Date().toISOString()): PlanResult {
  const backup = obj(input);

  if (backup.mycatalog_backup !== true) return { ok: false, error: "Este arquivo não é um backup do MyCatalog." };
  if (!SUPPORTED_VERSIONS.includes(Number(backup.version))) {
    return { ok: false, error: `Versão de backup não suportada (${String(backup.version ?? "ausente")}).` };
  }

  const data = obj(backup.data);

  if (!Array.isArray(data.library)) return { ok: false, error: "O backup não tem a lista da biblioteca." };

  const total =
    list(data.library).length +
    list(data.watch_history).length +
    list(data.hidden_titles).length +
    list(data.activity_events).length +
    list(data.episodes_progress).length;

  if (total > MAX_BACKUP_ITEMS) return { ok: false, error: `Backup grande demais (mais de ${MAX_BACKUP_ITEMS} registros).` };

  let skipped = 0;
  // Backups v1 ligam visualizações/atividade por ids internos da conta antiga:
  // traduzimos esses ids para (tmdb_id, media_type) usando a própria biblioteca do arquivo.
  const byOldMediaId = new Map<string, MediaKey>();
  const byOldLibraryId = new Map<string, MediaKey>();
  const library: RestorePlan["library"] = [];
  const seenLibrary = new Set<string>();

  for (const raw of list(data.library)) {
    const item = obj(raw);
    const media = obj(item.media);
    const key = mediaKey(media);

    if (!key) {
      skipped++;
      continue;
    }

    if (media.id !== undefined) byOldMediaId.set(String(media.id), key);
    if (item.id !== undefined) byOldLibraryId.set(String(item.id), key);

    const id = `${key.media_type}:${key.tmdb_id}`;

    if (seenLibrary.has(id)) {
      skipped++;
      continue;
    }

    seenLibrary.add(id);

    const watchedAt = isoDate(item.watched_at);

    library.push({
      ...key,
      title: text(media.title, 500) || "Sem título",
      original_title: text(media.original_title, 500),
      overview: text(media.overview, 10_000),
      poster_path: text(media.poster_path, 200),
      backdrop_path: text(media.backdrop_path, 200),
      release_date: dayOnly(media.release_date),
      first_air_date: dayOnly(media.first_air_date),
      status: STATUSES.includes(String(item.status)) ? String(item.status) : "want",
      favorite: item.favorite === true,
      personal_rating: rating(item.personal_rating),
      review: text(item.review, 10_000),
      watched_at: watchedAt,
      watched_at_precision: watchedAt ? precision(item.watched_at_precision) : null,
      rewatch_count: int(item.rewatch_count, 0, 1000) ?? 0,
      current_season: int(item.current_season, 1, 1000),
      completed_seasons: int(item.completed_seasons, 0, 1000) ?? 0,
      stopped_season: int(item.stopped_season, 1, 1000),
      added_at: isoDate(item.added_at) || now,
      updated_at: isoDate(item.updated_at) || isoDate(item.added_at) || now,
    });
  }

  const keyFor = (row: Json): MediaKey | null =>
    mediaKey(row) ||
    (row.library_item_id !== undefined ? byOldLibraryId.get(String(row.library_item_id)) : undefined) ||
    (row.media_id !== undefined ? byOldMediaId.get(String(row.media_id)) : undefined) ||
    null;

  const watches: RestorePlan["watches"] = [];

  for (const raw of list(data.watch_history)) {
    const row = obj(raw);
    const key = keyFor(row);
    const watchedAt = isoDate(row.watched_at);

    if (!key || !watchedAt) {
      skipped++;
      continue;
    }

    watches.push({
      ...key,
      watched_at: watchedAt,
      watched_at_precision: precision(row.watched_at_precision),
      rating: rating(row.rating),
      comment: text(row.comment, 4000),
      is_rewatch: row.is_rewatch === true,
      created_at: isoDate(row.created_at) || now,
      updated_at: isoDate(row.updated_at) || isoDate(row.created_at) || now,
    });
  }

  const episodes: RestorePlan["episodes"] = [];

  for (const raw of list(data.episodes_progress)) {
    const row = obj(raw);
    const key = keyFor(row);
    const season = int(row.season_number, 0, 1000);
    const episode = int(row.episode_number, 1, 10_000);

    if (!key || key.media_type !== "tv" || season === null || episode === null) {
      skipped++;
      continue;
    }

    const watchedAt = isoDate(row.watched_at);

    episodes.push({
      ...key,
      season_number: season,
      episode_number: episode,
      watched: row.watched !== false,
      watched_at: watchedAt,
      watched_at_precision: watchedAt ? precision(row.watched_at_precision) : null,
      comment: text(row.comment, 4000),
      is_rewatch: row.is_rewatch === true,
    });
  }

  const hidden: RestorePlan["hidden"] = [];

  for (const raw of list(data.hidden_titles)) {
    const row = obj(raw);
    const key = mediaKey(row);

    if (!key) {
      skipped++;
      continue;
    }

    hidden.push({ ...key, reason: text(row.reason, 100) || "not_interested", created_at: isoDate(row.created_at) || now });
  }

  const activity: RestorePlan["activity"] = [];

  for (const raw of list(data.activity_events)) {
    const row = obj(raw);
    const key = keyFor(row);
    const occurredAt = isoDate(row.occurred_at);

    // Remoções da biblioteca não são restauradas (não há o que remover num restore aditivo).
    if (!key || !occurredAt || !EVENT_TYPES.includes(String(row.event_type))) {
      skipped++;
      continue;
    }

    activity.push({ ...key, event_type: String(row.event_type), metadata: obj(row.metadata), occurred_at: occurredAt });
  }

  return { ok: true, plan: { library, watches, episodes, hidden, activity, skipped } };
}

/*
 * CSV: texto entre aspas (RFC 4180) + neutraliza fórmula — célula que começa
 * com = + - @ (ou tab/CR) ganha um apóstrofo, para Excel/Sheets não executarem
 * (CSV injection). Números legítimos (ex.: "-1") são exportados como número.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" || typeof value === "boolean") return `"${String(value)}"`;
  // O driver devolve timestamptz como Date: vira ISO (antes saía como JSON, com aspas extras).
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '""' : `"${value.toISOString()}"`;

  let content = typeof value === "object" ? JSON.stringify(value) : String(value);

  if (/^[=+\-@\t\r]/.test(content)) content = `'${content}`;

  return `"${content.replace(/"/g, '""')}"`;
}
