import type { CalendarEvent } from "@/lib/calendar/types";

/*
 * Textos dos eventos — UM lugar só. Regras:
 *  - o tipo diz O QUE acontece; o detalhe diz QUAL (T3:E04, Temporada 3);
 *  - a linha pessoal diz POR QUE importa (uma mensagem, a mais útil);
 *  - nada repetido (ex.: "Estreia de série" + "Nova série estreando").
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function typeLabel(e: CalendarEvent) {
  switch (e.type) {
    case "movie_release":
      return "Estreia de filme";
    case "series_premiere":
      return "Estreia de série";
    case "season_premiere":
      return "Nova temporada";
    case "season_release":
      return "Temporada disponível";
    default:
      return e.episode_count > 1 ? `${e.episode_count} episódios novos` : "Novo episódio";
  }
}

export function detailLabel(e: CalendarEvent): string | null {
  const s = e.season_number;

  switch (e.type) {
    case "episode_release":
      if (!s || !e.episode_from) return null;

      return e.episode_count > 1 && e.episode_to && e.episode_to !== e.episode_from
        ? `T${s}:E${pad(e.episode_from)}–E${pad(e.episode_to)}`
        : `T${s}:E${pad(e.episode_from)}`;
    case "season_premiere":
      return s ? `Temporada ${s}${e.episode_count > 1 ? ` · ${e.episode_count} episódios` : ""}` : null;
    case "season_release":
      return s ? `Temporada ${s} · ${e.episode_count} episódios` : null;
    case "movie_release":
      return e.release_label;
    default:
      return null;
  }
}

/** Por que este evento importa para você (uma mensagem, ou nada). */
export function personalLine(e: CalendarEvent): string | null {
  if (e.watched) return "✓ Assistido";

  if (e.relationship === "following") {
    switch (e.progress?.kind) {
      case "caught_up":
        return "Você está em dia";
      case "behind":
        return `Faltam ${e.progress.episodes} ${e.progress.episodes === 1 ? "episódio" : "episódios"} para chegar aqui`;
      case "in_season":
        return `Você está na T${e.progress.season}`;
      case "not_started":
        return "Você ainda não começou";
      default:
        return "Você acompanha";
    }
  }

  if (e.relationship === "watchlist") return "Na sua watchlist";
  if (e.relationship === "library") return "Na sua biblioteca";

  return null;
}

export function eventAria(e: CalendarEvent) {
  return [e.title, typeLabel(e), detailLabel(e), personalLine(e)].filter(Boolean).join(", ");
}
