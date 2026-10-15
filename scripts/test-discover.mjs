// Testes de domínio de "Descobrir" (V2.9): node scripts/test-discover.mjs
// Node 24 executa os .ts puros direto; o hook completa a extensão dos imports relativos.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const {
  ALL_MAX_PAGES, PAGE_SIZE, RATING_MIN_VOTES, TMDB_MAX_PAGES,
  clampPage, compareForSort, eligiblePage, genreForType, pageSlice, sortPool, totalsFor,
} = await import("../lib/discover/catalog.ts");
const { parseDiscoverParams, serializeDiscoverParams, DEFAULT_DISCOVER_PARAMS } = await import("../lib/discover/params.ts");
const { relevantBrProviders } = await import("../lib/streaming/providers-br.ts");

/* listas sintéticas no formato do TMDB (já ordenadas pelo TMDB) */
const list = (type, n, key, start = 1000) =>
  Array.from({ length: n }, (_, i) => ({
    id: (type === "movie" ? 1 : 2) * 100000 + i,
    media_type: type,
    popularity: start - i * 3,
    vote_average: 9 - i * 0.01,
    vote_count: 1000,
    release_date: type === "movie" ? `2026-09-${String(28 - (i % 28)).padStart(2, "0")}` : undefined,
    first_air_date: type === "tv" ? `2026-09-${String(27 - (i % 27)).padStart(2, "0")}` : undefined,
    ...(key ? key(i) : {}),
  }));
const k = (c) => `${c.media_type}-${c.id}`;
const allPage = (pool, sort, n) => pageSlice(sortPool(pool, sort), n);

test("Todos: exemplo do problema — série 850/840/830 (página 2 do TMDB) NÃO fica presa na página 2", () => {
  // listas do TMDB com páginas de 4 itens (o exemplo); a regra vale para qualquer tamanho
  const mk = (type, vals, start) => vals.map((v, i) => ({ id: start + i, media_type: type, popularity: v, vote_count: 100 }));
  const movieP1 = mk("movie", [1000, 900, 800, 700], 1);
  const tvP1 = mk("tv", [950, 600, 500, 400], 101);
  const movieP2 = mk("movie", [690, 680, 670], 5);
  const tvP2 = mk("tv", [850, 840, 830], 105);
  const sorted = sortPool([...movieP1, ...tvP1, ...movieP2, ...tvP2], "popular");
  const values = sorted.map((c) => c.popularity);

  assert.deepEqual(values.slice(0, 8), [1000, 950, 900, 850, 840, 830, 800, 700]);
  for (let i = 1; i < values.length; i++) assert.ok(values[i - 1] >= values[i]);
});

test("Todos: pool fixo → páginas 1..20 = pool ordenado; nunca volta para trás; sem repetir nem perder", () => {
  for (const sort of ["popular", "rating", "newest"]) {
    // popularidade NÃO monotônica dentro das listas (como o TMDB devolve)
    const movies = list("movie", 400, (i) => ({ popularity: 1000 - i * 2 + (i % 5 === 2 ? 70 : 0), vote_average: 9 - (i % 37) * 0.03 }));
    const tv = list("tv", 400, (i) => ({ popularity: 999 - i * 2 + (i % 7 === 3 ? 90 : 0), vote_average: 9 - (i % 41) * 0.03 }));
    const pool = [...movies, ...tv];
    const seen = new Set();
    const all = [];

    for (let n = 1; n <= ALL_MAX_PAGES; n++) {
      const p = allPage(pool, sort, n);
      assert.equal(p.length, PAGE_SIZE);
      for (const c of p) {
        assert.ok(!seen.has(k(c)), `${sort}: ${k(c)} repetido`);
        seen.add(k(c));
      }
      all.push(...p);
    }

    assert.deepEqual(all.map(k), sortPool(pool, sort).slice(0, ALL_MAX_PAGES * PAGE_SIZE).map(k), `${sort}: concatenação = topo do pool ordenado`);
    for (let i = 1; i < all.length; i++) assert.ok(compareForSort(all[i - 1], all[i], sort) < 0, `${sort}: volta para trás em ${i}`);
  }
});

test("Todos: repetido no pool (o TMDB repete entre páginas) aparece uma vez só", () => {
  const a = { id: 7, media_type: "movie", popularity: 50 };
  const sorted = sortPool([a, { ...a }, { id: 7, media_type: "tv", popularity: 40 }], "popular");
  assert.deepEqual(sorted.map(k), ["movie-7", "tv-7"]);
});

test("desempate determinístico (chave igual → avaliações, data, filme antes de série, id)", () => {
  const base = { popularity: 10, vote_average: 8, vote_count: 500, release_date: "2026-01-01", first_air_date: "2026-01-01" };
  const items = [
    { ...base, id: 9, media_type: "tv" },
    { ...base, id: 3, media_type: "movie" },
    { ...base, id: 1, media_type: "tv" },
    { ...base, id: 2, media_type: "movie", vote_count: 900 },
  ];
  for (const sort of ["popular", "rating", "newest"]) {
    const a = sortPool(items, sort).map(k);
    const b = sortPool([...items].reverse(), sort).map(k);
    assert.deepEqual(a, b, `${sort}: independe da ordem de chegada`);
    assert.deepEqual(a, ["movie-2", "movie-3", "tv-1", "tv-9"], sort);
  }
});

