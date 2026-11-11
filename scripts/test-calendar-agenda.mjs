// Calendário: a Agenda mostra 7 dias por vez; "Para mim" é o padrão quando há algo seu.
// node --experimental-strip-types --test scripts/test-calendar-agenda.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { AGENDA_PAGE_DAYS, visibleUntil, sliceAgenda, defaultFilter, orderFilters } = await import("../lib/calendar/agenda.ts");

const today = "2026-11-11";

test("a página da agenda tem 7 dias e termina no sétimo dia", () => {
  assert.equal(AGENDA_PAGE_DAYS, 7);
  assert.equal(visibleUntil(today, 7), "2026-11-17");
  assert.equal(visibleUntil("2026-12-28", 7), "2027-01-03");
});

test("sliceAgenda corta pela janela visível", () => {
  const events = [{ date: "2026-11-11" }, { date: "2026-11-17" }, { date: "2026-11-18" }];
  assert.equal(sliceAgenda(events, today, 7).length, 2);
  assert.equal(sliceAgenda(events, today, 14).length, 3);
  assert.deepEqual(sliceAgenda([], today, 7), []);
});

test("defaultFilter: o da URL vence; senão 'mine' só se há algo seu", () => {
  assert.equal(defaultFilter(null, [{ relationship: "watchlist" }]), "mine");
  assert.equal(defaultFilter(null, [{ relationship: null }, {}]), "all");
  assert.equal(defaultFilter("tv", [{ relationship: "x" }]), "tv");
  assert.equal(defaultFilter("all", [{ relationship: "x" }]), "all");
  assert.equal(defaultFilter("lixo", []), "all");
});

test("orderFilters põe 'mine' primeiro só quando há algo seu", () => {
  const filters = [["all", "Todos"], ["mine", "Para mim"], ["movie", "Filmes"], ["tv", "Séries"]];
  assert.deepEqual(orderFilters(filters, true).map((f) => f[0]), ["mine", "all", "movie", "tv"]);
  assert.deepEqual(orderFilters(filters, false).map((f) => f[0]), ["all", "mine", "movie", "tv"]);
});
