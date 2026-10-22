import { inRange } from "./period";
import type { DayRange, EventRow, LibRow, SourceStat, ToolStat } from "./types";

/*
 * Recomendações e descoberta — funções puras sobre user_events + biblioteca.
 *
 * Modelo de eventos (ver db/legacy/supabase/v2.3-insights.sql):
 *   rec_shown / rec_opened / rec_dismissed — 1 por EXPOSIÇÃO (exposure)
 *   library_added — 1 por ENTRADA na biblioteca, com a origem ATRIBUÍDA
 *     (last-touch por interação: clique dentro da ferramenta, ou o clique que
 *     levou à página do título; validado no servidor contra a exposição)
 *
 * Métricas por ferramenta (sem "taxa de acerto" única):
 *   exibidas    títulos distintos que apareceram (≥ 50% visíveis por ≥ 600 ms)
 *   exposições  quantas vezes apareceram (exposições distintas)
 *   abertas     títulos abertos a partir da ferramenta
 *   salvas      adições ATRIBUÍDAS à ferramenta
 *   começou     saiu de "Quero assistir" (ou tem episódio marcado)
 *   assistiu    filme assistido / série com episódio marcado (não abandonada)
 *   gostou      assistiu E (nota ≥ 7,5 OU curtido)
 */

export const TOOLS = ["assistant", "pick", "smart_queue", "for_you"] as const;
export const LIKED_THRESHOLD = 7.5;

const WATCHED = new Set(["watched", "rewatched", "rewatching"]);
const keyOf = (type: string, id: number) => `${type}-${id}`;
const round1 = (v: number) => Math.round(v * 10) / 10;

function outcome(row: LibRow, episodes: number) {
  const started = row.status !== "want" || episodes > 0;
  const watched = WATCHED.has(row.status) || (row.type === "tv" && episodes > 0 && row.status !== "dropped");
  const liked = watched && ((row.rating !== null && row.rating >= LIKED_THRESHOLD) || row.favorite);

  return { started, watched, liked };
}

/**
 * A adição que corresponde à entrada ATUAL do título na biblioteca: a mais
 * recente no dia em que o item entrou ou depois (remover e adicionar de novo
 * gera outra entrada; a antiga deixa de valer).
 */
function currentAdds(events: EventRow[], byKey: Map<string, LibRow>, range: DayRange) {
  const adds = new Map<string, EventRow>();

  for (const e of events) {
    if (e.kind !== "library_added") continue;

    const key = keyOf(e.type, e.tmdb_id);
    const row = byKey.get(key);

    if (!row || e.day < row.added_day || !inRange(e.day, range)) continue;

    const prev = adds.get(key);

    if (!prev || e.day >= prev.day) adds.set(key, e);
  }

  return adds;
}

export function recommendationStats(events: EventRow[], lib: LibRow[], episodes: Map<number, number>, range: DayRange) {
  const byKey = new Map(lib.map((r) => [keyOf(r.type, r.tmdb_id), r]));
  const titles = new Map<string, Set<string>>();
  const exposures = new Map<string, Set<string>>();
  const opened = new Map<string, Set<string>>();
  const dismissed = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, tool: string, value: string) => {
    const set = map.get(tool) ?? new Set<string>();

    set.add(value);
    map.set(tool, set);
  };

  for (const e of events) {
    if (!inRange(e.day, range)) continue;

    const key = keyOf(e.type, e.tmdb_id);

    if (e.kind === "rec_shown") {
      add(titles, e.source, key);
      add(exposures, e.source, e.exposure ?? `${key}|legacy`);
    }

    if (e.kind === "rec_opened") add(opened, e.source, key);
    if (e.kind === "rec_dismissed") add(dismissed, e.source, key);
  }

  const tools: ToolStat[] = TOOLS.map((tool) => ({
    tool,
    shown: titles.get(tool)?.size ?? 0,
    exposures: exposures.get(tool)?.size ?? 0,
    opened: opened.get(tool)?.size ?? 0,
    added: 0,
    started: 0,
    watched: 0,
    liked: 0,
    avgRating: null,
    dismissed: dismissed.get(tool)?.size ?? 0,
  }));
  const ratings = new Map<string, number[]>();
  const monthly = new Map<string, { watched: number; liked: number }>();

  for (const [key, e] of currentAdds(events, byKey, range)) {
    const stat = tools.find((t) => t.tool === e.source);
    const row = byKey.get(key);

    if (!stat || !row) continue;

    const result = outcome(row, episodes.get(row.media_id) ?? 0);

    stat.added += 1;
    if (result.started) stat.started += 1;
    if (!result.watched) continue;

    stat.watched += 1;
    if (result.liked) stat.liked += 1;
    if (row.rating !== null) ratings.set(stat.tool, [...(ratings.get(stat.tool) ?? []), Number(row.rating)]);

    const month = (row.watched_day ?? row.updated_day).slice(0, 7);
    const m = monthly.get(month) ?? { watched: 0, liked: 0 };

    m.watched += 1;
    if (result.liked) m.liked += 1;
    monthly.set(month, m);
  }

  for (const stat of tools) {
    const list = ratings.get(stat.tool) ?? [];

    stat.avgRating = list.length >= 3 ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null;
  }

  return {
    since: events.map((e) => e.day).sort()[0] ?? null,
    tools,
    monthly: [...monthly.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, v]) => ({ month, ...v })),
  };
}

export function discoveryStats(events: EventRow[], lib: LibRow[], episodes: Map<number, number>, range: DayRange): SourceStat[] {
  const byKey = new Map(lib.map((r) => [keyOf(r.type, r.tmdb_id), r]));
  const map = new Map<string, SourceStat & { ratings: number[] }>();

  for (const [key, e] of currentAdds(events, byKey, range)) {
    const row = byKey.get(key) as LibRow;
    const stat = map.get(e.source) ?? { source: e.source, added: 0, watched: 0, liked: 0, avgRating: null, ratings: [] };
    const result = outcome(row, episodes.get(row.media_id) ?? 0);

    stat.added += 1;
    if (result.watched) stat.watched += 1;
    if (result.liked) stat.liked += 1;
    if (result.watched && row.rating !== null) stat.ratings.push(Number(row.rating));
    map.set(e.source, stat);
  }

  return [...map.values()]
    .map(({ ratings, ...s }) => ({
      ...s,
      avgRating: ratings.length >= 3 ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
    }))
    .sort((a, b) => b.added - a.added);
}
