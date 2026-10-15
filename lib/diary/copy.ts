import type { DiaryGroup, DiaryMoment, EpisodeRef } from "./types";

/*
 * Textos do Diário — UM lugar só, sem concatenação solta. Registra, não julga:
 * abandono é "Parou de assistir", nunca "falhou".
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export const ordinal = (n: number) => `${n}ª`;

export function episodeCode({ season, episode }: EpisodeRef) {
  return `T${season}:E${pad(episode)}`;
}

/** "T3:E04" · "T3:E02–E04" · "T3:E02, E05 e E07" · "T1:E01 – T2:E10". */
export function episodeRange(list: EpisodeRef[]) {
  const eps = [...list].sort((a, b) => a.season - b.season || a.episode - b.episode);

  if (!eps.length) return "";
  if (eps.length === 1) return episodeCode(eps[0]);

  const first = eps[0];
  const last = eps[eps.length - 1];

  if (first.season === last.season) {
    const contiguous = eps.every((e, i) => i === 0 || e.episode === eps[i - 1].episode + 1);

    if (contiguous) return `${episodeCode(first)}–E${pad(last.episode)}`;

    if (eps.length <= 4) {
      const parts = eps.map((e, i) => (i === 0 ? episodeCode(e) : `E${pad(e.episode)}`));

      return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
    }
  }

  return `${episodeCode(first)} – ${episodeCode(last)}`;
}

function listNumbers(list: number[]) {
  if (list.length === 1) return String(list[0]);

  const contiguous = list.every((n, i) => i === 0 || n === list[i - 1] + 1);

  if (contiguous) return `${list[0]}–${list[list.length - 1]}`;

  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

/** "Temporada 2 concluída" · "Temporadas 1–5 concluídas" · "Temporadas 1, 3 e 4 concluídas". */
export function seasonsLabel(seasons: number[]) {
  const list = [...new Set(seasons)].sort((a, b) => a - b);

  if (!list.length) return "";

  return list.length === 1 ? `Temporada ${list[0]} concluída` : `Temporadas ${listNumbers(list)} concluídas`;
}

export const STATUS_TEXT: Record<string, string> = {
  want: "Quero assistir",
  watching: "Assistindo",
  watched: "Assistido",
  dropped: "Abandonei",
  rewatching: "Reassistindo",
  rewatched: "Reassistido",
};

/** O que aconteceu, numa frase. */
export function headline(m: DiaryMoment): string {
  const tv = m.media?.media_type === "tv";

  switch (m.kind) {
    case "watched":
      return tv ? "Série concluída" : "Assistiu";
    case "rewatched":
      return m.rewatch_number && m.rewatch_number >= 2 ? `Reassistiu pela ${ordinal(m.rewatch_number)} vez` : "Reassistiu";
    case "episodes": {
      const n = m.episodes.length;

      if (n === 1) return `Assistiu ${episodeCode(m.episodes[0])}`;

      return m.batch ? `Marcou ${n} episódios como assistidos` : `Assistiu ${n} episódios`;
    }
    case "season_completed":
      return seasonsLabel(m.seasons_completed);
    case "series_completed":
      return "Série concluída";
    case "rewatch_started":
      return m.rewatch_number && m.rewatch_number >= 2 ? `Começou a reassistir pela ${ordinal(m.rewatch_number)} vez` : "Começou a reassistir";
    case "started":
      return "Começou a assistir";
    case "resumed":
      return m.from_status === "dropped" ? (tv ? "Retomou a série" : "Retomou o filme") : "Voltou a assistir";
    case "dropped":
      return tv && m.stopped_season ? `Parou de assistir na T${m.stopped_season}` : "Parou de assistir";
    case "added":
      return m.status === "want" ? "Adicionou à watchlist" : "Adicionou à biblioteca";
    case "removed":
      return "Removeu da biblioteca";
    case "completed_unknown":
      return "Marcou como concluído";
    default:
      return m.status && STATUS_TEXT[m.status] ? `Marcou como ${STATUS_TEXT[m.status]}` : "Atualizou o título";
  }
}

/** Contexto secundário (no máximo uma linha curta). */
export function detail(m: DiaryMoment): string | null {
  if (m.kind === "episodes") {
    const parts: string[] = [];

    if (m.episodes.length > 1) parts.push(episodeRange(m.episodes));
    if (m.seasons_completed.length && !m.series_completed) parts.push(seasonsLabel(m.seasons_completed));
    if (m.rewatch_started) parts.push("Começou a reassistir");

    return parts.join(" · ") || null;
  }

  if (m.kind === "series_completed" && m.seasons_completed.length > 1) return `${plural(m.seasons_completed.length, "temporada", "temporadas")}`;

  return null;
}

/** Marco que merece destaque (sem exagero): fim de série. */
export function milestone(m: DiaryMoment): string | null {
  if (m.kind === "episodes" && m.series_completed) return "Série concluída";

  return null;
}

/** Ícone por natureza (o texto sempre diz o mesmo; nunca depende só do ícone). */
export function iconOf(m: DiaryMoment): "play" | "check" | "repeat" | "flag" | "pause" | "plus" | "dot" {
  switch (m.kind) {
    case "watched":
    case "episodes":
      return m.series_completed ? "flag" : "play";
    case "rewatched":
    case "rewatch_started":
      return "repeat";
    case "season_completed":
    case "completed_unknown":
      return "check";
    case "started":
    case "resumed":
      return "play";
    case "series_completed":
      return "flag";
    case "dropped":
      return "pause";
    case "added":
      return "plus";
    default:
      return "dot";
  }
}

export function formatRating(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function groupTitle(group: DiaryGroup) {
  return group.kind === "unlinked" ? "Registros sem título vinculado" : "Biblioteca organizada";
}

export function groupSummary(group: DiaryGroup) {
  const n = group.moments.length;

  if (group.kind === "unlinked") {
    const rows = group.moments.reduce((sum, m) => sum + m.raw.length, 0);

    return `${plural(rows, "registro antigo", "registros antigos")} cujo título não pôde ser identificado`;
  }

  const added = group.moments.filter((m) => m.kind === "added").length;
  const removed = group.moments.filter((m) => m.kind === "removed").length;
  const other = n - added - removed;
  const parts = [];

  if (added) parts.push(plural(added, "título adicionado", "títulos adicionados"));
  if (removed) parts.push(plural(removed, "título removido", "títulos removidos"));
  if (other) parts.push(plural(other, "alteração de status", "alterações de status"));

  return parts.join(" · ");
}

/** Frase completa para leitores de tela. */
export function momentAria(m: DiaryMoment) {
  const parts = [m.media?.title ?? "Título não identificado", headline(m), detail(m), milestone(m)];

  if (m.rating !== null) parts.push(`nota ${formatRating(m.rating)}`);
  if (m.time) parts.push(`às ${m.time}`);

  return parts.filter(Boolean).join(", ");
}
