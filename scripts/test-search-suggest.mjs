// Fase 2 — relevância das sugestões da busca (P2-04) e filtros compartilhados (P3-11):
// node scripts/test-search-suggest.mjs (ou npm test). Fixtures no formato real do TMDB
// observado na auditoria; o comportamento na tela fica em tests/search.spec.ts.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { arrangeSuggestions, isRelevantPerson, selectPeople, MIN_PERSON_POPULARITY } = await import("../lib/search/suggest-order.ts");
const { fetchDiscoverFilters, clearDiscoverFiltersCache } = await import("../lib/discover/filters-client.ts");

const media = (title, extra = {}) => ({ kind: "media", media_type: "movie", id: title.length, title, ...extra });
const person = (name, known_for_department, popularity) => ({ kind: "person", id: name, name, known_for_department, popularity });
const scored = (list) => list.map((p) => ({ person: p, score: 100 }));
const firstOf = (list) => list[0];
const indexOf = (list, predicate) => list.findIndex(predicate);

/* ---------------------------------------------------------------- Pessoas = pessoas */

test("empresa/produtora/entidade não aparece como pessoa", () => {
  assert.equal(isRelevantPerson("interst", person("Intersect", "Production", 0.26)), false);
  assert.equal(isRelevantPerson("the office", person("The DA's Office", "Sound", 0.26)), false);
  assert.equal(isRelevantPerson("breaking", person("Representative of BREAKING THE CHAINS, UK", "Acting", 0.35)), false);
  assert.equal(isRelevantPerson("breaking", person("Breaking Ground", "Directing", 0.25)), false);
});

test("pessoa do cinema/TV com relevância entra; nome exato entra mesmo pouco popular", () => {
  assert.equal(isRelevantPerson("nolan", person("Christopher Nolan", "Directing", 8.3)), true);
  assert.equal(isRelevantPerson("cavill", person("Joy Cavill", "Writing", 0.51)), true);
  assert.equal(isRelevantPerson("keanu", person("Keanu", "Acting", 0.27)), true, "nome exato não é eliminado por popularidade");
  assert.equal(isRelevantPerson("kevin feige", person("Kevin Feige", "Production", 4)), true, "nome exato vale mesmo fora de atuação/direção");
  assert.equal(isRelevantPerson("x", person("Fulano", "Acting", MIN_PERSON_POPULARITY - 0.01)), false);
});

/* ---------------------------------------------------------------- quem entra em "Pessoas" e em que ordem */

test("'nolan': Christopher Nolan entra (perfis 'Nolan' obscuros não tomam as vagas)", () => {
  const people = selectPeople("nolan", scored([
    person("Nolan", "Acting", 0.33), person("Nolan", "Acting", 0.3), person("Nolan", "Acting", 0.27),
    person("John Nolan", "Acting", 2.05), person("Nolan North", "Acting", 3.03),
    person("Christopher Nolan", "Directing", 8.28), person("Jonathan Nolan", "Writing", 3.2),
  ]));
  assert.equal(firstOf(people).name, "Christopher Nolan");
  assert.equal(people.length, 3);
  assert.ok(people.every((p) => p.name !== "Nolan"));
});

test("'cavill': Henry Cavill primeiro (palavra inteira do nome, pela popularidade)", () => {
  const people = selectPeople("cavill", scored([
    person("Cavill", "Acting", 0.33), person("Joy Cavill", "Writing", 0.51), person("Ali Cavill", "Acting", 0.3), person("Henry Cavill", "Acting", 11.3),
  ]));
  assert.equal(firstOf(people).name, "Henry Cavill");
  assert.ok(!people.some((p) => p.name === "Ali Cavill"), "parecido e irrelevante fica de fora");
});

test("nome exato relevante: só homônimos exatos (sem 'Christopher Walken' para 'christopher nolan')", () => {
  const people = selectPeople("christopher nolan", scored([
    person("Christopher Walken", "Acting", 5.1), person("Christopher Nolan", "Acting", 0.37), person("Christopher Nolan", "Directing", 8.28), person("Christopher Lee", "Acting", 4),
  ]));
  assert.deepEqual(people.map((p) => p.name), ["Christopher Nolan", "Christopher Nolan"]);
  assert.equal(firstOf(people).popularity, 8.28, "o conhecido antes do homônimo obscuro");
});

test("typo: pessoa parecida entra quando não há exato ('tom holand' → Tom Holland)", () => {
  const people = selectPeople("tom holand", [
    { person: person("Tom Holland", "Acting", 17), score: 160 },
    { person: person("Emma Holand", "Sound", 0.27), score: 150 },
    { person: person("Tom Hollander", "Acting", 3.3), score: 140 },
  ]);
  assert.deepEqual(people.map((p) => p.name), ["Tom Holland", "Tom Hollander"]);
});

/* ---------------------------------------------------------------- ordem dos grupos */

test("'interst': títulos antes de qualquer pessoa — Interestelar é o 1º", () => {
  const list = arrangeSuggestions("interst", [
    person("Intersect", "Production", 0.26),
    media("Interestelar", { original_title: "Interstellar" }),
    media("Interstate"),
  ]);
  assert.equal(firstOf(list).title, "Interestelar");
});

