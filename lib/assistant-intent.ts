/*
 * V2.3 — intenção do pedido ao MyCatalog AI (puro, determinístico).
 *
 * O Gemini sozinho "esquece" restrições como "nenhuma que já esteja na minha
 * biblioteca". Aqui o pedido é analisado ANTES (o que excluir) e o resultado
 * é filtrado DEPOIS (garantia), então a restrição vale mesmo se o modelo
 * errar. Tudo em PT-BR, sem acentos/maiúsculas.
 */

export type AssistantIntent = {
  /** Status da biblioteca que NÃO podem ser recomendados. */
  excludeStatuses: Set<string>;
  /** "nada que esteja na minha biblioteca" — exclui qualquer status. */
  excludeAllLibrary: boolean;
  /** Títulos citados para NÃO recomendar (normalizados). */
  excludeTitles: string[];
  /** "da minha fila/biblioteca" — o usuário quer itens DA biblioteca. */
  libraryOnly: boolean;
  /** Quer rever/reassistir: não excluir o que já assistiu. */
  wantsRewatch: boolean;
  /** Diz algo sobre a própria biblioteca/gosto. */
  personal: boolean;
  /** "uma série…" / "um filme…" (só conta em frases SEM negação). */
  onlyType: "movie" | "tv" | null;
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s,.;]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NEGATION = /\b(nao|nenhum|nenhuma|nenhuns|nenhumas|nada|sem|fora|exceto|menos|evite|evitar|jamais|nunca|tirando|ignore|ignorar)\b/;

// Status que o usuário pode citar — cada padrão aponta para o(s) status do banco.
const STATUS_PATTERNS: { re: RegExp; statuses: string[] }[] = [
  {
    re: /\b(ja )?(assisti|assistid[ao]s?|vi|vist[ao]s?|terminei|concluid[ao]s?|finalizei)\b|\bque (eu )?ja (vi|assisti)\b/,
    statuses: ["watched", "rewatched"],
  },
  { re: /\breassist\w*|\brevi\b|\brevist[ao]s?\b/, statuses: ["rewatched", "rewatching"] },
  {
    re: /\b(estou|to|ta|tou|esta|estao|ando)\s+(assistindo|vendo|acompanhando)\b|\bem andamento\b|\bassistindo\b/,
    statuses: ["watching", "rewatching"],
  },
  { re: /\b(minha fila|quero assistir|salv[ao]s?|na minha lista de desejos)\b/, statuses: ["want"] },
  { re: /\b(abandonei|abandonad[ao]s?|larguei|desisti)\b/, statuses: ["dropped"] },
  { re: /\b(pausad[ao]s?|pausei)\b/, statuses: ["paused"] },
];

const TITLE_STOP = /\s+(?:e nenhum\w*|e nao|e nada|mas|porem|nem|ou|que|onde|pra|para)\b|[,.;]|$/;

function extractTitles(text: string): string[] {
  const titles: string[] = [];

  const patterns = [
    /\bnao (?:quero|me (?:mande|recomende|sugira|indique)|recomende|sugira|indique|mande|queria)\s+(?:mais\s+)?(?:a |o |as |os |uma |um )?(?:serie |filme |anime |novela |documentario )?(.+)/,
    /\b(?:exceto|menos|tirando|sem|fora)\s+(?:a |o |as |os )?(?:serie |filme |anime )?(.+)/,
    /\bnao (?:seja|pode ser|podem ser)\s+(?:a |o )?(?:serie |filme )?(.+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) continue;

    let candidate = match[1];
    const stop = candidate.search(TITLE_STOP);

    if (stop > 0) candidate = candidate.slice(0, stop);

    candidate = candidate.replace(/\s+/g, " ").trim();

    // Não é título: palavras de categoria/estado.
    if (!candidate || candidate.split(" ").length > 6) continue;
    if (/^(nenhum|nada|sugest|serie|series|filme|filmes|que|ja|mais|nem|muito|uma|um|ninguem)/.test(candidate)) continue;
    if (/\b(biblioteca|assisti|assistid|reassist|fila|lista|vi|vistas?|abandon)/.test(candidate)) continue;

    titles.push(candidate);
  }

  return Array.from(new Set(titles));
}

