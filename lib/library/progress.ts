import type { TvProgress, TvStructure, WatchedEpisode } from "../tv-progress";

/*
 * Biblioteca V2.6 — "onde eu parei" numa linha.
 *
 * Fonte canônica: `computeTvProgress` (lib/tv-progress.ts — episodes_progress +
 * estrutura de media.raw; especiais fora; episódio não exibido não conta;
 * estrutura desatualizada → unknown; "concluída" só em série encerrada). Esta
 * camada só acrescenta o contexto da temporada atual e a copy, sem nova regra
 * de progresso. Pura (sem imports de runtime): testada em
 * scripts/test-library-progress.mjs.
 *
 * Legado: séries importadas como "Assistido"/"Abandonei" têm `completed_seasons`
 * mas NENHUM episódio registrado. Sem episódios não dizemos "Ainda não começou"
 * para quem já assistiu: só citamos a temporada concluída registrada, ou nada.
 */

export type LibraryProgress = {
  state: TvProgress["state"] | "legacy";
  /** UMA linha para o card (null = o status já diz tudo). */
  card: string | null;
  /** Quick View: linha principal + detalhe. */
  title: string | null;
  detail: string | null;
  next: { season: number; episode: number } | null;
  season: { number: number; watched: number; total: number | null } | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const episodeCode = (season: number, episode: number) => `T${season}:E${pad(episode)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Episódios exibidos e assistidos numa temporada (regular). */
export function seasonStats(structure: TvStructure, watched: WatchedEpisode[], seasonNumber: number) {
  const season = structure.seasons.find((s) => s.season_number === seasonNumber);

  if (!season) return null;

  const through = structure.aired_through;
  let aired = season.episode_count;

  if (through && seasonNumber > through.season) aired = 0;
  else if (through && seasonNumber === through.season) aired = Math.min(aired, through.episode);

  const seen = new Set(watched.filter((e) => e.season_number === seasonNumber && e.episode_number >= 1 && e.episode_number <= aired).map((e) => e.episode_number));

  return { number: seasonNumber, watched: seen.size, total: structure.stale ? null : aired };
}

export function libraryProgress(input: {
  status: string;
  progress: TvProgress;
  structure: TvStructure;
  watched: WatchedEpisode[];
  completedSeasons: number;
}): LibraryProgress | null {
  const { status, progress, structure, watched, completedSeasons } = input;
  const regularWatched = watched.filter((e) => e.season_number >= 1).length;
  const base = { next: progress.next, season: null as LibraryProgress["season"] };

  if (progress.state === "rewatching") {
    return { ...base, state: "rewatching", card: null, title: "Reassistindo", detail: "O progresso desta nova passada não é registrado por episódio." };
  }

  if (regularWatched === 0) {
    if (completedSeasons > 0) {
      const label = completedSeasons === 1 ? "Temporada 1 concluída" : `Temporadas 1–${completedSeasons} concluídas`;
      const showOnCard = status === "watching" || status === "dropped" || status === "want";

      return { ...base, state: "legacy", card: showOnCard ? label : null, title: label, detail: "Episódios não foram registrados um a um." };
    }

    if (status === "watching" || status === "want") {
      const start = progress.next ? `Começa em ${episodeCode(progress.next.season, progress.next.episode)}` : null;

      return { ...base, state: "not_started", card: status === "watching" ? "Ainda não começou" : null, title: "Ainda não começou", detail: start };
    }

    // Assistido/Reassistido/Abandonei sem nenhum episódio registrado: não inventamos progresso.
    return null;
  }

  if (progress.state === "in_progress" && progress.next) {
    const season = seasonStats(structure, watched, progress.next.season);
    const fraction = season && season.total ? ` · ${season.watched}/${season.total}` : "";
    const code = episodeCode(progress.next.season, progress.next.episode);
    const totals = progress.total ? ` · ${progress.watched} de ${progress.total} no total` : "";
    const seasonDetail = season && season.total ? `${season.watched} de ${plural(season.total, "episódio", "episódios")} da temporada ${season.number}${totals}` : null;

    if (status === "dropped") {
      return { ...base, season, state: "in_progress", card: `Parou na T${progress.next.season}${fraction}`, title: `Parou na temporada ${progress.next.season}`, detail: seasonDetail };
    }

    return { ...base, season, state: "in_progress", card: `Próximo: ${code}${fraction}`, title: `Próximo episódio: ${code}`, detail: seasonDetail };
  }

  if (progress.state === "caught_up") {
    return { ...base, state: "caught_up", card: "Você está em dia", title: "Você está em dia", detail: `${plural(progress.watched, "episódio exibido assistido", "episódios exibidos assistidos")}. Novos episódios ainda não foram ao ar.` };
  }

  if (progress.state === "completed") {
    return { ...base, state: "completed", card: "Série concluída", title: "Série concluída", detail: `${progress.watched} de ${plural(progress.total ?? progress.watched, "episódio", "episódios")}` };
  }

  // unknown: só o fato (quantos assistidos), sem afirmar "em dia".
  const fact = plural(progress.watched || regularWatched, "episódio assistido", "episódios assistidos");

  return { ...base, state: "unknown", card: fact, title: fact, detail: "A lista de temporadas deste título pode estar desatualizada." };
}
