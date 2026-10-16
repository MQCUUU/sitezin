// Testes de domínio da Busca (V3.2): node scripts/test-search.mjs
// Puro (sem rede/banco). O resolvedor de pessoa × personagem do índice local
// continua em scripts/test-search-entity-resolver.mjs.
// Opcional, contra um servidor local (TEST): SEARCH_QA_BASE=http://localhost:3991 node scripts/test-search.mjs
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
  normalizeSearch, isSearchable, MIN_QUERY_LENGTH, titleVariants, isExactTitle, titleMatchScore,
  mediaIdentity, dedupeMedia, rankTitles, isSelfPortrayal, NOTABLE_PERSON_POPULARITY, resultCountLabel,
} = await import("../lib/search/rank.ts");
const { needsPersonVariants, personVariantsFor, PRIMARY_TIMEOUT_MS, SECONDARY_TIMEOUT_MS } = await import("../lib/search/progressive.ts");
const { createUpstreamLog, parseUpstreamHeader, sqlCallName } = await import("../lib/search/upstream.ts");
const { chunkLibraryStatePairs, LIBRARY_STATE_BATCH_SIZE } = await import("../lib/library-state-batches.ts");

/* ---------- dados reais (ids TMDB) ---------- */
const INTERESTELAR = { id: 157336, media_type: "movie", title: "Interestelar", original_title: "Interstellar", popularity: 40, vote_count: 38000 };
const ORVILLE = { id: 71738, media_type: "tv", name: "Orville: nave interestelar", original_name: "The Orville", popularity: 30, vote_count: 1400 };
const ELLA = { id: 212171, media_type: "tv", name: "Ella, a Menina das Estrelas", original_name: "Interstellar Ella", popularity: 2, vote_count: 3 };
const WARS = { id: 398188, media_type: "movie", title: "Interstellar Wars", original_title: "Interstellar Wars", popularity: 3, vote_count: 20 };
const STELLA = { id: 1391726, media_type: "movie", title: "Interstellar Stella", original_title: "Interstellar Stella", popularity: 1, vote_count: 0 };
const OFFICE_UK = { id: 2996, media_type: "tv", name: "The Office", original_name: "The Office", popularity: 20, vote_count: 1500 };
const OFFICE_US = { id: 2316, media_type: "tv", name: "The Office", original_name: "The Office", popularity: 150, vote_count: 4000 };
const BATMAN_1989 = { id: 268, media_type: "movie", title: "Batman", original_title: "Batman", popularity: 20, vote_count: 8000 };
const BATMAN_2022 = { id: 414906, media_type: "movie", title: "Batman", original_title: "The Batman", popularity: 60, vote_count: 10000 };
const BATMAN_ROBIN_TV = { id: 2287, media_type: "tv", name: "Batman e Robin", original_name: "Batman", popularity: 30, vote_count: 400 };
const BB = { id: 1396, media_type: "tv", name: "Breaking Bad", original_name: "Breaking Bad", popularity: 200, vote_count: 15000 };
const EL_CAMINO = { id: 559969, media_type: "movie", title: "El Camino: A Breaking Bad Film", original_title: "El Camino: A Breaking Bad Film", popularity: 20, vote_count: 5000 };
const CORACAO = { id: 197, media_type: "movie", title: "Coração Valente", original_title: "Braveheart", popularity: 30, vote_count: 10000 };

/* ================================================================ NORMALIZAÇÃO */

test("normalização: caixa, acentos, espaços e Unicode não mudam o termo", () => {
  assert.equal(normalizeSearch("  CORAÇÃO   Valente "), "coracao valente");
  assert.equal(normalizeSearch("Ação"), normalizeSearch("acao"));
  assert.equal(normalizeSearch("São Paulo"), normalizeSearch("sao paulo"));
  assert.equal(normalizeSearch("Amélie"), "amelie");
  assert.equal(normalizeSearch("Pokémon: O Filme!"), "pokemon o filme");
  assert.equal(normalizeSearch("é"), "e", "forma decomposta (NFD) também");
  assert.equal(normalizeSearch("東京"), "東京", "escrita não latina é preservada");
  assert.equal(normalizeSearch(null), "");
});

