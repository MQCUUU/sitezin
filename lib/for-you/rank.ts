/*
 * V2.8 — ranking de candidatos de "Para você" (funções puras, testáveis).
 *
 * O TMDB GERA candidatos (recomendações de um título, discover por gênero,
 * em alta, lançamentos); a ORDEM e a escolha são pessoais:
 *
 *   score = confiança × (2,0 × afinidade de gênero + 0,6 × afinidade de tipo)
 *         + 0,5 × (nota bayesiana − 6,5)          ← qualidade com confiança nos votos
 *         + prior da fonte                         ← ex.: posição na lista de similares
 *         − 1,5 se parecido com algo que você abandonou
 *
 * "confiança" cresce com o número de sinais (0 → 1 em 8 títulos): com poucos
 * dados a qualidade pesa mais e a personalização não é fingida.
 */
import { keysFromIds, GENRE_LABEL, type GenreKey } from "./genres";
import type { MediaType, Profile } from "./profile";

export type Candidate = {
  id: number;
  media_type: MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  [extra: string]: unknown;
};

export type Scored = Candidate & { franchise_override?: string; key: string; genreKeys: GenreKey[]; score: number; bayes: number; affinity: number; bestGenre: GenreKey | null };

export const BAYES_M = 300;
export const BAYES_C = 6.6;

/* nota bayesiana: 9,8 com 3 votos não vence 8,2 com milhares */
export function bayes(voteAverage: unknown, voteCount: unknown, m = BAYES_M, c = BAYES_C): number {
  const v = Math.max(0, Number(voteCount) || 0);
  const r = Number(voteAverage) || 0;

  return (v / (v + m)) * r + (m / (v + m)) * c;
}

export function genreAffinity(profile: Profile, keys: GenreKey[]): { value: number; best: GenreKey | null } {
  if (!keys.length) return { value: 0, best: null };

  const values = keys.map((k) => profile.genre.get(k) ?? 0);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const bestIndex = values.indexOf(max);

  return { value: 0.6 * max + 0.4 * mean, best: max > 0.05 ? keys[bestIndex] : null };
}

export function typeAffinity(profile: Profile, mediaType: MediaType): number {
  const share = mediaType === "movie" ? profile.movieShare : 1 - profile.movieShare;

  return (share - 0.5) * 2;
}

export function scoreCandidate(
  profile: Profile,
  c: Candidate,
  opts: { prior?: number; nearDropped?: boolean } = {}
): Scored {
  const genreKeys = keysFromIds(c.media_type, c.genre_ids);
  const aff = genreAffinity(profile, genreKeys);
  const quality = bayes(c.vote_average, c.vote_count);
  const score =
    profile.confidence * (2 * aff.value + 0.6 * typeAffinity(profile, c.media_type)) +
    0.5 * (quality - 6.5) +
    (opts.prior ?? 0) -
    (opts.nearDropped ? 1.5 : 0);

  return { ...c, key: `${c.media_type}-${c.id}`, genreKeys, score, bayes: quality, affinity: aff.value, bestGenre: aff.best };
}

/* ---------- franquia / IP ---------- */
const ARTICLES = new Set(["the", "a", "an", "o", "os", "as", "um", "uma", "el", "la", "los", "las", "le", "les", "der", "die", "das"]);
const GENERIC = new Set([
  "star", "love", "last", "dark", "black", "new", "big", "little", "good", "great", "life", "world", "night", "day",
  "one", "two", "all", "my", "your", "our", "his", "her", "man", "girl", "boy", "house", "home", "dead", "red",
  "blue", "white", "king", "queen", "lost", "young", "high", "american", "first", "true", "real", "secret",
]);

const normWords = (raw: string) =>
  raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const ROMAN = /^(ii|iii|iv|v|vi|vii|viii|ix|x)$/;

/*
 * Chave de IP de um título: o título principal (antes de ":" / " - "), sem artigo
 * inicial e sem numeração final — "Rush Hour 2" = "Rush Hour 3", "The Batman" =
 * "Batman", mas "John Wick" ≠ "John Carter".
 */
