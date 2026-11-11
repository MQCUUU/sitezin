// Fase 6: formatos do acervo (contagem + horas, ficha da coleção, décadas).
// node --experimental-strip-types --test scripts/test-acervo-format.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { formatCountAndHours, collectionFicha, groupByDecade } = await import("../lib/acervo/format.ts");

test("formatCountAndHours: sem minutos, só a contagem", () => {
  assert.equal(formatCountAndHours(0, 0), "0 títulos");
  assert.equal(formatCountAndHours(1, 0), "1 título");
  assert.equal(formatCountAndHours(1204, NaN), "1.204 títulos");
});

test("formatCountAndHours: menos de uma hora e horas arredondadas", () => {
  assert.equal(formatCountAndHours(3, 45), "3 títulos, menos de 1 hora");
  assert.equal(formatCountAndHours(2, 70), "2 títulos, cerca de 1 hora");
  assert.equal(formatCountAndHours(214, 18720), "214 títulos, cerca de 312 horas");
});

test("collectionFicha: partes opcionais unidas por vírgula", () => {
  assert.equal(collectionFicha(3, 457, 8), "3 filmes, 7h 37min, média 8,0");
  assert.equal(collectionFicha(1, null, null), "1 filme");
  assert.equal(collectionFicha(2, 0, 0), "2 filmes");
});

test("groupByDecade: décadas decrescentes e 'Sem data' por último", () => {
  const groups = groupByDecade([{ y: "2021" }, { y: "" }, { y: "1999" }, { y: "2024" }], (i) => i.y);
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.length]),
    [["Anos 2020", 2], ["Anos 1990", 1], ["Sem data", 1]]
  );
  assert.equal(groups[0].items[0].y, "2021");
});
