/*
 * V2.8 — perfil de gosto para "Para você" (funções puras, testáveis).
 *
 * Entrada: um sinal por título que o usuário tocou — da Biblioteca atual E do
 * histórico preservado fora dela (V2.5: activity_events/watch_entries/
 * episodes_progress continuam valendo depois de remover da Biblioteca).
 *
 * Peso de cada título (positivo = gosta, negativo = rejeitou):
 *   assistido / concluído / reassistindo ......... +1,0 sem nota (com nota, a nota decide)
 *   assistindo ................................... +0,8
 *   quero assistir ............................... +0,4  (intenção, não gosto)
 *   abandonado ................................... −3,0  (−2,0 se viu mais de 3 episódios)
 *   nota pessoal ................................. ratingWeight(nota, média pessoal)
 *        1º o significado ABSOLUTO: (nota − 5,5) × 0,9
 *             10 → +4,05 · 8 → +2,25 · 7 → +1,35 · 6 → +0,45 · 5 → −0,45 · 4 → −1,35 · 2 → −3,15
 *        2º a média pessoal (≥ 3 notas) só calibra a INTENSIDADE, nunca o sinal:
 *             × clamp(1 + 0,15 × (nota − média) × sinal, 0,6, 1,4)
 *             (um 8 de quem costuma dar 9–10 vale menos que um 10, mas continua positivo;
 *              um 6 de quem costuma dar 4–5 fica um pouco acima de neutro, não vira um 9)
 *        Monotônica: nota maior nunca pesa menos que nota menor no mesmo perfil.
 *   curtido ...................................... +3,0
 *   reassistido .................................. +2,0
 *   recência ..................................... × max(0,4; 0,5^(dias/540))
 * Sem nota = neutro (só a base do status). Nada disso é mostrado ao usuário.
 */
import { keysFromNames, type GenreKey } from "./genres";

export type MediaType = "movie" | "tv";

export type TitleSignal = {
  media_type: MediaType;
  tmdb_id: number;
  title: string;
  original_title?: string | null;
  genres: unknown;
  status: string | null;
  favorite: boolean;
  rating: number | null;
  rewatched: boolean;
  watched_history: boolean;
  episodes_watched: number;
  in_library: boolean;
  updated_at: string | Date | null;
};

export type WeightedTitle = TitleSignal & { key: string; weight: number; genreKeys: GenreKey[] };

export type Profile = {
  titles: WeightedTitle[];
  genre: Map<GenreKey, number>;
  movieShare: number;
  positiveCount: number;
  confidence: number;
  level: "cold" | "warm" | "full";
  mean: number | null;
  watched: Set<string>;
  inLibrary: Set<string>;
  anchors: WeightedTitle[];
  dropped: WeightedTitle[];
};

const WATCHED = new Set(["watched", "rewatched", "rewatching"]);
const DAY = 86_400_000;

export const titleKey = (mediaType: string, tmdbId: number | string) => `${mediaType}-${tmdbId}`;

