// Assistente IA: a frase da resposta não pode prometer mais sugestões do que a tela mostra.
// node --experimental-strip-types --test scripts/test-assistant-answer.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { fitAnswerCount } = await import("../lib/assistant/answer.ts");

test("troca o número em algarismos pela quantidade real", () => {
  assert.equal(
    fitAnswerCount("Aqui estão 10 opções de séries curtas e engraçadas.", 6),
    "Aqui estão 6 opções de séries curtas e engraçadas."
  );
});

test("troca o número por extenso", () => {
  assert.equal(fitAnswerCount("Separei dez sugestões para você.", 4), "Separei 4 sugestões para você.");
  assert.equal(fitAnswerCount("Encontrei cinco filmes ótimos.", 3), "Encontrei 3 filmes ótimos.");
});

test("cobre os substantivos usuais (títulos, séries, filmes, recomendações)", () => {
  assert.equal(fitAnswerCount("Veja 8 títulos e 10 recomendações.", 5), "Veja 5 títulos e 5 recomendações.");
  assert.equal(fitAnswerCount("12 séries que combinam com você", 6), "6 séries que combinam com você");
});

test("singular quando sobra uma", () => {
  assert.equal(fitAnswerCount("Aqui estão 10 opções de suspense.", 1), "Aqui está 1 opção de suspense.");
  assert.equal(fitAnswerCount("Separei 10 filmes para hoje.", 1), "Separei 1 filme para hoje.");
});

test("não mexe em números que não são contagem de sugestões", () => {
  const text = "Séries com episódios de até 30 minutos, lançadas depois de 2010.";
  assert.equal(fitAnswerCount(text, 6), text);
});

test("sem número, a frase fica igual; sem sugestões, também", () => {
  assert.equal(fitAnswerCount("Separei algumas opções para você.", 6), "Separei algumas opções para você.");
  assert.equal(fitAnswerCount("Aqui estão 10 opções.", 0), "Aqui estão 10 opções.");
});