export function franchiseKey(c: Pick<Candidate, "original_title" | "original_name" | "title" | "name">): string {
  // título original em alfabeto não latino (coreano, japonês…) → usa o título localizado
  const main = (raw: unknown) => normWords(String(raw || "").split(/:| - | – | — |\(/)[0]);
  let words = main(c.original_title || c.original_name);

  if (!words.length) words = main(c.title || c.name);

  while (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  while (words.length > 1 && (/^\d+$/.test(words[words.length - 1]) || ROMAN.test(words[words.length - 1]) || words[words.length - 1] === "part")) words.pop();

  return words.join(" ");
}

/* palavra que identifica a franquia de um título-âncora ("batman"); vazia se genérica */
export function anchorWord(title: string): string {
  const words = normWords(title).filter((w) => !ARTICLES.has(w));
  const first = words[0] ?? "";

  return first.length >= 4 && !GENERIC.has(first) && !/^\d+$/.test(first) ? first : "";
}

/* ---------- elegibilidade (conteúdo derivado/sem metadados) ---------- */
const DERIVED =
  /\b(lyric|lyrics|compila[cç][aã]o|compilation|making of|behind the scenes|bastidores|recap|resumo|bloopers|gag reel|trailer|teaser|music video|videoclipe)\b/i;
// show ao vivo só é "derivado" quando o próprio TMDB o classifica como música/documentário
const LIVE = /\b(ao vivo|live at|live in|in concert|concert film)\b/i;

export function isEligible(c: Candidate, strict: boolean): boolean {
  if (!c.poster_path) return false;
  if (!Array.isArray(c.genre_ids) || c.genre_ids.length === 0) return false;
  if (!strict) return true;

  const text = `${c.title || c.name || ""} ${c.original_title || c.original_name || ""}`;

  const musicOrDoc = c.genre_ids.some((id) => Number(id) === 10402 || Number(id) === 99);

  return Boolean(String(c.overview || "").trim()) && !DERIVED.test(text) && !(musicOrDoc && LIVE.test(text));
}

/* ---------- ordenação escolhida pelo usuário ---------- */
export type SortMode = "recommended" | "rating" | "popular" | "newest" | "hidden";

const dateOf = (c: Candidate) => String(c.release_date || c.first_air_date || "");

export function sortScored(list: Scored[], sort: SortMode): Scored[] {
  const out = [...list];

  if (sort === "rating") out.sort((a, b) => b.bayes - a.bayes || b.score - a.score);
  else if (sort === "popular") out.sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
  else if (sort === "newest") out.sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || b.score - a.score);
  // menos conhecidos, mas nunca lixo obscuro: só os que têm nota com confiança
  else if (sort === "hidden")
    out.sort((a, b) => Number(a.bayes < 7) - Number(b.bayes < 7) || Number(a.popularity || 0) - Number(b.popularity || 0));
  else out.sort((a, b) => b.score - a.score || Number(b.vote_count || 0) - Number(a.vote_count || 0));

  return out;
}

/*
 * Monta uma prateleira:
 *  - dedup GLOBAL (`used`): o mesmo título nunca aparece duas vezes no feed;
 *    quem monta primeiro (razão mais específica) fica com ele;
 *  - teto de franquia: no máximo `franchiseCap` títulos do mesmo IP por prateleira
 *    (inclui a franquia do próprio título-âncora);
 *  - cota de tipo em prateleiras mistas, seguindo o perfil (20%–80%, folga de 1).
 */
export function assemble(
  ranked: Scored[],
  opts: {
    used: Set<string>;
    limit?: number;
    franchiseCap?: number;
    reservedFranchise?: string[];
    movieShare?: number | null;
  }
): Scored[] {
  const limit = opts.limit ?? 10;
  const cap = opts.franchiseCap ?? 2;
  const counts = new Map<string, number>();
  const out: Scored[] = [];
  const reserved = new Set((opts.reservedFranchise ?? []).filter(Boolean));
  const quota =
    opts.movieShare === null || opts.movieShare === undefined
      ? null
      : (() => {
          const movies = Math.round(limit * Math.min(0.8, Math.max(0.2, opts.movieShare)));

          return { movie: movies + 1, tv: limit - movies + 1 };
        })();
  const typeCount = { movie: 0, tv: 0 };
  const pool = ranked.filter((c) => !opts.used.has(c.key));
  const skipped: Scored[] = [];

  // irmãos da coleção do título-âncora (TMDB belongs_to_collection) contam como a franquia dele
  const bucketOf = (c: Scored) => {
    if (c.franchise_override) return "anchor";

    const fk = franchiseKey(c);

    if (reserved.size) {
      const words = new Set(normWords(`${c.original_title || c.original_name || ""} ${c.title || c.name || ""}`));

      for (const w of reserved) if (words.has(w)) return "anchor";
    }

    return fk;
  };

  for (const c of pool) {
    if (out.length >= limit) break;

    const bucket = bucketOf(c);

    if (bucket && (counts.get(bucket) ?? 0) >= cap) continue;
    if (quota && typeCount[c.media_type] >= quota[c.media_type]) {
      skipped.push(c);
      continue;
    }

    out.push(c);
    typeCount[c.media_type] += 1;
    if (bucket) counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  // cota não pode esvaziar a prateleira: completa com os que sobraram
  for (const c of skipped) {
    if (out.length >= limit) break;

    const bucket = bucketOf(c);

    if (bucket && (counts.get(bucket) ?? 0) >= cap) continue;

    out.push(c);
    if (bucket) counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  for (const c of out) opts.used.add(c.key);

  return out;
}

export const genreLabel = (key: GenreKey | null) => (key ? GENRE_LABEL[key] : null);

/*
 * Diversidade Filmes × Séries no FEED FINAL (aba "Tudo").
 *
 * A cota de `assemble` é só um TETO por prateleira mista e as prateleiras
 * "Porque você gostou de X" são de um tipo só; por isso o feed podia terminar
 * fora de 20%–80% (ex.: perfil 20/80 → 14% filmes). Aqui, depois de montar e de
 * remover prateleiras fracas:
 *   1. se a fração de um tipo está abaixo de `min` (ou acima de `max`), troca o
 *      card de MENOR posição do tipo majoritário em uma prateleira mista pelo
 *      melhor candidato AINDA NÃO USADO do tipo minoritário do MESMO pool dessa
 *      prateleira (o pool já passou por qualidade, elegibilidade e afinidade —
 *      nada de qualidade mais baixa para bater cota);
 *   2. respeita dedup global e o teto de franquia da prateleira;
 *   3. sem candidato elegível, para e devolve `relaxed` (escassez real, explícita).
 * Determinístico: sempre o candidato de maior score; empate → prateleira anterior.
 */
export type BuiltShelf = { mixed: boolean; picked: Scored[]; pool: Scored[] };

export function typeCounts(list: Pick<Candidate, "media_type">[]) {
  const movie = list.filter((c) => c.media_type === "movie").length;

  return { movie, tv: list.length - movie, share: list.length ? movie / list.length : 0 };
}

export function balanceTypes(
  shelves: BuiltShelf[],
  opts: { used: Set<string>; sort: SortMode; min?: number; max?: number; franchiseCap?: number }
): { swaps: number; relaxed: null | { type: MediaType; missing: number } } {
  const min = opts.min ?? 0.2;
  const max = opts.max ?? 0.8;
  const cap = opts.franchiseCap ?? 2;
  let swaps = 0;

  for (;;) {
    const all = shelves.flatMap((s) => s.picked);
    const { movie, share } = typeCounts(all);

    if (!all.length || (share >= min && share <= max)) return { swaps, relaxed: null };

    const minority: MediaType = share < min ? "movie" : "tv";
    const majority: MediaType = minority === "movie" ? "tv" : "movie";
    const needed = minority === "movie" ? Math.ceil(min * all.length) - movie : movie - Math.floor(max * all.length);
    let best: { shelf: BuiltShelf; incoming: Scored; outgoing: Scored } | null = null;

    for (const shelf of shelves) {
      if (!shelf.mixed) continue;

      const outgoing = [...shelf.picked].reverse().find((c) => c.media_type === majority);

      if (!outgoing) continue;

      const counts = new Map<string, number>();

      for (const c of shelf.picked) {
        if (c === outgoing) continue;
        const k = franchiseKey(c);
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }

      const incoming = shelf.pool.find((c) => {
        if (c.media_type !== minority || opts.used.has(c.key)) return false;
        const k = franchiseKey(c);
        return !k || (counts.get(k) ?? 0) < cap;
      });

      if (incoming && (!best || incoming.score > best.incoming.score)) best = { shelf, incoming, outgoing };
    }

    if (!best) return { swaps, relaxed: { type: minority, missing: needed } };

    best.shelf.picked = sortScored(
      [...best.shelf.picked.filter((c) => c !== best.outgoing), best.incoming],
      opts.sort
    );
    opts.used.delete(best.outgoing.key);
    opts.used.add(best.incoming.key);
    swaps += 1;
  }
}