test("pessoa exata vem primeiro ('Christopher Nolan', 'Leonardo DiCaprio')", () => {
  for (const [query, docs] of [
    ["Christopher Nolan", [media("Christopher Nolan & Richard Donner: A Conversation"), media("The Christopher Nolan Experience")]],
    ["Leonardo DiCaprio", [media("Leonardo DiCaprio: Most Wanted!")]],
  ]) {
    const list = arrangeSuggestions(query, [...docs, person(query, "Acting", 8.9)]);
    assert.equal(firstOf(list).kind, "person", query);
  }
});

test("título exato vence pessoa homônima exata (conteúdo primeiro em empate)", () => {
  const list = arrangeSuggestions("keanu", [person("Keanu", "Acting", 0.27), media("Keanu: Cadê Meu Gato?!", { original_title: "Keanu" })]);
  assert.equal(firstOf(list).kind, "media");
});

test("'nolan': personagem exato, depois o diretor conhecido, depois títulos que só começam com o termo", () => {
  const list = arrangeSuggestions("nolan", [
    media("Nolan Knows Best"), media("Facing Nolan"),
    person("Christopher Nolan", "Directing", 8.28),
    { kind: "character", name: "Nolan" },
  ]);
  assert.deepEqual(list.map((s) => s.kind), ["character", "person", "media", "media"]);
});

test("pessoa conhecida com typo vem antes de títulos que só relacionam o termo", () => {
  const list = arrangeSuggestions("tom holand", [media("Para Sempre Alice"), person("Tom Holland", "Acting", 17)]);
  assert.equal(firstOf(list).name, "Tom Holland");
});

test("títulos 'Com <personagem>' não puxam o grupo de títulos para cima", () => {
  const list = arrangeSuggestions("walter white", [
    media("Breaking Bad", { reason: "Com Walter White" }),
    { kind: "character", name: "Walter White" },
  ]);
  assert.equal(firstOf(list).kind, "character");
});

test("franquias e usuários ficam depois dos títulos; ordem interna de cada grupo é mantida", () => {
  const list = arrangeSuggestions("matrix", [
    { kind: "user", username: "matrixfan", name: "Fã" },
    { kind: "collection", name: "Matrix: Coleção" },
    media("Matrix", { id: 1 }), media("Matrix", { id: 2 }), media("Matrix Reloaded", { id: 3 }),
  ]);
  assert.deepEqual(list.map((s) => s.kind), ["media", "media", "media", "collection", "user"]);
  assert.deepEqual(list.filter((s) => s.kind === "media").map((s) => s.id), [1, 2, 3]);
  const user = arrangeSuggestions("@matrixfan", [media("Matrix"), { kind: "user", username: "matrixfan", name: "Fã" }]);
  assert.equal(firstOf(user).kind, "user", "@ exato do usuário vem primeiro");
});

test("agrupamento: um grupo nunca aparece dividido", () => {
  const list = arrangeSuggestions("dark", [media("Dark"), person("Dark Person", "Acting", 3), media("Dark Angel"), { kind: "collection", name: "Dark" }, media("Dark Winds")]);
  const kinds = list.map((s) => s.kind);
  for (const kind of new Set(kinds)) {
    const first = kinds.indexOf(kind);
    const last = kinds.lastIndexOf(kind);
    assert.ok(kinds.slice(first, last + 1).every((k) => k === kind), kind);
  }
  assert.equal(indexOf(list, (s) => s.title === "Dark"), 0);
});

/* ---------------------------------------------------------------- filtros do Descobrir (P3-11) */

test("filtros: a mesma URL é buscada uma vez e compartilhada (em voo e depois)", async () => {
  clearDiscoverFiltersCache();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return new Response(JSON.stringify({ genres: [{ id: 1 }], providers: [] }), { status: 200 });
  };
  const [a, b] = await Promise.all([fetchDiscoverFilters("/api/discover/filters?type=movie", fetcher), fetchDiscoverFilters("/api/discover/filters?type=movie", fetcher)]);
  const c = await fetchDiscoverFilters("/api/discover/filters?type=movie", fetcher);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(c.genres, [{ id: 1 }]);
  await fetchDiscoverFilters("/api/discover/filters?type=tv", fetcher);
  assert.equal(calls, 2, "URL diferente = outra requisição");
});

test("filtros: falha não fica em cache (a próxima tentativa busca de novo)", async () => {
  clearDiscoverFiltersCache();
  let calls = 0;
  const failing = async () => { calls++; return new Response(JSON.stringify({ error: "x" }), { status: 503 }); };
  await assert.rejects(fetchDiscoverFilters("/api/discover/filters?type=movie", failing));
  const ok = async () => { calls++; return new Response(JSON.stringify({ genres: [], providers: [] }), { status: 200 }); };
  await fetchDiscoverFilters("/api/discover/filters?type=movie", ok);
  assert.equal(calls, 2);
});
