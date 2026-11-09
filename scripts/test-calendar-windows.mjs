// Calendário: as descobertas são buscadas por semana (domingo a sábado), alinhadas
// à visão Semana — assim o Mês mostra os mesmos lançamentos por dia que a Semana.
// node --experimental-strip-types --test scripts/test-calendar-windows.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { weekWindows } = await import("../lib/calendar/dates.ts");

test("uma semana inteira (domingo a sábado) vira uma janela só", () => {
  assert.deepEqual(weekWindows("2026-11-08", "2026-11-14"), [{ start: "2026-11-08", end: "2026-11-14" }]);
});

test("a grade do mês (5 semanas a partir do domingo) vira 5 janelas iguais às da Semana", () => {
  const windows = weekWindows("2026-11-01", "2026-12-05");

  assert.equal(windows.length, 5);
  assert.deepEqual(windows[1], { start: "2026-11-08", end: "2026-11-14" });
  assert.deepEqual(windows[4], { start: "2026-11-29", end: "2026-12-05" });
});

test("período que começa no meio da semana: a 1ª janela é a semana inteira (mesma consulta da visão Semana)", () => {
  const windows = weekWindows("2026-11-10", "2026-11-20");

  assert.deepEqual(windows, [
    { start: "2026-11-08", end: "2026-11-14" },
    { start: "2026-11-15", end: "2026-11-21" },
  ]);
});

test("período de um dia", () => {
  assert.deepEqual(weekWindows("2026-11-12", "2026-11-12"), [{ start: "2026-11-08", end: "2026-11-14" }]);
});
