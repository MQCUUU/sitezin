/*
 * Fase 2 (P2-04) — relevância das sugestões da barra de busca.
 *
 * A barra serve principalmente para achar TÍTULOS. Duas regras:
 *
 * 1. "Pessoas" são pessoas do cinema/TV. O TMDB devolve no /search/person
 *    perfis que são produtoras, departamentos ou entidades ("Intersect"
 *    [Production], "The DA's Office" [Sound], "Representative of …" [Acting]).
 *    Entra quem atua/dirige/escreve com alguma relevância, ou quem tem o
 *    nome EXATAMENTE igual ao buscado (mesmo pouco popular).
 *
 * 2. Os grupos (Títulos, Pessoas, Personagem, Franquias, Usuários) são
 *    ordenados pela força da correspondência do MELHOR item de cada um:
 *    exato > prefixo forte > resto. Empate favorece títulos. Assim
 *    "interst" mostra Interestelar primeiro e "Christopher Nolan" mostra a
 *    pessoa primeiro. A barra e o teclado seguem exatamente esta ordem.
 */
import { isExactTitle, normalizeSearch, similarity, titleVariants } from "./rank";

export const RELEVANT_PERSON_DEPARTMENTS = new Set(["Acting", "Directing", "Writing", "Creator"]);
/** Abaixo disso, um nome só parecido é ruído (perfis vazios/entidades têm ~0,2–0,4). */
export const MIN_PERSON_POPULARITY = 0.5;
/** Nome quase igual ao buscado (erro de digitação: "tom holand" → Tom Holland). */
export const TYPO_SIMILARITY = 0.85;
/** Pessoa conhecida o bastante para aparecer mesmo com personagem homônimo exato. */
export const KNOWN_PERSON_POPULARITY = 2;

type PersonLike = { name?: unknown; known_for_department?: unknown; popularity?: unknown };

export function isExactPersonName(query: string, person: PersonLike) {
  const q = normalizeSearch(query);
  return Boolean(q) && normalizeSearch(person.name) === q;
}

/** Pessoa que pode aparecer no grupo "Pessoas" das sugestões. */
export function isRelevantPerson(query: string, person: PersonLike) {
  if (isExactPersonName(query, person)) return true;
  if (!RELEVANT_PERSON_DEPARTMENTS.has(String(person.known_for_department || ""))) return false;
  return Number(person.popularity || 0) >= MIN_PERSON_POPULARITY;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Suggestion = { kind: string; [key: string]: any };

const KIND_ORDER = ["media", "person", "character", "collection", "user"];

function startsWithQuery(query: string, values: unknown[]) {
  const q = normalizeSearch(query);
  return Boolean(q) && values.some((value) => normalizeSearch(value).startsWith(q));
}

/** Algum termo da busca é uma palavra inteira do nome ("nolan" → Christopher Nolan). */
function tokenIsNameWord(query: string, name: unknown) {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  const words = new Set(normalizeSearch(name).split(" ").filter(Boolean));
  return tokens.length > 0 && tokens.every((token) => words.has(token));
}

/** Todos os termos da busca começam palavras do nome ("christopher nol" → Christopher Nolan). */
function tokensPrefixName(query: string, name: unknown) {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  const words = normalizeSearch(name).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => words.some((word) => word.startsWith(token)));
}

type TitleArg = Parameters<typeof isExactTitle>[1];

/**
 * Força da correspondência do melhor item do grupo: 0 = exato … maior = mais
 * fraco. 0,5 = pessoa conhecida cujo nome contém o termo como palavra inteira
 * ("nolan", "cavill"): vem antes de títulos que só começam com o termo, depois
 * de título/personagem exatos. 1,5 = pessoa conhecida com o nome quase igual
 * (typo): antes de títulos que só contêm/relacionam o termo.
 */
function groupTier(query: string, kind: string, items: Suggestion[]): number {
  const best = (score: (item: Suggestion) => number) => Math.min(...items.map(score));

  switch (kind) {
    case "media":
      return best((item) =>
        item.reason ? 3 : isExactTitle(query, item as TitleArg) ? 0 : startsWithQuery(query, titleVariants(item as TitleArg)) ? 1 : 2
      );
    case "person":
      return best((item) =>
        isExactPersonName(query, item as PersonLike)
          ? 0
          : Number(item.popularity || 0) < KNOWN_PERSON_POPULARITY
            ? 3
            : tokenIsNameWord(query, item.name)
              ? 0.5
              : tokensPrefixName(query, item.name)
                ? 1
                : similarity(query, String(item.name || "")) >= TYPO_SIMILARITY
                  ? 1.5
                  : 3
      );
    case "character":
      return best((item) => (normalizeSearch(item.name) === normalizeSearch(query) ? 0 : 3));
    case "collection":
      return best((item) => (startsWithQuery(query, [item.name]) ? 2 : 4));
    case "user": {
      const q = normalizeSearch(query.replace(/^@+/, ""));
      return best((item) => (normalizeSearch(item.username) === q || normalizeSearch(item.name) === q ? 1 : 5));
    }
    default:
      return 9;
  }
}

/**
 * Reagrupa as sugestões por tipo, na ordem de relevância dos grupos. Dentro de
 * cada grupo a ordem recebida é mantida (cada fonte já vem ordenada).
 */
export function arrangeSuggestions<T extends Suggestion>(query: string, suggestions: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of suggestions) {
    const list = groups.get(item.kind) ?? [];
    list.push(item);
    groups.set(item.kind, list);
  }

  return [...groups.entries()]
    .map(([kind, items]) => ({ kind, items, tier: groupTier(query, kind, items) }))
    .sort((a, b) => a.tier - b.tier || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .flatMap((group) => group.items);
}

type ScoredPerson<P extends PersonLike> = { person: P; score: number };

/**
 * Quem entra no grupo "Pessoas" e em que ordem (até `limit`):
 *  1. só pessoas do cinema/TV (isRelevantPerson);
 *  2. nome exato primeiro — e, havendo um exato relevante, só homônimos exatos
 *     ("christopher nolan" não traz Christopher Walken);
 *  3. depois, quem tem o termo como palavra inteira do nome ("nolan",
 *     "cavill"), pela popularidade: Christopher Nolan / Henry Cavill primeiro;
 *  4. por fim, nomes só parecidos (typo, prefixo), pela pontuação de texto.
 * Nomes exatos pouco populares (perfis "Nolan", "Keanu" sem sobrenome)
 * continuam elegíveis, mas atrás de quem tem relevância mínima.
 */
export function selectPeople<P extends PersonLike>(query: string, scored: ScoredPerson<P>[], limit = 3): P[] {
  const relevant = scored.filter((entry) => isRelevantPerson(query, entry.person));
  const popular = (entry: ScoredPerson<P>) => Number(entry.person.popularity || 0) >= MIN_PERSON_POPULARITY;
  const exact = (entry: ScoredPerson<P>) => isExactPersonName(query, entry.person);
  const hasRelevantExact = relevant.some((entry) => exact(entry) && popular(entry));
  const pool = hasRelevantExact ? relevant.filter(exact) : relevant;

  const rank = (entry: ScoredPerson<P>) => (exact(entry) ? 0 : tokenIsNameWord(query, entry.person.name) ? 1 : 2);

  return [...pool]
    .sort((a, b) => {
      if (popular(a) !== popular(b)) return popular(a) ? -1 : 1;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (rank(a) === 1) return Number(b.person.popularity || 0) - Number(a.person.popularity || 0);
      return b.score - a.score;
    })
    .slice(0, limit)
    .map((entry) => entry.person);
}