export function parseAssistantIntent(message: string): AssistantIntent {
  const text = normalizeText(message);
  // Cláusulas: a negação vale na mesma frase (separadores simples).
  const clauses = text.split(/[.;]|\bmas\b|\bporem\b/).map((part) => part.trim()).filter(Boolean);

  const excludeStatuses = new Set<string>();
  let excludeAllLibrary = false;

  const wantsRewatch =
    /\b(reassistir|rever|assistir de novo|assistir novamente|ver de novo|ver novamente|revisitar)\b/.test(text) &&
    !NEGATION.test(text.slice(0, text.search(/reassistir|rever|assistir de novo|assistir novamente|ver de novo|ver novamente|revisitar/)));

  const libraryOnly =
    !wantsRewatch &&
    /\b(da|na|dentro da|entre as?)\s+minh[ao]s?\s+(biblioteca|lista|fila|colecao)\b/.test(text) &&
    !clauses.some((clause) => NEGATION.test(clause) && /\bminh[ao]s?\s+(biblioteca|lista|colecao)\b/.test(clause));

  for (const clause of clauses) {
    if (!NEGATION.test(clause)) continue;

    // "nenhuma que já esteja na minha biblioteca", "nada da minha lista"
    if (/\b(biblioteca|colecao|minha lista|minhas listas)\b/.test(clause)) {
      excludeAllLibrary = true;
    }

    for (const { re, statuses } of STATUS_PATTERNS) {
      if (re.test(clause)) statuses.forEach((status) => excludeStatuses.add(status));
    }
  }

  // "não me mande séries que eu já assisti": "assistida" cobre assistida E reassistida (+ o que está em andamento).
  if (excludeStatuses.has("watched") || excludeStatuses.has("rewatched")) {
    ["watched", "rewatched", "rewatching"].forEach((status) => excludeStatuses.add(status));
  }

  const excludeTitles = extractTitles(text)
    // "o mentalista" → "mentalista"
    .map((title) => title.replace(/^(a|o|as|os)\s+/, ""));

  const personal =
    excludeAllLibrary ||
    excludeStatuses.size > 0 ||
    libraryOnly ||
    /\b(meu gosto|meus gostos|meus favoritos|minhas notas|que eu gosto|que eu gostei|pra mim|para mim|baseado em mim)\b/.test(text);

  // Tipo pedido: "série"/"filme" fora de frases negativas ("não me mande séries
  // que eu já assisti" NÃO significa "só séries").
  const positive = clauses.filter((clause) => !NEGATION.test(clause)).join(" ");
  const asksTv = /\bseries?\b|\bnovelas?\b|\banimes?\b|\btemporadas?\b/.test(positive);
  const asksMovie = /\bfilmes?\b|\blongas?\b/.test(positive);
  const onlyType = asksTv && !asksMovie ? "tv" : asksMovie && !asksTv ? "movie" : null;

  return { excludeStatuses, excludeAllLibrary, excludeTitles, libraryOnly, wantsRewatch, personal, onlyType };
}

/*
 * Padrão de segurança: salvo quando o usuário pede da própria biblioteca
 * ou para reassistir, NUNCA recomendar o que ele já viu / está vendo /
 * abandonou — nem o que ocultou. "Quero assistir" pode (está na fila).
 */
export const DEFAULT_EXCLUDED_STATUSES = ["watched", "rewatched", "rewatching", "watching", "dropped"] as const;

export function effectiveExcludedStatuses(intent: AssistantIntent): Set<string> {
  const set = new Set(intent.excludeStatuses);

  if (!intent.libraryOnly && !intent.wantsRewatch) {
    DEFAULT_EXCLUDED_STATUSES.forEach((status) => set.add(status));
  }

  return set;
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .replace(/[,.;]/g, " ")
    .split(" ")
    .filter((token) => token.length >= 3 && !["the", "and", "dos", "das", "uma", "com", "por"].includes(token));
}

function commonPrefix(a: string, b: string): number {
  let index = 0;

  while (index < a.length && index < b.length && a[index] === b[index]) index++;

  return index;
}

/** "mentalista" casa com "The Mentalist" / "O Mentalista" (radical em comum). */
export function titleMatches(excluded: string, candidateTitles: string[]): boolean {
  const wanted = tokens(excluded);

  if (wanted.length === 0) return false;

  return candidateTitles.some((candidate) => {
    const have = tokens(candidate);

    return (
      have.length > 0 &&
      wanted.every((word) => have.some((token) => commonPrefix(word, token) >= Math.min(6, Math.min(word.length, token.length))))
    );
  });
}

export type ExcludableResult = {
  media_type: string;
  id: number;
  titles: string[];
};

/**
 * Retorna o motivo da exclusão (para depurar/testar) ou null se pode ficar.
 * `statusByKey`: `${type}-${id}` → status; `hidden`: chaves ocultas.
 */
export function exclusionReason(
  result: ExcludableResult,
  intent: AssistantIntent,
  statusByKey: Map<string, string>,
  hidden: Set<string>
): string | null {
  const key = `${result.media_type}-${Number(result.id)}`;

  if (hidden.has(key)) return "oculto";

  if (intent.onlyType && result.media_type !== intent.onlyType) return "tipo";

  const status = statusByKey.get(key);

  if (status) {
    if (intent.excludeAllLibrary) return "na biblioteca";
    if (effectiveExcludedStatuses(intent).has(status)) return `status:${status}`;
  }

  if (intent.excludeTitles.some((title) => titleMatches(title, result.titles))) return "título citado";

  return null;
}
