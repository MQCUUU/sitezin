/*
 * Busca V3.2 — regras PURAS de relevância de títulos, identidade e
 * desambiguação, compartilhadas pelo dropdown (/api/search/suggest) e pela
 * página completa (/api/search/advanced). Testadas em scripts/test-search.mjs.
 *
 * O que NÃO há aqui (de propósito): fuzzy de título (o TMDB não tolera typo de
 * título e não criamos índice próprio), personalização por gosto (Busca é
 * neutra) ou "estar na Biblioteca" como bônus.
 */

export const MIN_QUERY_LENGTH = 2;

/** Mesma normalização já usada pelas rotas: sem acento, minúsculas, pontuação vira espaço. */
export function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Query pesquisável: 2+ caracteres depois de tirar espaços (e o "@" de usuário). */
export function isSearchable(query: unknown) {
  return String(query ?? "").trim().replace(/^@+/, "").trim().length >= MIN_QUERY_LENGTH;
}

function levenshtein(x: string, y: string) {
  if (!x) return y.length;
  if (!y) return x.length;

  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);

  for (let i = 1; i <= x.length; i++) {
    let diagonal = prev[0];

    prev[0] = i;

    for (let j = 1; j <= y.length; j++) {
      const above = prev[j];

      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (x[i - 1] === y[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }

  return prev[y.length];
}

export function similarity(a: string, b: string) {
  const x = normalizeSearch(a).replace(/\s+/g, "");
  const y = normalizeSearch(b).replace(/\s+/g, "");

  if (!x || !y) return 0;

  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

type TitleLike = {
  id?: unknown;
  media_type?: unknown;
  title?: unknown;
  name?: unknown;
  original_title?: unknown;
  original_name?: unknown;
  popularity?: unknown;
  vote_count?: unknown;
};

/** Título exibido (PT-BR quando o TMDB tem) e o original — os dois identificam a obra. */
export function titleVariants(item: TitleLike): string[] {
  const out: string[] = [];

  for (const value of [item.title, item.name, item.original_title, item.original_name]) {
    const text = typeof value === "string" ? value.trim() : "";

    if (text && !out.some((v) => normalizeSearch(v) === normalizeSearch(text))) out.push(text);
  }

  return out;
}

export function isExactTitle(query: string, item: TitleLike) {
  const q = normalizeSearch(query);

  return Boolean(q) && titleVariants(item).some((v) => normalizeSearch(v) === q);
}

/**
 * Relevância de um título para a query (mesma escala da regra anterior):
 * exato (+500) > começa com (+180) > contém (+90), mais a semelhança de
 * texto; V3.2: vale o MELHOR entre o título localizado e o ORIGINAL — buscar
 * "Interstellar" acha "Interestelar" como exato. Popularidade/votos só
 * desempatam dentro do mesmo nível.
 */
export function titleMatchScore(query: string, item: TitleLike) {
  const q = normalizeSearch(query);
  let best = 0;

  for (const variant of titleVariants(item)) {
    const t = normalizeSearch(variant);
    let score = similarity(q, t) * 100;

    if (q === t) score += 500;
    else if (t.startsWith(q)) score += 180;
    else if (t.includes(q)) score += 90;

    best = Math.max(best, score);
  }

  return (
    best +
    Math.log10(Number(item.popularity || 0) + 1) * 8 +
    Math.log10(Number(item.vote_count || 0) + 1) * 4
  );
}

/** Identidade canônica de mídia: tipo + id do TMDB (nunca título + ano). */
export function mediaIdentity(item: TitleLike) {
  return `${item.media_type}:${item.id}`;
}

/** Remove repetições da MESMA obra (mesma identidade); homônimos com ids diferentes ficam. */
export function dedupeMedia<T extends TitleLike>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = mediaIdentity(item);

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}

/** Filmes/séries ordenados por relevância (estável: empate mantém a ordem do TMDB), sem duplicatas. */
export function rankTitles<T extends TitleLike>(query: string, items: T[]): (T & { _score: number })[] {
  return dedupeMedia(items.filter((item) => item.media_type === "movie" || item.media_type === "tv"))
    .map((item, index) => ({ ...item, _score: titleMatchScore(query, item), _index: index }))
    .sort((a, b) => b._score - a._score || a._index - b._index)
    .map(({ _index, ...item }) => item as T & { _score: number });
}

type PersonLike = { name?: unknown; popularity?: unknown };

/** Popularidade TMDB mínima para uma pessoa "conhecida" (Tom Hanks ~ 50+; homônimos obscuros < 1). */
export const NOTABLE_PERSON_POPULARITY = 8;

/**
 * Personagem que é a própria pessoa ("Tom Hanks" fazendo ele mesmo em Os
 * Simpsons): se a query é exatamente o nome de uma pessoa CONHECIDA e o
 * personagem encontrado tem esse mesmo nome, a intenção é a pessoa — o
 * personagem não pode tirá-la do resultado.
 */
export function isSelfPortrayal(query: string, characterName: unknown, people: PersonLike[]) {
  const q = normalizeSearch(query);

  if (!q || normalizeSearch(characterName) !== q) return false;

  return people.some((p) => normalizeSearch(p.name) === q && Number(p.popularity || 0) >= NOTABLE_PERSON_POPULARITY);
}

/**
 * Texto honesto sobre o recorte: a busca mostra os mais relevantes da
 * primeira página do TMDB; quando há mais, dizemos (sem paginação).
 */
export function resultCountLabel(shown: number, total: number | null | undefined) {
  const word = shown === 1 ? "título" : "títulos";

  // `total` é o total do TMDB para a busca (inclui pessoas): por isso "resultados", não "títulos".
  if (total && total > shown) return `Os ${shown} ${word} mais relevantes entre ${total} resultados. Refine a busca para encontrar outros.`;

  return `${shown} ${word} ${shown === 1 ? "encontrado" : "encontrados"}.`;
}