test("mínimo de 2 caracteres (0, 1, 2; espaços e '@' não contam)", () => {
  assert.equal(MIN_QUERY_LENGTH, 2);
  assert.equal(isSearchable(""), false);
  assert.equal(isSearchable("a"), false);
  assert.equal(isSearchable(" a "), false);
  assert.equal(isSearchable("@a"), false);
  assert.equal(isSearchable("ab"), true);
  assert.equal(isSearchable("@ab"), true);
  assert.equal(isSearchable("x".repeat(100)), true, "consulta longa");
  assert.equal(isSearchable("%_'\"<>"), true, "caracteres especiais não quebram");
});

/* ================================================================ IDENTIDADE / DEDUP */

test("título localizado e original identificam a MESMA obra", () => {
  assert.deepEqual(titleVariants(INTERESTELAR), ["Interestelar", "Interstellar"]);
  assert.equal(isExactTitle("Interestelar", INTERESTELAR), true);
  assert.equal(isExactTitle("interstellar", INTERESTELAR), true);
  assert.equal(isExactTitle("Braveheart", CORACAO), true);
  assert.equal(isExactTitle("coracao valente", CORACAO), true);
  assert.equal(mediaIdentity(INTERESTELAR), "movie:157336");
});

test("dedup por identidade (tipo + id TMDB): mesma obra 1×, homônimos separados", () => {
  const list = dedupeMedia([INTERESTELAR, { ...INTERESTELAR, title: "Interstellar" }, OFFICE_US, OFFICE_UK, BATMAN_1989, BATMAN_2022]);
  assert.deepEqual(list.map(mediaIdentity), ["movie:157336", "tv:2316", "tv:2996", "movie:268", "movie:414906"]);
  // mesmo número de id com tipos diferentes NÃO é a mesma obra
  assert.equal(dedupeMedia([{ id: 1, media_type: "movie" }, { id: 1, media_type: "tv" }]).length, 2);
});

/* ================================================================ RANKING */

test("Interstellar (original) → Interestelar primeiro (antes era 'Interstellar Wars')", () => {
  const ranked = rankTitles("Interstellar", [WARS, STELLA, ELLA, INTERESTELAR]);
  assert.equal(ranked[0].id, 157336);
});

test("Interestelar → exato antes de 'Orville: nave interestelar' e de correspondências indiretas", () => {
  const ranked = rankTitles("Interestelar", [ORVILLE, ELLA, INTERESTELAR]);
  assert.deepEqual(ranked.map((r) => r.id), [157336, 71738, 212171]);
});

test("níveis: exato > começa com > contém > indireto (popularidade só desempata no nível)", () => {
  const q = "Breaking Bad";
  const exact = titleMatchScore(q, BB);
  const contains = titleMatchScore(q, EL_CAMINO);
  const prefix = titleMatchScore(q, { id: 9, media_type: "movie", title: "Breaking Bad Wolf", popularity: 0, vote_count: 0 });
  const indirect = titleMatchScore(q, { id: 8, media_type: "movie", title: "Sem relação", popularity: 999, vote_count: 99999 });
  assert.ok(exact > prefix && prefix > contains && contains > indirect);
  // série exata vence filme relacionado mesmo com o filme vindo antes do TMDB
  assert.equal(rankTitles(q, [EL_CAMINO, BB])[0].id, 1396);
});

test("homônimos: Batman 1989 e Batman 2022 ficam separados e ambos exatos", () => {
  const ranked = rankTitles("batman", [BATMAN_ROBIN_TV, BATMAN_1989, BATMAN_2022]);
  assert.equal(ranked.length, 3);
  assert.deepEqual(ranked.slice(0, 2).map((r) => r.id).sort(), [268, 414906]);
  const office = rankTitles("The Office", [OFFICE_UK, OFFICE_US]);
  assert.deepEqual(office.map((r) => r.id), [2316, 2996], "mesmo nível exato: desempate por popularidade, nenhum some");
});

