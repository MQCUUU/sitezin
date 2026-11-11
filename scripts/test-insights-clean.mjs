// Fase 7: frase e blocos do Insights clean.
// node --experimental-strip-types --test scripts/test-insights-clean.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { summaryHeadline, summaryFicha, periodChange, periodWhen, monthBars, genreRows, communityLine, decimal } = await import("../lib/insights/clean.ts");

const TODAY = "2026-11-11";

test("summaryHeadline: horas, minutos e o quando", () => {
  assert.equal(summaryHeadline({ minutes: 18720, hours: 312 }, "year", TODAY), "312 horas em 2026");
  assert.equal(summaryHeadline({ minutes: 45, hours: 1 }, "year", TODAY), "45 minutos em 2026");
  assert.equal(summaryHeadline({ minutes: 1, hours: 0 }, "year", TODAY), "1 minuto em 2026");
  assert.equal(summaryHeadline({ minutes: 60, hours: 1 }, "all", TODAY), "1 hora no total");
  assert.equal(summaryHeadline({ minutes: 72240, hours: 1204 }, "12m", TODAY), "1.204 horas nos últimos 12 meses");
  assert.equal(summaryHeadline({ minutes: 600, hours: 10 }, "2024", TODAY), "10 horas em 2024");
});

test("periodWhen", () => {
  assert.equal(periodWhen("year", TODAY), "em 2026");
  assert.equal(periodWhen("2001", TODAY), "em 2001");
  assert.equal(periodWhen("12m", TODAY), "nos últimos 12 meses");
  assert.equal(periodWhen("all", TODAY), "no total");
  assert.equal(periodWhen("month", TODAY), "no período");
});

test("summaryFicha: partes com plural, zero sai", () => {
  assert.equal(summaryFicha({ movies: 48, episodes: 210, series: 12 }), "48 filmes e 210 episódios de 12 séries");
  assert.equal(summaryFicha({ movies: 12, episodes: 0, series: 0 }), "12 filmes");
  assert.equal(summaryFicha({ movies: 0, episodes: 1, series: 1 }), "1 episódio de 1 série");
  assert.equal(summaryFicha({ movies: 1, episodes: 0, series: 0 }), "1 filme");
  assert.equal(summaryFicha({ movies: 0, episodes: 0, series: 0 }), "");
});

test("periodChange: só variação relevante e comparável", () => {
  assert.equal(periodChange({ minutes: 1180 }, { minutes: 1000 }, "year", TODAY), "18% a mais que em 2025");
  assert.equal(periodChange({ minutes: 880 }, { minutes: 1000 }, "year", TODAY), "12% a menos que em 2025");
  assert.equal(periodChange({ minutes: 1020 }, { minutes: 1000 }, "year", TODAY), null);
  assert.equal(periodChange({ minutes: 500 }, { minutes: 30 }, "year", TODAY), null);
  assert.equal(periodChange({ minutes: 500 }, null, "year", TODAY), null);
  assert.equal(periodChange({ minutes: 500 }, { minutes: 1000 }, "all", TODAY), null);
  assert.equal(periodChange({ minutes: 1500 }, { minutes: 1000 }, "2024", TODAY), "50% a mais que em 2023");
  assert.equal(periodChange({ minutes: 1500 }, { minutes: 1000 }, "12m", TODAY), "50% a mais que nos 12 meses anteriores");
});

test("monthBars: 12 últimos, ratio e mês atual", () => {
  const monthly = Array.from({ length: 14 }, (_, i) => {
    const m = i + 1;
    const year = m > 12 ? 2027 : 2026;
    const month = ((m - 1) % 12) + 1;
    return { month: `${year}-${String(month).padStart(2, "0")}`, minutes: m === 5 ? 600 : 60 };
  });
  // últimos 12 de 14 itens: meses 3..14
  const bars = monthBars(monthly, "2027-02-10");
  assert.equal(bars.length, 12);
  assert.equal(bars.at(-1).current, true);
  assert.equal(bars.filter((b) => b.current).length, 1);
  assert.equal(Math.max(...bars.map((b) => b.ratio)), 1);
  assert.equal(bars.find((b) => b.key === "2026-05").hours, 10);
  assert.equal(bars.find((b) => b.key === "2026-05").label, "mai");
  assert.equal(monthBars([{ month: "2026-01", minutes: 0 }], TODAY)[0].ratio, 0);
});

test("genreRows: máximo, ratio e média só com 3+ avaliados", () => {
  const rows = genreRows([
    { name: "Drama", count: 42, rated: 10, avg: 8.06 },
    { name: "Ação", count: 21, rated: 2, avg: 9 },
  ]);
  assert.deepEqual(rows, [
    { name: "Drama", count: 42, ratio: 1, avg: "8,1" },
    { name: "Ação", count: 21, ratio: 0.5, avg: null },
  ]);
  const many = Array.from({ length: 9 }, (_, i) => ({ name: `G${i}`, count: 9 - i, rated: 0, avg: null }));
  assert.equal(genreRows(many).length, 6);
  assert.equal(genreRows(many, 3).length, 3);
});

test("communityLine", () => {
  assert.equal(communityLine(null), null);
  assert.equal(communityLine({ bias: 0.1 }), "Suas notas ficam na média do TMDB.");
  assert.equal(communityLine({ bias: 0.43 }), "Você dá em média 0,4 ponto a mais que o TMDB.");
  assert.equal(communityLine({ bias: -0.43 }), "Você dá em média 0,4 ponto a menos que o TMDB.");
  assert.equal(communityLine({ bias: -2.2 }), "Você dá em média 2,2 pontos a menos que o TMDB.");
});

test("decimal", () => {
  assert.equal(decimal(7.84), "7,8");
  assert.equal(decimal(8), "8,0");
});
