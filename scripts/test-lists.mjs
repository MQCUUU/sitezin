// Testes de domínio das Listas (V2.7): node scripts/test-lists.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { displayDescription, isUuid, moveInOrder, normalizeDescription, normalizeName, parseIndex, parseMediaType, parsePage, parsePositiveInt, plural } from "../lib/lists/validate.ts";

test("descrição: null, '', espaços e o texto 'null' viram ausência (nunca 'null' na tela)", () => {
  for (const value of [null, undefined, "", "   ", "null", 42, {}]) assert.equal(normalizeDescription(value), null);
  assert.equal(displayDescription("null"), null);
  assert.equal(normalizeDescription("  Filmes de outubro  "), "Filmes de outubro");
  assert.equal(normalizeDescription("x".repeat(400)).length, 300);
});

test("nome: trim, espaços colapsados, 2–80 caracteres, só texto", () => {
  assert.equal(normalizeName("  Maratona   de  outubro "), "Maratona de outubro");
  for (const value of ["", "   ", "a", null, 5]) assert.equal(normalizeName(value), null);
  assert.equal(normalizeName("y".repeat(200)).length, 80);
});

test("IDs e tipos validados", () => {
  assert.equal(isUuid("baf9730a-e8b0-47e3-a995-91aacced8d63"), true);
  assert.equal(isUuid("1; drop table"), false);
  assert.equal(parseMediaType("tv"), "tv");
  assert.equal(parseMediaType("book"), null);
  assert.equal(parsePositiveInt("12"), 12);
  assert.equal(parsePositiveInt("-1"), null);
  assert.equal(parsePositiveInt("1.5"), null);
  assert.equal(parseIndex("0"), 0);
  assert.equal(parseIndex("-3"), null);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage("3"), 3);
});

test("mover: 10→1, 1→5, 5→9 (mesma regra do servidor)", () => {
  let order = Array.from({ length: 10 }, (_, i) => `T${i + 1}`);
  order = moveInOrder(order, 9, 0);
  assert.deepEqual(order.slice(0, 3), ["T10", "T1", "T2"]);
  order = moveInOrder(order, 0, 4);
  assert.deepEqual(order.slice(0, 5), ["T1", "T2", "T3", "T4", "T10"]);
  order = moveInOrder(order, 4, 8);
  assert.equal(order[8], "T10");
  assert.equal(new Set(order).size, 10, "nenhum duplicado/perdido");
});

test("mover: destino fora do intervalo é ajustado; índice inválido não muda nada", () => {
  assert.deepEqual(moveInOrder(["a", "b", "c"], 0, 99), ["b", "c", "a"]);
  assert.deepEqual(moveInOrder(["a", "b", "c"], 5, 0), ["a", "b", "c"]);
});

test("plural", () => {
  assert.equal(plural(1, "título", "títulos"), "1 título");
  assert.equal(plural(0, "título", "títulos"), "0 títulos");
});