test("rating: confiança por votos — 9,8/10 e 9,2/100 ficam fora; 8,8/10.000 antes de 8,5/100.000", () => {
  const cands = [
    { id: 1, media_type: "movie", vote_average: 9.8, vote_count: 10 },
    { id: 2, media_type: "movie", vote_average: 9.2, vote_count: 100 },
    { id: 3, media_type: "movie", vote_average: 8.8, vote_count: 10000 },
    { id: 4, media_type: "movie", vote_average: 8.5, vote_count: 100000 },
  ];
  // a API pede ao TMDB vote_count.gte = RATING_MIN_VOTES; aqui, a mesma regra
  const eligible = cands.filter((c) => c.vote_count >= RATING_MIN_VOTES).sort((a, b) => compareForSort(a, b, "rating"));

  assert.equal(RATING_MIN_VOTES, 500);
  assert.deepEqual(eligible.map((c) => c.id), [3, 4]);
});

test("rating no merge: nota igual → mais votos primeiro", () => {
  const a = { id: 1, media_type: "tv", vote_average: 8.7, vote_count: 900 };
  const b = { id: 2, media_type: "movie", vote_average: 8.7, vote_count: 30000 };
  assert.ok(compareForSort(b, a, "rating") < 0);
});

test("newest: compara por data de lançamento (filme) e de estreia (série)", () => {
  const m = { id: 1, media_type: "movie", release_date: "2026-10-10" };
  const t = { id: 2, media_type: "tv", first_air_date: "2026-10-12" };
  assert.ok(compareForSort(t, m, "newest") < 0);
});

test("gêneros: equivalência filme ↔ série e gêneros de um tipo só", () => {
  assert.equal(genreForType(878, "movie"), "878");
  assert.equal(genreForType(878, "tv"), "10765", "Ficção científica → Sci-Fi & Fantasy");
  assert.equal(genreForType(28, "tv"), "10759", "Ação → Action & Adventure");
  assert.equal(genreForType(10759, "movie"), "28|12");
  assert.equal(genreForType(18, "tv"), "18");
  assert.equal(genreForType(27, "tv"), null, "Terror não existe para séries no TMDB");
  assert.equal(genreForType(10749, "tv"), null, "Romance também não");
  assert.equal(genreForType(10764, "movie"), null, "Reality só existe em séries");
});

test("totais honestos: 20.001 do TMDB não vira 'X títulos encontrados'", () => {
  const capped = { total_results: 20001, total_pages: 1001 };
  const t = totalsFor("movie", { movie: capped });
  assert.equal(t.total_capped, true);
  assert.equal(t.total_label, "Mais de 20.000");
  assert.equal(t.total_pages, TMDB_MAX_PAGES);
  const all = totalsFor("all", { movie: capped, tv: capped });
  assert.equal(all.total_label, "Mais de 40.000");
  assert.equal(all.total_pages, ALL_MAX_PAGES);
  assert.equal(all.depth_limited, true);
  const small = totalsFor("all", { movie: { total_results: 37, total_pages: 2 }, tv: { total_results: 12, total_pages: 1 } });
  assert.deepEqual([small.total_label, small.total_capped, small.total_pages, small.depth_limited], ["49", false, 3, false]);
  const none = totalsFor("movie", { movie: { total_results: 0, total_pages: 0 } });
  assert.equal(none.total_pages, 1);
});

test("página fora do intervalo é normalizada", () => {
  assert.equal(clampPage(999999, 500), 500);
  assert.equal(clampPage(-3, 500), 1);
  assert.equal(clampPage(0, 0), 1);
  assert.equal(clampPage(2.7, 10), 2);
});

test("URL: valores inválidos normalizados; filtros válidos sobrevivem ida e volta", () => {
  const bad = parseDiscoverParams(new URLSearchParams("type=x&sort=y&page=-5&genre=abc&year=99&rating=3&country=coreia&provider=a;b"));
  assert.deepEqual(bad, DEFAULT_DISCOVER_PARAMS);
  assert.equal(parseDiscoverParams(new URLSearchParams("genre=999999")).genre, "", "gênero inexistente");
  assert.equal(parseDiscoverParams(new URLSearchParams("year=2400")).year, "");
  assert.equal(parseDiscoverParams(new URLSearchParams("page=abc")).page, 1);
  const good = parseDiscoverParams(new URLSearchParams("type=tv&sort=rating&page=3&genre=18&year=2024&rating=7&country=kr&provider=8&hide_watched=1&only_new=1"));
  assert.deepEqual(good, { type: "tv", sort: "rating", page: 3, genre: "18", year: "2024", rating: "7", country: "KR", provider: "8", hideWatched: true, onlyNew: true });
  assert.deepEqual(parseDiscoverParams(serializeDiscoverParams(good)), good);
  assert.equal(parseDiscoverParams(new URLSearchParams("provider=mine")).provider, "mine");
});

