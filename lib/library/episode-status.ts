import type { TvProgress, TvStructure, WatchedEpisode } from "../tv-progress";

/*
 * V3.1 — estado DERIVADO de uma série depois de marcar/desmarcar episódios.
 *
 * Fonte: o progresso canônico (computeTvProgress — especiais fora, episódio
 * não exibido não conta, "completed" só em série encerrada/cancelada com
 * estrutura não desatualizada), calculado com os episódios JÁ incluindo a
 * escrita. Nada vem do cliente (antes: `total_seasons`/`released_episode_count`
 * enviados pela UI decidiam "concluiu a série").
 *
 * Regra (determinística; sem coluna de proveniência — não sabemos se um
 * "Assistido" foi manual ou derivado, então a regra só age quando o status
 * contradiz o fato):
 *  - Reassistindo / Reassistido: nunca mudam por episodes_progress (o produto
 *    não tem progresso por episódio de reassistida; V3.0).
 *  - série COMPLETA (encerrada + tudo exibido visto) e marcou episódio →
 *    Assistido (de Quero assistir, Assistindo, Pausado, Abandonado).
 *  - marcou episódio e a série NÃO está completa:
 *      Quero assistir / Pausado / Abandonado → Assistindo (assistir é retomar);
 *      Assistido com próximo episódio disponível → Assistindo (senão o painel
 *        diria "Assistido" + "Próximo episódio");
 *      Assistido em dia (série no ar, nada novo exibido) → continua Assistido;
 *      Assistindo → continua (inclusive "em dia": série em exibição NÃO vira
 *        Assistido só por estar em dia).
 *  - desmarcou episódio: Assistido que deixou de estar completo e tem próximo
 *    → Assistindo; os demais ficam como estão (desmarcar é correção, não
 *    "parei de assistir").
 *  - estrutura desconhecida/desatualizada ("unknown"): só a retomada
 *    (Quero assistir/Pausado/Abandonado → Assistindo) ao marcar; nada de
 *    concluir.
 * Nunca gera status_changed: o Diário conta o FATO (episódios), não a
 * consequência.
 */

export type EpisodeAction = "watch" | "unwatch";

const RESUMES = new Set(["want", "paused", "dropped"]);

export function deriveSeriesStatus(previous: string, action: EpisodeAction, progress: TvProgress): string {
  if (previous === "rewatching" || previous === "rewatched") return previous;

  const completed = progress.state === "completed";
  const hasNext = Boolean(progress.next) && (progress.state === "in_progress" || progress.state === "not_started");

  if (action === "watch") {
    if (completed) return "watched";
    if (RESUMES.has(previous)) return "watching";
    if (previous === "watched" && hasNext) return "watching";

    return previous;
  }

  if (previous === "watched" && !completed && hasNext) return "watching";

  return previous;
}

/**
 * Campos legados (`completed_seasons`, `current_season`) — usados pelo
 * progresso "legado" e por telas antigas. Derivados dos MESMOS fatos:
 * temporadas regulares consecutivas desde a T1 inteiramente exibidas e
 * vistas; temporada atual = a do próximo episódio, senão a seguinte à última
 * completa (limitada à última conhecida).
 */
export function deriveSeasonFields(structure: TvStructure, watched: WatchedEpisode[], progress: TvProgress) {
  const seen = new Set(watched.filter((e) => e.season_number >= 1).map((e) => `${e.season_number}:${e.episode_number}`));
  const through = structure.aired_through;
  let completed = 0;

  for (const season of structure.seasons) {
    if (season.season_number !== completed + 1) break;

    const fullyAired = !through || season.season_number < through.season || (season.season_number === through.season && through.episode >= season.episode_count);

    if (!fullyAired) break;

    let all = true;

    for (let e = 1; e <= season.episode_count; e++) {
      if (!seen.has(`${season.season_number}:${e}`)) {
        all = false;
        break;
      }
    }

    if (!all) break;

    completed = season.season_number;
  }

  const lastSeason = structure.seasons.length ? structure.seasons[structure.seasons.length - 1].season_number : Math.max(1, completed);
  const current = progress.next?.season ?? Math.max(1, Math.min(completed + 1, lastSeason));

  return { completed_seasons: completed, current_season: current };
}