test("acentos não mudam a ordem: 'Coração Valente' = 'coracao valente'", () => {
  const items = [{ id: 51107, media_type: "movie", title: "O Elefantinho de Coração Valente" }, CORACAO, { id: 33987, media_type: "tv", name: "Coração Valente", original_name: "Coração Valente" }];
  assert.deepEqual(rankTitles("Coração Valente", items).map(mediaIdentity), rankTitles("coracao valente", items).map(mediaIdentity));
});

test("ranking é neutro: só filmes/séries, empate mantém a ordem do TMDB, nada pessoal entra", () => {
  const a = { id: 1, media_type: "movie", title: "Igual" };
  const b = { id: 2, media_type: "movie", title: "Igual" };
  assert.deepEqual(rankTitles("igual", [a, b]).map((r) => r.id), [1, 2]);
  assert.deepEqual(rankTitles("igual", [b, a]).map((r) => r.id), [2, 1]);
  assert.equal(rankTitles("x", [{ id: 3, media_type: "person", name: "X" }]).length, 0);
  // um campo "na biblioteca" não muda nada
  assert.deepEqual(rankTitles("igual", [{ ...a, in_library: true, status: "watched" }, b]).map((r) => r.id), [1, 2]);
});

test("typo: sem fuzzy inventado — 'interstlar' não vira exato; semelhança só desempata", () => {
  assert.equal(isExactTitle("interstlar", INTERESTELAR), false);
  assert.ok(titleMatchScore("interstlar", INTERESTELAR) < titleMatchScore("Interestelar", INTERESTELAR));
});

/* ================================================================ PESSOA × PERSONAGEM */

test("pessoa conhecida com personagem homônimo (Tom Hanks como ele mesmo) → pessoa", () => {
  const people = [{ name: "Tom Hanks", popularity: 60 }];
  assert.equal(isSelfPortrayal("Tom Hanks", "Tom Hanks", people), true);
  assert.equal(isSelfPortrayal("tom hanks", "Tom Hanks", people), true);
});

test("personagem de verdade continua personagem (homônimo obscuro não rouba)", () => {
  assert.equal(isSelfPortrayal("Walter White", "Walter White", [{ name: "Walter White", popularity: 0.6 }]), false);
  assert.equal(isSelfPortrayal("Bruce Wayne", "Bruce Wayne", []), false);
  assert.equal(isSelfPortrayal("Tom Hanks", "Woody", [{ name: "Tom Hanks", popularity: 60 }]), false, "personagem com outro nome");
  assert.equal(NOTABLE_PERSON_POPULARITY, 8);
});

/* ================================================================ RECORTE */

test("recorte honesto: quando o TMDB tem mais, dizemos; senão, só a contagem", () => {
  assert.equal(resultCountLabel(20, 232), "Os 20 títulos mais relevantes entre 232 resultados. Refine a busca para encontrar outros.");
  assert.equal(resultCountLabel(4, 4), "4 títulos encontrados.");
  assert.equal(resultCountLabel(1, null), "1 título encontrado.");
});

/* ================================================================ PERFORMANCE (V3.2 — última validação) */

const TOM_HANKS_PERSON = { id: 31, media_type: "person", name: "Tom Hanks", popularity: 60 };
// Chamadas TMDB do dropdown: multi + person + collection (+ variantes só na 2ª tentativa).
const suggestTmdbCalls = (query, multi) => 3 + (needsPersonVariants(query, multi) ? personVariantsFor(query).length : 0);

test("upstream documentado: Batman/Interestelar/The Office = 3 chamadas TMDB; pessoa/typo ≤ 6", () => {
  assert.equal(suggestTmdbCalls("Batman", [BATMAN_2022, BATMAN_1989, BATMAN_ROBIN_TV]), 3, "antes: 4");
  assert.equal(suggestTmdbCalls("Interestelar", [INTERESTELAR, ORVILLE]), 3, "antes: 4");
  assert.equal(suggestTmdbCalls("The Office", [OFFICE_US, OFFICE_UK]), 3, "antes: 6");
  assert.equal(suggestTmdbCalls("Tom Hanks", [TOM_HANKS_PERSON]), 6, "pessoa: variantes mantidas (antes: 6)");
  assert.equal(suggestTmdbCalls("batmaan", [BATMAN_2022]), 4, "typo: 1 variante de prefixo");
  assert.ok(suggestTmdbCalls("zzzxxyyqqq", []) <= 6);
  assert.ok(PRIMARY_TIMEOUT_MS > SECONDARY_TIMEOUT_MS, "fonte secundária desiste antes da principal");
});