/* média pessoal das notas; só existe (e só calibra) com 3 notas ou mais */
export function ratingMean(ratings: number[]): number | null {
  if (ratings.length < 3) return null;

  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

export function ratingWeight(rating: number, mean: number | null): number {
  const absolute = (rating - 5.5) * 0.9;

  if (mean === null || absolute === 0) return absolute;

  const factor = Math.min(1.4, Math.max(0.6, 1 + 0.15 * (rating - mean) * Math.sign(absolute)));

  return absolute * factor;
}

export function titleWeight(signal: TitleSignal, mean: number | null, now: number): number {
  const rating = signal.rating === null || signal.rating === undefined ? null : Number(signal.rating);
  const watched = WATCHED.has(signal.status || "") || signal.watched_history;
  let base = 0;

  if (signal.status === "dropped") base = signal.media_type === "tv" && signal.episodes_watched > 3 ? -2 : -3;
  else if (watched) base = rating === null ? 1 : 0;
  else if (signal.status === "watching") base = 0.8;
  else if (signal.status === "want") base = 0.4;

  let weight = base;

  if (rating !== null && Number.isFinite(rating)) weight += ratingWeight(rating, mean);
  if (signal.favorite) weight += 3;
  if (signal.rewatched || signal.status === "rewatched" || signal.status === "rewatching") weight += 2;

  const at = signal.updated_at ? new Date(signal.updated_at).getTime() : now;
  const age = Math.max(0, (now - (Number.isFinite(at) ? at : now)) / DAY);

  return weight * Math.max(0.4, Math.pow(0.5, age / 540));
}

export function buildProfile(signals: TitleSignal[], now = Date.now()): Profile {
  const mean = ratingMean(signals.map((s) => Number(s.rating)).filter((r) => Number.isFinite(r) && r > 0));
  const titles: WeightedTitle[] = signals.map((s) => ({
    ...s,
    key: titleKey(s.media_type, s.tmdb_id),
    weight: titleWeight(s, mean, now),
    genreKeys: keysFromNames(s.genres),
  }));
  const raw = new Map<GenreKey, number>();
  let movie = 0;
  let tv = 0;

  for (const t of titles) {
    if (t.genreKeys.length) {
      const share = t.weight / Math.sqrt(t.genreKeys.length);

      for (const g of t.genreKeys) raw.set(g, (raw.get(g) ?? 0) + share);
    }

    if (t.weight > 0) {
      if (t.media_type === "movie") movie += t.weight;
      else tv += t.weight;
    }
  }

  const max = Math.max(1e-9, ...[...raw.values()].map(Math.abs));
  const genre = new Map<GenreKey, number>([...raw].map(([g, v]) => [g, v / max]));
  // "quero assistir" é intenção: entra no gosto de gênero, não conta como sinal de gosto
  const positiveCount = titles.filter((t) => t.weight >= 0.75 && t.status !== "want").length;
  const level = positiveCount === 0 ? "cold" : positiveCount < 5 ? "warm" : "full";
  const strong = (t: WeightedTitle) =>
    t.weight >= 2 || (t.weight >= 1.5 && (t.favorite || (t.rating !== null && Number(t.rating) >= 8)));

  return {
    titles,
    genre,
    movieShare: (movie + 1) / (movie + tv + 2),
    positiveCount,
    confidence: Math.min(1, positiveCount / 8),
    level,
    mean,
    watched: new Set(titles.filter((t) => WATCHED.has(t.status || "") || t.watched_history).map((t) => t.key)),
    inLibrary: new Set(titles.filter((t) => t.in_library).map((t) => t.key)),
    anchors: titles
      .filter((t) => t.status !== "want" && t.status !== "dropped" && strong(t))
      .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
      .slice(0, 12),
    dropped: titles
      .filter((t) => t.weight < 0)
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()),
  };
}

/* gêneros com afinidade positiva, do mais forte ao mais fraco */
export function topGenres(profile: Profile, limit = 6): GenreKey[] {
  return [...profile.genre]
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([g]) => g);
}

/* ---------- rotação de âncoras: estável no dia, varia entre dias ---------- */
export function hashSeed(text: string): number {
  let h = 2166136261;

  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);

  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed || 1;

  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Ordem do dia para os títulos-âncora: amostragem ponderada sem reposição
 * (os mais fortes tendem a vir antes, mas o mesmo curtido não lidera para
 * sempre) + diversidade (evita âncoras seguidas com o mesmo gênero principal) +
 * proporção de tipos do perfil. A página N usa a fatia N dessa ordem.
 */
export function anchorOrder(profile: Profile, seedText: string): WeightedTitle[] {
  const random = rng(hashSeed(seedText));
  const keyed = profile.anchors
    .map((t) => ({ t, k: -Math.log(1 - random()) / Math.max(0.1, t.weight) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.t);
  const out: WeightedTitle[] = [];
  const rest = [...keyed];
  let tvCount = 0;

  while (rest.length) {
    const lastMain = out[out.length - 1]?.genreKeys[0];
    const wantTv = out.length > 0 && tvCount / out.length < 1 - profile.movieShare - 0.2;
    const wantMovie = out.length > 0 && tvCount / out.length > 1 - profile.movieShare + 0.2;
    let index = rest.findIndex(
      (t) =>
        (!lastMain || t.genreKeys[0] !== lastMain) &&
        (!wantTv || t.media_type === "tv") &&
        (!wantMovie || t.media_type === "movie")
    );

    if (index < 0) index = rest.findIndex((t) => !lastMain || t.genreKeys[0] !== lastMain);
    if (index < 0) index = 0;

    const [pick] = rest.splice(index, 1);

    out.push(pick);
    if (pick.media_type === "tv") tvCount += 1;
  }

  return out;
}

/* quantas âncoras por página: só o que os dados sustentam */
export function anchorsPerPage(profile: Profile): number {
  if (profile.level === "cold") return 0;
  if (profile.level === "warm") return Math.min(1, profile.anchors.length);

  return Math.min(3, profile.anchors.length);
}