test("streaming: mesma regra de 'Para você' — relevantes no Brasil, sem variantes, até 40, escolhido nunca some", () => {
  const raw = [
    { provider_id: 8, provider_name: "Netflix", display_priorities: { BR: 1 } },
    { provider_id: 1796, provider_name: "Netflix Standard with Ads", display_priorities: { BR: 2 } },
    { provider_id: 119, provider_name: "Amazon Prime Video", display_priorities: { BR: 3 } },
    { provider_id: 582, provider_name: "Paramount+ Amazon Channel", display_priorities: { BR: 4 } },
    ...Array.from({ length: 60 }, (_, i) => ({ provider_id: 1000 + i, provider_name: `Serviço ${i}`, display_priorities: { BR: 10 + i } })),
  ];
  const out = relevantBrProviders(raw);
  assert.equal(out.length, 40);
  assert.equal(out[0].provider_name, "Netflix");
  assert.ok(!out.some((p) => /with Ads|Channel/.test(p.provider_name)));
  const kept = relevantBrProviders(raw, 1059);
  assert.ok(kept.some((p) => p.provider_id === 1059), "provedor escolhido na URL continua na lista");
});

/* ---------- filtros pessoais ANTES da paginação ---------- */
const universeOf = (n) => sortPool(list("movie", n).concat(list("tv", 0)), "popular");
const ids = (items) => items.map(k);

test("ocultar assistidos: 15 assistidos no topo → página 1 cheia com os 20 primeiros elegíveis", () => {
  const universe = universeOf(45);
  const watched = new Set(ids(universe.slice(0, 15)));
  const r = eligiblePage(universe, 1, (c) => watched.has(k(c)));

  assert.equal(r.items.length, 20, "não 5");
  assert.deepEqual(ids(r.items), ids(universe.slice(15, 35)));
  assert.equal(r.hidden, 15);
});

test("só fora da biblioteca: 20 na Biblioteca no topo → página 1 = candidatos 21–40", () => {
  const universe = universeOf(45);
  const inLibrary = new Set(ids(universe.slice(0, 20)));
  const r = eligiblePage(universe, 1, (c) => inLibrary.has(k(c)));

  assert.deepEqual(ids(r.items), ids(universe.slice(20, 40)));
});

test("páginas 1 + 2 com filtros = primeiros 40 elegíveis, sem repetir nem pular, ordem neutra", () => {
  const universe = universeOf(120);
  const excludedSet = new Set(ids(universe.filter((_, i) => i % 3 === 0)));
  const excluded = (c) => excludedSet.has(k(c));
  const both = [...eligiblePage(universe, 1, excluded).items, ...eligiblePage(universe, 2, excluded).items];
  const firstEligible = universe.filter((c) => !excluded(c)).slice(0, 40);

  assert.equal(new Set(ids(both)).size, 40);
  assert.deepEqual(ids(both), ids(firstEligible));
});

test("A × B: elegíveis aparecem na mesma ordem relativa para os dois", () => {
  const universe = universeOf(100);
  const aWatched = new Set(ids(universe.filter((_, i) => i % 2 === 0)));
  const a = [1, 2].flatMap((n) => eligiblePage(universe, n, (c) => aWatched.has(k(c))).items);
  const b = [1, 2, 3, 4, 5].flatMap((n) => eligiblePage(universe, n, () => false).items);
  const bOrderOfA = b.filter((c) => a.some((x) => k(x) === k(c)));

  assert.deepEqual(ids(a), ids(bOrderOfA));
});

test("toggles desligados: exatamente a paginação neutra", () => {
  const universe = universeOf(400);
  for (const n of [1, 2, 7, 20]) assert.deepEqual(ids(eligiblePage(universe, n, () => false).items), ids(pageSlice(universe, n)));
  assert.equal(eligiblePage(universe, 1, () => false).total_pages, 20);
});

test("escassez real: só 13 elegíveis → página 1 com 13, sem preencher", () => {
  const universe = universeOf(40);
  const keep = new Set(ids(universe.slice(0, 13)));
  const r = eligiblePage(universe, 1, (c) => !keep.has(k(c)));

  assert.equal(r.items.length, 13);
  assert.equal(r.total_pages, 1);
});

test("última página com filtros: total de páginas pelos elegíveis; pedido além → última", () => {
  const universe = universeOf(90);
  const excludedSet = new Set(ids(universe.slice(0, 25)));
  const excluded = (c) => excludedSet.has(k(c));
  const r1 = eligiblePage(universe, 1, excluded);
  const last = eligiblePage(universe, 99, excluded);

  assert.equal(r1.eligible_count, 65);
  assert.equal(r1.total_pages, 4);
  assert.equal(last.page, 4);
  assert.equal(last.items.length, 5);
});