test("2ª tentativa: pessoa com o nome exato NÃO conta como título exato (bug encontrado na validação)", () => {
  assert.equal(needsPersonVariants("Tom Hanks", [TOM_HANKS_PERSON]), true);
  assert.equal(needsPersonVariants("Batman", [BATMAN_1989]), false);
  assert.equal(needsPersonVariants("Interstellar", [INTERESTELAR]), false, "título original também é exato");
  assert.equal(needsPersonVariants("Interest", [INTERESTELAR]), true, "prefixo não corta a 2ª tentativa");
  assert.equal(needsPersonVariants("x", [null, 1, "a"]), true);
});

test("variantes de pessoa: as mesmas de antes, sem repetir a query original, máx. 3", () => {
  assert.deepEqual(personVariantsFor("Tom Hanks"), ["tom", "hanks", "tom hank"]);
  assert.deepEqual(personVariantsFor("batmaan"), ["batmaa"]);
  assert.deepEqual(personVariantsFor("Zé"), []);
  assert.ok(personVariantsFor("um dois tres quatro").length <= 3);
});

test("Server-Timing: registra nome/duração/falha, nunca a query; parse ida e volta", async () => {
  const log = createUpstreamLog();
  await log.track("tmdb:/search/multi", async () => 1);
  await assert.rejects(log.track("tmdb:/search/collection", async () => { throw new Error("timeout"); }));
  const parsed = parseUpstreamHeader(log.header(12.5));
  assert.deepEqual(parsed.map((c) => c.name), ["tmdb:/search/multi", "tmdb:/search/collection:falhou"]);
  assert.equal(sqlCallName(["SELECT * FROM public.search_v4_characters(", ", 5)"]), "db:search_v4_characters");
  assert.equal(sqlCallName(["SELECT id FROM public.profiles WHERE username ILIKE ", ""]), "db:profiles");
  assert.ok(!log.header().includes("batman"));
});

test("fontes independentes em paralelo: o tempo total ≈ a mais lenta, não a soma", async () => {
  const log = createUpstreamLog();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = performance.now();
  await Promise.all([log.track("tmdb:a", () => wait(120)), log.track("db:b", () => wait(120)), log.track("db:c", () => wait(120))]);
  const total = performance.now() - t0;
  const sum = log.calls.reduce((acc, c) => acc + c.ms, 0);
  assert.ok(total < sum * 0.6, `total ${Math.round(total)}ms vs soma ${Math.round(sum)}ms`);
});

test("estado pessoal em lote: só pares válidos dos resultados, sem duplicata, ≤100 por chamada", () => {
  const shown = [BATMAN_2022, BATMAN_1989, BATMAN_ROBIN_TV, BATMAN_2022, { id: 268, media_type: "tv" }, { id: 5, media_type: "person" }, { id: "x", media_type: "movie" }, { id: -1, media_type: "tv" }];
  const batches = chunkLibraryStatePairs(shown);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], [
    { media_type: "movie", tmdb_id: 414906 },
    { media_type: "movie", tmdb_id: 268 },
    { media_type: "tv", tmdb_id: 2287 },
    { media_type: "tv", tmdb_id: 268 },
  ], "mesmo id em filme e série são títulos diferentes");
  assert.equal(LIBRARY_STATE_BATCH_SIZE, 100);
  const many = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, media_type: "movie" }));
  assert.deepEqual(chunkLibraryStatePairs(many).map((b) => b.length), [100, 100, 50], "ceil(N/100) chamadas, nunca N");
  assert.deepEqual(chunkLibraryStatePairs([]), [], "sem resultado, sem chamada");
});

