// Testes do progresso de séries na Biblioteca (V2.6): node scripts/test-library-progress.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { computeTvProgress, tvStructureFromRaw } from "../lib/tv-progress.ts";
import { libraryProgress, seasonStats } from "../lib/library/progress.ts";

const raw = (seasons, last, status = "Returning Series", extra = {}) => ({
  status,
  seasons: seasons.map(([n, c]) => ({ season_number: n, episode_count: c })),
  last_episode_to_air: last ? { season_number: last[0], episode_number: last[1] } : null,
  ...extra,
});
const eps = (list) => list.flatMap(([s, from, to]) => Array.from({ length: to - from + 1 }, (_, i) => ({ season_number: s, episode_number: from + i })));
const run = ({ r, watched = [], status = "watching", completed = 0, counts }) => {
  const structure = tvStructureFromRaw(r, counts);
  const progress = computeTvProgress(structure, watched, { rewatching: status === "rewatching" });
  return libraryProgress({ status, progress, structure, watched, completedSeasons: completed });
};
const ENDED = raw([[0, 4], [1, 10], [2, 10]], [2, 10], "Ended");
const AIRING = raw([[1, 10], [2, 10], [3, 8]], [3, 4]);

test("0 episódios (Assistindo): 'Ainda não começou' + começa em T1:E01", () => {
  const p = run({ r: ENDED });
  assert.equal(p.card, "Ainda não começou");
  assert.equal(p.detail, "Começa em T1:E01");
});

test("Quero assistir sem episódios: nada no card (o status já diz)", () => {
  assert.equal(run({ r: ENDED, status: "want" }).card, null);
});

test("T1:E1 assistido → próximo T1:E02 · 1/10", () => {
  const p = run({ r: ENDED, watched: eps([[1, 1, 1]]) });
  assert.equal(p.card, "Próximo: T1:E02 · 1/10");
  assert.equal(p.title, "Próximo episódio: T1:E02");
  assert.equal(p.detail, "1 de 10 episódios da temporada 1 · 1 de 20 no total");
});

test("meio da temporada 2", () => {
  assert.equal(run({ r: ENDED, watched: eps([[1, 1, 10], [2, 1, 4]]) }).card, "Próximo: T2:E05 · 4/10");
});

test("buraco não é pulado (E1 ✓, E2 ✗, E3 ✓ → próximo E2)", () => {
  assert.equal(run({ r: ENDED, watched: eps([[1, 1, 1], [1, 3, 3]]) }).next.episode, 2);
});

test("temporada completa → próximo é o E01 da seguinte", () => {
  assert.equal(run({ r: ENDED, watched: eps([[1, 1, 10]]) }).card, "Próximo: T2:E01 · 0/10");
});

test("último episódio de série encerrada → 'Série concluída'", () => {
  const p = run({ r: ENDED, watched: eps([[1, 1, 10], [2, 1, 10]]), status: "watched" });
  assert.equal(p.card, "Série concluída");
  assert.equal(p.detail, "20 de 20 episódios");
});

test("especiais NÃO vistos não impedem conclusão (sem 'faltam 4')", () => {
  const p = run({ r: ENDED, watched: eps([[1, 1, 10], [2, 1, 10]]) });
  assert.equal(p.state, "completed");
});

test("especiais vistos não contam como progresso regular", () => {
  const p = run({ r: ENDED, watched: eps([[0, 1, 4]]) });
  assert.equal(p.card, "Ainda não começou");
});

test("série em andamento em dia (episódios futuros não contam) → 'Você está em dia'", () => {
  const p = run({ r: AIRING, watched: eps([[1, 1, 10], [2, 1, 10], [3, 1, 4]]) });
  assert.equal(p.card, "Você está em dia");
  assert.notEqual(p.state, "completed");
});

test("episódio futuro: temporada no ar mostra só os exibidos (x/4, não x/8)", () => {
  assert.equal(run({ r: AIRING, watched: eps([[1, 1, 10], [2, 1, 10], [3, 1, 2]]) }).card, "Próximo: T3:E03 · 2/4");
  assert.equal(seasonStats(tvStructureFromRaw(AIRING), [], 3).total, 4);
});

test("abandonada com episódios → 'Parou na T2 · 4/10' (sem tom de erro)", () => {
  const p = run({ r: ENDED, watched: eps([[1, 1, 10], [2, 1, 4]]), status: "dropped" });
  assert.equal(p.card, "Parou na T2 · 4/10");
  assert.doesNotMatch(p.card + p.title, /falh|erro|abandon/i);
});

test("reassistindo: nada inventado (sem episódio, sem percentual)", () => {
  const p = run({ r: ENDED, watched: eps([[1, 1, 10], [2, 1, 10]]), status: "rewatching" });
  assert.equal(p.card, null);
  assert.equal(p.next, null);
  assert.equal(p.title, "Reassistindo");
});

test("metadata incompleta (sem temporadas) com episódios → fato: 'N episódios assistidos'", () => {
  assert.equal(run({ r: { status: "Ended" }, watched: eps([[1, 1, 3]]) }).card, "3 episódios assistidos");
});

test("estrutura desatualizada (contagens maiores) → nunca 'em dia'", () => {
  const p = run({ r: ENDED, watched: eps([[1, 1, 10], [2, 1, 10]]), counts: { seasons_count: 3, episodes_count: 30 } });
  assert.equal(p.state, "unknown");
  assert.equal(p.card, "20 episódios assistidos");
});

test("legado: Assistido importado sem episódios → nada (nunca 'Ainda não começou')", () => {
  const watched = run({ r: ENDED, status: "watched", completed: 2 });
  assert.equal(watched.card, null, "card: o status 'Assistido' já diz");
  assert.equal(watched.title, "Temporadas 1–2 concluídas", "Quick View: só o que foi registrado");
  assert.equal(run({ r: ENDED, status: "rewatched", completed: 0 }), null);
});

test("legado: Abandonei sem episódios com temporadas registradas → 'Temporada 1 concluída'", () => {
  assert.equal(run({ r: ENDED, status: "dropped", completed: 1 }).card, "Temporada 1 concluída");
  assert.equal(run({ r: ENDED, status: "watching", completed: 3 }).card, "Temporadas 1–3 concluídas");
});

test("1 episódio: plural correto", () => {
  const p = run({ r: raw([[1, 1]], [1, 1], "Ended"), watched: eps([[1, 1, 1]]) });
  assert.equal(p.detail, "1 de 1 episódio");
});
