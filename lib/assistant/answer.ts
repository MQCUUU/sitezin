/*
 * Assistente IA — a frase da resposta vem pronta do modelo ("Aqui estão 10
 * opções…"), mas o servidor filtra o que você já viu/ocultou e mostra no
 * máximo 6. Sem ajuste, a tela prometia 10 e mostrava 6. Aqui a contagem
 * citada vira a quantidade real de sugestões exibidas.
 */

const WORDS: Record<string, number> = {
  uma: 1,
  um: 1,
  duas: 2,
  dois: 2,
  "três": 3,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  quinze: 15,
  vinte: 20,
};

/** Substantivo no plural → singular (só os que aparecem como "N <coisa>"). */
const NOUNS: Record<string, string> = {
  "opções": "opção",
  "sugestões": "sugestão",
  "recomendações": "recomendação",
  "títulos": "título",
  "filmes": "filme",
  "séries": "série",
  "indicações": "indicação",
  "alternativas": "alternativa",
  "produções": "produção",
  "animações": "animação",
  "documentários": "documentário",
};

const NUMBER = `(\\d{1,3}|${Object.keys(WORDS).join("|")})`;
const NOUN = `(${Object.keys(NOUNS).join("|")})`;
const COUNT = new RegExp(`(^|[^\\p{L}\\d])${NUMBER}(\\s+)${NOUN}(?![\\p{L}])`, "giu");

export function fitAnswerCount(answer: string, count: number): string {
  if (!answer || count <= 0) return answer;

  let changed = false;

  let text = answer.replace(COUNT, (match, lead: string, num: string, space: string, noun: string) => {
    const value = /^\d+$/.test(num) ? Number(num) : WORDS[num.toLowerCase()];

    // "um"/"uma" sozinhos são artigo ("uma série curta"), não contagem.
    if (value === 1 && !/^\d+$/.test(num)) return match;

    changed = true;

    const lower = noun.toLowerCase();
    const word = count === 1 ? NOUNS[lower] ?? noun : lower;
    const cased = noun[0] === noun[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;

    return `${lead}${count}${space}${cased}`;
  });

  // "Aqui estão 1 opção" → "Aqui está 1 opção".
  if (changed && count === 1) text = text.replace(/\b(est|s)ão(\s+1\s)/giu, (_m, stem: string, rest: string) => `${stem === "s" ? "é" : `${stem}á`}${rest}`);

  return text;
}