test("tamanho da Biblioteca não entra no lookup: nº de chamadas depende só dos resultados exibidos", () => {
  // O helper nem recebe a Biblioteca: 20 resultados = 1 chamada com 0, 144, 1.000 ou 5.000 itens
  // (medido no TEST: 1 POST, 1 consulta SQL, 0,11–0,29 ms e 55–75 buffers em todos os tamanhos).
  const twenty = Array.from({ length: 20 }, (_, i) => ({ id: 1000 + i, media_type: i % 2 ? "tv" : "movie" }));
  for (const librarySize of [0, 144, 1000, 5000]) {
    assert.equal(chunkLibraryStatePairs(twenty).length, 1, `biblioteca de ${librarySize}`);
  }
});

/* ---------- ao vivo (opcional): SEARCH_QA_BASE aponta para um servidor TEST ---------- */

const BASE = process.env.SEARCH_QA_BASE;
const live = { skip: BASE ? false : "defina SEARCH_QA_BASE para rodar contra o servidor local" };
const timing = async (path) => {
  const r = await fetch(BASE + path);
  const header = r.headers.get("server-timing") || "";
  return { r, body: await r.json(), calls: parseUpstreamHeader(header), total: Number(/total;dur=([\d.]+)/.exec(header)?.[1] || 0) };
};

test("ao vivo: chamadas TMDB por query (suggest/advanced) batem com o documentado", live, async () => {
  const expected = { Batman: [3, 2], Interestelar: [3, 2], "Tom Hanks": [6, 21], "The Office": [3, 2] };
  for (const [q, [sug, adv]] of Object.entries(expected)) {
    const s = await timing(`/api/search/suggest?q=${encodeURIComponent(q)}`);
    const a = await timing(`/api/search/advanced?q=${encodeURIComponent(q)}`);
    assert.equal(s.calls.filter((c) => c.name.startsWith("tmdb")).length, sug, `suggest ${q}`);
    assert.equal(a.calls.filter((c) => c.name.startsWith("tmdb")).length, adv, `advanced ${q}`);
  }
});

test("ao vivo: no suggest, TMDB e SQL se sobrepõem (total < soma das fontes)", live, async () => {
  const s = await timing("/api/search/suggest?q=Tom%20Hanks");
  const sum = s.calls.reduce((acc, c) => acc + c.ms, 0);
  assert.ok(s.total < sum, `total ${s.total} vs soma ${Math.round(sum)}`);
});

test("ao vivo: resultado igual ao de antes (IDs e ordem)", live, async () => {
  const ids = (list) => list.map((x) => (x.kind && x.kind !== "media" ? `${x.kind}:${x.name}` : `${x.media_type}:${x.id}`));
  const tom = await timing("/api/search/suggest?q=Tom%20Hanks");
  assert.deepEqual(ids(tom.body.suggestions), ["movie:1128918", "movie:1707402", "movie:728217", "movie:923252", "movie:1116589", "person:Tom Hanks", "person:Tom Hankins", "person:Jim Hanks"]);
  const inter = await timing("/api/search/advanced?q=Interstellar");
  assert.equal(ids(inter.body.results)[0], "movie:157336");
  const bat = await timing("/api/search/advanced?q=Batman");
  assert.deepEqual(ids(bat.body.results).slice(0, 3), ["movie:414906", "movie:268", "tv:2287"]);
});

test("ao vivo: rotas públicas cacheáveis sem estado pessoal; lote é privado e exige sessão", live, async () => {
  for (const path of ["/api/search/suggest?q=Batman", "/api/search/advanced?q=Batman", "/api/search/advanced?q=zzzxxyyqqq"]) {
    const { body } = await timing(path);
    assert.ok(!/"(status|favorite|library_id|personal_rating)"/.test(JSON.stringify(body)), `${path} sem campos pessoais`);
  }
  const unresolved = await timing("/api/search/advanced?q=zzzxxyyqqq");
  assert.ok(Array.isArray(unresolved.body.catalog), "advanced devolve o multi (a página não repete /api/search)");
  const state = await fetch(BASE + "/api/library/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ media_type: "movie", tmdb_id: 268 }] }) });
  assert.equal(state.status, 401);
});
