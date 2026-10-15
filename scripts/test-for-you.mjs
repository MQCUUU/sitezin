// Testes de domínio de "Para você" (V2.8): node scripts/test-for-you.mjs
// Node 24 executa os .ts puros direto; o hook abaixo só completa a extensão dos imports relativos.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { buildProfile, titleWeight, ratingWeight, ratingMean, anchorOrder, anchorsPerPage, topGenres } = await import("../lib/for-you/profile.ts");
const { anchorWord, assemble, balanceTypes, bayes, franchiseKey, isEligible, scoreCandidate, sortScored, typeCounts } = await import("../lib/for-you/rank.ts");
const { keysFromIds, keysFromNames, genreKeyFromParam } = await import("../lib/for-you/genres.ts");
const { parseForYouQuery, serializeForYouQuery, DEFAULT_FOR_YOU_QUERY } = await import("../lib/for-you/url.ts");

/* ---------- fábricas ---------- */
const NOW = Date.parse("2026-10-15T12:00:00Z");
const RECENT = "2026-10-01T00:00:00Z";
let nextId = 1;
const sig = (o) => ({
  media_type: "movie",
  tmdb_id: nextId++,
  title: `T${nextId}`,
  genres: ["Drama"],
  status: "watched",
  favorite: false,
  rating: null,
  rewatched: false,
  watched_history: false,
  episodes_watched: 0,
  in_library: true,
  updated_at: RECENT,
  ...o,
});
const SCIFI = ["Ficção científica", "Aventura"];
const ROMCOM = ["Romance", "Comédia"];
const cand = (o) => ({
  id: nextId++,
  media_type: "movie",
  title: `C${nextId}`,
  original_title: `Candidate${nextId}`,
  genre_ids: [18],
  vote_average: 7.5,
  vote_count: 2000,
  popularity: 50,
  poster_path: "/p.jpg",
  overview: "Uma história.",
  ...o,
});
const rank = (profile, list) => sortScored(list.map((c) => scoreCandidate(profile, c)), "recommended");
const ids = (list) => list.map((c) => c.id);

/* usuários sintéticos */
const userA = () =>
  buildProfile(
    [
      sig({ title: "Interestelar", genres: SCIFI, rating: 10, favorite: true }),
      sig({ genres: SCIFI, rating: 9 }),
      sig({ genres: ["Ficção científica", "Ação"], rating: 9 }),
      sig({ genres: SCIFI, rating: 8.5 }),
      sig({ media_type: "tv", genres: ["Sci-Fi & Fantasy", "Drama"], rating: 9 }),
      sig({ genres: ROMCOM, rating: 5 }),
    ],
    NOW
  );
const userB = () =>
  buildProfile(
    [
      sig({ genres: ROMCOM, rating: 9.5, favorite: true }),
      sig({ genres: ROMCOM, rating: 9 }),
      sig({ genres: ["Romance", "Drama"], rating: 8.5 }),
      sig({ genres: ["Comédia"], rating: 9 }),
      sig({ genres: ROMCOM, rating: 8 }),
      sig({ media_type: "tv", genres: ["Sci-Fi & Fantasy"], status: "dropped", rating: null, episodes_watched: 2 }),
      sig({ genres: SCIFI, status: "dropped" }),
    ],
    NOW
  );
const scifiCands = () => Array.from({ length: 6 }, () => cand({ genre_ids: [878, 12] }));
const romCands = () => Array.from({ length: 6 }, () => cand({ genre_ids: [10749, 35] }));

/* ---------- sinais e perfis ---------- */
test("dois usuários com gostos opostos recebem rankings opostos", () => {
  const A = userA();
  const B = userB();
  const pool = [...scifiCands(), ...romCands()];
  const topA = rank(A, pool).slice(0, 6);
  const topB = rank(B, pool).slice(0, 6);

  assert.ok(A.genre.get("scifi") > 0.5);
  assert.ok(B.genre.get("scifi") < 0, "abandonar ficção científica deixa a afinidade negativa para B");
  assert.ok(topA.every((c) => c.genre_ids.includes(878)), "A: top 6 é ficção científica");
  assert.ok(topB.every((c) => c.genre_ids.includes(10749)), "B: top 6 é romance/comédia");
  assert.equal(ids(topA).filter((id) => ids(topB).includes(id)).length, 0);
});

test("nota pessoal: 10 pesa mais que 8, nota baixa reduz, sem nota é neutra", () => {
  const w = (rating) => titleWeight(sig({ rating }), null, NOW);

  assert.ok(w(10) > w(8) && w(8) > w(7) && w(7) > w(5));
  assert.ok(w(5) < 0, "nota bem abaixo do seu normal vira sinal negativo");
  assert.ok(Math.abs(w(null) - 1) < 0.05, "assistido sem nota = só a base (× recência)");
});

test("nota muda o feed: 10 sobe o gênero, nota baixa derruba", () => {
  const base = [sig({ genres: ["Drama"], rating: 8 }), sig({ genres: ["Drama"], rating: 8 }), sig({ genres: ["Terror"] }), sig({ genres: ["Comédia"], rating: 8 })];
  const horror = cand({ genre_ids: [27] });
  const others = [cand({ genre_ids: [18] }), cand({ genre_ids: [35] })];
  const pos = (profile) => ids(rank(profile, [horror, ...others])).indexOf(horror.id);
  const neutral = buildProfile(base, NOW);
  const loved = buildProfile([...base.slice(0, 2), { ...base[2], rating: 10 }, base[3]], NOW);
  const hated = buildProfile([...base.slice(0, 2), { ...base[2], rating: 3 }, base[3]], NOW);

  assert.ok(loved.genre.get("horror") > neutral.genre.get("horror"));
  assert.ok(hated.genre.get("horror") < 0);
  assert.equal(pos(loved), 0, "depois da nota 10, Terror lidera");
  assert.equal(pos(hated), 2, "depois da nota baixa, Terror vai para o fim");
});

test("curtido vira âncora e aumenta o peso", () => {
  const liked = sig({ title: "Interestelar", genres: SCIFI, favorite: true });
  const plain = sig({ genres: SCIFI });
  const p = buildProfile([liked, plain, sig(), sig(), sig()], NOW);

  assert.ok(p.anchors.some((a) => a.title === "Interestelar"));
  assert.ok(!p.anchors.some((a) => a.key === `movie-${plain.tmdb_id}`), "assistido sem nota não é âncora");
});

test("abandono reduz de forma proporcional (não zera o gênero) e penaliza parecidos", () => {
  const likes = [sig({ genres: ["Ficção científica"], rating: 9 }), sig({ genres: ["Ficção científica"], rating: 9 }), sig({ genres: ["Ficção científica"], rating: 8.5 }), sig({ genres: ["Drama"], rating: 8 })];
  const before = buildProfile(likes, NOW);
  const after = buildProfile([...likes, sig({ genres: ["Ficção científica"], status: "dropped" })], NOW);

  assert.ok(after.genre.get("scifi") > 0, "ainda gosta do gênero");
  assert.ok(after.genre.get("scifi") / Math.abs(after.genre.get("drama")) < before.genre.get("scifi") / Math.abs(before.genre.get("drama")));
  const c = cand({ genre_ids: [878] });
  assert.ok(scoreCandidate(after, c, { nearDropped: true }).score < scoreCandidate(after, c).score - 1);
});

test("série abandonada cedo pesa mais que abandonada depois de vários episódios", () => {
  const early = titleWeight(sig({ media_type: "tv", status: "dropped", episodes_watched: 2 }), null, NOW);
  const late = titleWeight(sig({ media_type: "tv", status: "dropped", episodes_watched: 12 }), null, NOW);

  assert.ok(early < late && late < 0);
});

test("reassistido aumenta a afinidade", () => {
  assert.ok(titleWeight(sig({ status: "rewatched", rating: 8 }), null, NOW) > titleWeight(sig({ status: "watched", rating: 8 }), null, NOW) + 1.5);
});

test("histórico fora da Biblioteca continua valendo (V2.5)", () => {
  const gone = sig({ genres: SCIFI, status: null, in_library: false, watched_history: true, rating: 9 });
  const p = buildProfile([gone], NOW);

  assert.ok(p.watched.has(`movie-${gone.tmdb_id}`), "conta como assistido (some com 'Ocultar assistidos')");
  assert.ok(!p.inLibrary.has(`movie-${gone.tmdb_id}`));
  assert.ok(p.genre.get("scifi") > 0 && p.positiveCount === 1);
});

test("recência: sinal antigo pesa menos, mas nunca menos que 40%", () => {
  const recent = titleWeight(sig({ rating: 9 }), null, NOW);
  const old = titleWeight(sig({ rating: 9, updated_at: "2020-01-01T00:00:00Z" }), null, NOW);

  assert.ok(old < recent && old >= recent * 0.4 - 1e-9);
});

test("gêneros cruzam filme e série (Sci-Fi & Fantasy ↔ Ficção científica)", () => {
  assert.deepEqual(keysFromIds("tv", [10765]).sort(), ["fantasy", "scifi"]);
  assert.deepEqual(keysFromNames(["Ficção científica"]), ["scifi"]);
  assert.equal(genreKeyFromParam("Ficção científica"), "scifi");
  assert.equal(genreKeyFromParam("Sci-Fi & Fantasy"), "scifi");
  const p = buildProfile([sig({ genres: ["Ficção científica"], rating: 9 }), sig({ genres: ["Drama"], rating: 7 })], NOW);
  const tvScifi = scoreCandidate(p, cand({ media_type: "tv", genre_ids: [10765] }));
  const tvDrama = scoreCandidate(p, cand({ media_type: "tv", genre_ids: [18] }));

  assert.ok(tvScifi.affinity > tvDrama.affinity);
});

/* ---------- montagem ---------- */
test("dedup global: o mesmo título nunca aparece em duas prateleiras", () => {
  const p = userA();
  const shared = scifiCands();
  const used = new Set();
  const first = assemble(rank(p, [...shared, ...scifiCands()]), { used, limit: 8 });
  const second = assemble(rank(p, [...shared, ...romCands()]), { used, limit: 8 });

  assert.equal(new Set([...ids(first), ...ids(second)]).size, first.length + second.length);
});

test("franquia não domina a prateleira (Batman: máximo 2, incluindo a coleção do âncora)", () => {
  const p = userA();
  const batman = [
    ["Batman", "Batman"], ["Batman Begins", "Batman Begins"], ["Batman", "The Batman"], ["Batman: Ataque ao Arkham", "Batman: Assault on Arkham"],
    ["Batman e Arlequina", "Batman and Harley Quinn"], ["Batman: Sangue Ruim", "Batman: Bad Blood"], ["O Cavaleiro das Trevas Ressurge", "The Dark Knight Rises"],
  ].map(([title, original_title]) => cand({ title, original_title, genre_ids: [28, 80], vote_count: 9000, vote_average: 8 }));
  const others = ["Heat", "Collateral", "Inception", "Drive", "Sicario", "Prisoners", "Zodiac", "Memento"].map((t) => cand({ original_title: t, genre_ids: [28], vote_average: 6.8 }));
  const ranked = rank(p, [...batman, ...others]).map((c) => (c.original_title === "The Dark Knight Rises" ? { ...c, franchise_override: "anchor" } : c));
  const shelf = assemble(ranked, { used: new Set(), limit: 10, reservedFranchise: [anchorWord("Batman: O Cavaleiro das Trevas")] });
  const batCount = shelf.filter((c) => batman.some((b) => b.id === c.id)).length;

  assert.equal(franchiseKey({ original_title: "The Batman" }), "batman");
  assert.equal(franchiseKey({ original_title: "Batman: Bad Blood" }), "batman");
  assert.notEqual(franchiseKey({ original_title: "Star Wars" }), franchiseKey({ original_title: "Star Trek" }));
  assert.notEqual(franchiseKey({ original_title: "John Wick" }), franchiseKey({ original_title: "John Carter" }));
  assert.equal(franchiseKey({ original_title: "Rush Hour 2" }), franchiseKey({ original_title: "Rush Hour 3" }));
  assert.equal(anchorWord("Batman: O Cavaleiro das Trevas"), "batman");
  assert.equal(franchiseKey({ original_title: "브레이크 더 사일런스", title: "Break the Silence: The Movie" }), "break the silence");
  assert.equal(anchorWord("O Poderoso Chefão"), "poderoso");
  assert.ok(batCount <= 2, `Batman na prateleira: ${batCount}`);
  assert.equal(shelf.length, 10, "a prateleira continua cheia com outros títulos");
});

test("filmes × séries acompanham o perfil (80/20, 50/50, 20/80) sem extremos", () => {
  const mk = (movies) =>
    buildProfile(
      Array.from({ length: 10 }, (_, i) => sig({ media_type: i < movies ? "movie" : "tv", genres: i < movies ? ["Drama"] : ["Drama"], rating: 8.5 })),
      NOW
    );
  const pool = [...Array.from({ length: 15 }, () => cand({ genre_ids: [18] })), ...Array.from({ length: 15 }, () => cand({ media_type: "tv", genre_ids: [18] }))];

  for (const [movies, lo, hi] of [[8, 6, 9], [5, 4, 6], [2, 1, 4]]) {
    const p = mk(movies);
    const shelf = assemble(rank(p, pool), { used: new Set(), limit: 10, movieShare: p.movieShare });
    const m = shelf.filter((c) => c.media_type === "movie").length;

    assert.ok(m >= lo && m <= hi, `${movies * 10}% filmes → ${m}/10 filmes`);
  }

  const extreme = mk(10);
  const capped = assemble(rank(extreme, pool), { used: new Set(), limit: 10, movieShare: extreme.movieShare });
  assert.ok(capped.filter((c) => c.media_type === "tv").length >= 1, "mesmo 100% filmes não vira 10/10 (cota 20–80%)");
});

test("joias: nota bayesiana — 9,8 com poucos votos não vence 8,2 com milhares; derivados ficam fora", () => {
  assert.ok(bayes(9.8, 30) < bayes(8.2, 5000));
  assert.ok(bayes(9.6, 108) < 8);
  assert.equal(isEligible(cand({ title: "KPop Demon Hunters Lyric Videos", original_title: "KPop Demon Hunters Lyric Videos" }), true), false);
  assert.equal(isEligible(cand({ title: "Chainsaw Man: A Compilação" }), true), false);
  assert.equal(isEligible(cand({ overview: "" }), true), false, "metadados incompletos");
  assert.equal(isEligible(cand({ genre_ids: [] }), false), false);
  assert.equal(isEligible(cand({ title: "Ao Vivo no Coração", original_title: "Ao Vivo no Coração", genre_ids: [18] }), true), true, "drama com 'ao vivo' no nome não é excluído");
  assert.equal(isEligible(cand({ title: "Banda X: Ao Vivo em SP", genre_ids: [10402] }), true), false, "show ao vivo de música é derivado");
});

test("bem avaliados: com nota parecida, a afinidade decide", () => {
  const p = userA();
  const offGenre = cand({ genre_ids: [10749], vote_average: 8.3, vote_count: 6000 });
  const inGenre = cand({ genre_ids: [878], vote_average: 8.1, vote_count: 6000 });

  assert.equal(rank(p, [offGenre, inGenre])[0].id, inGenre.id);
});

test("lançamentos: alta afinidade vem antes de sem afinidade", () => {
  const p = userB();
  const a = cand({ genre_ids: [10749, 35], vote_average: 7, vote_count: 60, release_date: "2026-09-20" });
  const b = cand({ genre_ids: [878], vote_average: 7.2, vote_count: 60, release_date: "2026-10-01" });

  assert.equal(rank(p, [b, a])[0].id, a.id);
});

test("ordenar por 'Menos conhecidos' não coloca lixo obscuro na frente", () => {
  const p = userA();
  const junk = cand({ vote_average: 9.5, vote_count: 12, popularity: 0.5 });
  const gem = cand({ vote_average: 8, vote_count: 1500, popularity: 8 });
  const sorted = sortScored([junk, gem].map((c) => scoreCandidate(p, c)), "hidden");

  assert.equal(sorted[0].id, gem.id);
});

/* ---------- cold start ---------- */
test("cold start: 0 dados → nada de personalização fingida", () => {
  const p = buildProfile([], NOW);

  assert.equal(p.level, "cold");
  assert.equal(anchorsPerPage(p), 0);
  assert.equal(p.confidence, 0);
  assert.deepEqual(topGenres(p), []);
  const strong = cand({ genre_ids: [99], vote_average: 8.5, vote_count: 9000 });
  const weak = cand({ genre_ids: [18], vote_average: 6.5, vote_count: 9000 });
  assert.equal(rank(p, [weak, strong])[0].id, strong.id, "só qualidade");
});

test("cold start: 1 curtido → 1 âncora, sem hiperpersonalizar o resto", () => {
  const p = buildProfile([sig({ title: "Matrix", genres: ["Ação", "Ficção científica"], favorite: true, rating: 10 })], NOW);

  assert.equal(p.level, "warm");
  assert.equal(anchorsPerPage(p), 1);
  assert.ok(p.confidence <= 0.125);
  const great = cand({ genre_ids: [18], vote_average: 8.6, vote_count: 9000 });
  const okInGenre = cand({ genre_ids: [878], vote_average: 6.8, vote_count: 9000 });
  assert.equal(rank(p, [okInGenre, great])[0].id, great.id, "qualidade ainda pesa mais que 1 sinal");
});

test("cold start: biblioteca grande sem notas personaliza pelo que foi assistido", () => {
  const p = buildProfile(Array.from({ length: 30 }, (_, i) => sig({ genres: i < 20 ? ["Crime"] : ["Comédia"] })), NOW);

  assert.equal(p.level, "full");
  assert.equal(topGenres(p)[0], "crime");
  assert.equal(p.anchors.length, 0, "sem nota nem curtida: nenhum 'Porque você gostou de X'");
});

test("quero assistir é intenção: não conta como gosto nem vira âncora", () => {
  const p = buildProfile([sig({ status: "want" }), sig({ status: "want" })], NOW);

  assert.equal(p.positiveCount, 0);
  assert.equal(p.level, "cold");
});

/* ---------- âncoras ---------- */
test("âncoras: estáveis no mesmo dia, mudam entre dias, com variedade", () => {
  const p = buildProfile(
    Array.from({ length: 12 }, (_, i) => sig({ title: `L${i}`, favorite: true, rating: 9, genres: [["Drama"], ["Comédia"], ["Terror"], ["Crime"]][i % 4], media_type: i % 2 ? "tv" : "movie" })),
    NOW
  );
  const day1 = anchorOrder(p, "u|2026-10-15").map((a) => a.key);
  const again = anchorOrder(p, "u|2026-10-15").map((a) => a.key);
  const day2 = anchorOrder(p, "u|2026-10-16").map((a) => a.key);

  assert.deepEqual(day1, again);
  assert.notDeepEqual(day1.slice(0, 3), day2.slice(0, 3));
  const first3 = anchorOrder(p, "u|2026-10-15").slice(0, 3);
  assert.equal(new Set(first3.map((a) => a.genreKeys[0])).size, 3, "3 âncoras de gêneros diferentes");
  assert.equal(anchorsPerPage(p), 3);
});

/* ---------- URL ---------- */
test("URL: padrões fora da URL, filtros sobrevivem ida e volta, inválidos normalizados", () => {
  assert.equal(serializeForYouQuery(DEFAULT_FOR_YOU_QUERY), "");
  const q = { ...DEFAULT_FOR_YOU_QUERY, type: "tv", genre: "Drama", provider: "8", minRating: "8", year: "2026", sort: "hidden", hideWatched: false, onlyNew: false };
  const s = serializeForYouQuery(q);

  assert.equal(s, "type=tv&genre=Drama&provider=8&min_rating=8&year=2026&sort=hidden&hide_watched=0&only_new=0");
  assert.deepEqual(parseForYouQuery(new URLSearchParams(s)), q);
  assert.deepEqual(parseForYouQuery(new URLSearchParams("type=x&sort=y&min_rating=3&year=99&provider=a;b")), DEFAULT_FOR_YOU_QUERY);
  assert.equal(parseForYouQuery(new URLSearchParams("provider=mine")).provider, "mine");
});

/* ---------- V2.8 (validação final): notas sem inversão de significado ---------- */
const RATING_PROFILES = {
  generoso: [8, 9, 9, 10],
  rigido: [4, 4, 5, 6],
  medio: [5, 6, 7, 8],
  "uma nota": [7],
  "sem notas": [],
};

test("notas: semântica absoluta primeiro, média pessoal só calibra a intensidade", () => {
  const table = {};

  for (const [name, ratings] of Object.entries(RATING_PROFILES)) {
    const mean = ratingMean(ratings);
    const w = Object.fromEntries([10, 8, 6, 4, 2].map((r) => [r, ratingWeight(r, mean)]));
    table[name] = Object.fromEntries(Object.entries(w).map(([r, v]) => [r, Number(v.toFixed(2))]));

    assert.ok(w[10] > 0 && w[8] > 0, `${name}: 10 e 8 nunca negativos`);
    assert.ok(w[2] < 0 && w[4] < 0, `${name}: 4 e 2 nunca positivos`);
    assert.ok(w[10] > w[8] && w[8] > w[6] && w[6] > w[4] && w[4] > w[2], `${name}: monotônica`);
    assert.ok(Math.abs(w[6]) < 1, `${name}: 6 é neutro/fraco`);
    // calibração dentro de ±40% do valor absoluto, sem trocar o sinal
    for (const r of [10, 8, 6, 4, 2]) {
      const absolute = ratingWeight(r, null);
      assert.equal(Math.sign(w[r]), Math.sign(absolute));
      assert.ok(Math.abs(w[r]) >= Math.abs(absolute) * 0.6 - 1e-9 && Math.abs(w[r]) <= Math.abs(absolute) * 1.4 + 1e-9);
    }
  }

  // generoso: 8 vale menos que no médio, mas positivo; rígido: 6 um pouco acima do neutro, longe de um 9
  assert.ok(table.generoso[8] < table.medio[8] && table.generoso[8] > 0);
  assert.ok(table.rigido[6] > 0 && table.rigido[6] < ratingWeight(9, ratingMean(RATING_PROFILES.rigido)) / 3);
  assert.deepEqual(table["uma nota"], table["sem notas"], "com < 3 notas não há calibração");
  // monotonia densa (passo 0,1) em todos os perfis
  for (const ratings of Object.values(RATING_PROFILES)) {
    const mean = ratingMean(ratings);
    for (let r = 0.1; r <= 10; r += 0.1) assert.ok(ratingWeight(r, mean) >= ratingWeight(r - 0.1, mean) - 1e-9);
  }
  console.log("   pesos por nota:", JSON.stringify(table));
});

test("título: sem nota é neutro (só o status); nota decide quando existe", () => {
  const mean = ratingMean([8, 9, 9, 10]);
  assert.ok(Math.abs(titleWeight(sig({ rating: null }), mean, NOW) - 1) < 0.05);
  assert.ok(titleWeight(sig({ rating: 8 }), mean, NOW) > 0, "8 de avaliador generoso continua positivo");
  assert.ok(titleWeight(sig({ rating: 4 }), ratingMean([4, 4, 5, 6]), NOW) < 0, "4 de avaliador rígido não vira positivo");
});

test("impacto: nota alta em sci-fi sobe o gênero; nota baixa em outro sci-fi reduz sem apagar", () => {
  const base = [sig({ genres: ["Drama"], rating: 8 }), sig({ genres: ["Comédia"], rating: 8 }), sig({ genres: ["Crime"], rating: 8 }), sig({ genres: ["Ficção científica"] })];
  const step1 = buildProfile([...base, sig({ genres: ["Ficção científica"], rating: 10 })], NOW);
  const step2 = buildProfile([...base, sig({ genres: ["Ficção científica"], rating: 10 }), sig({ genres: ["Ficção científica"], rating: 3 })], NOW);
  const pool = [
    ...Array.from({ length: 4 }, () => cand({ genre_ids: [878] })),
    ...Array.from({ length: 4 }, () => cand({ genre_ids: [18] })),
    ...Array.from({ length: 4 }, () => cand({ genre_ids: [35] })),
    ...Array.from({ length: 4 }, () => cand({ genre_ids: [80] })),
  ];
  const top = (p) => rank(p, pool).slice(0, 8);
  const scifi = (list) => list.filter((c) => c.genre_ids.includes(878)).length;

  // afinidade é relativa ao gênero mais forte: a nota baixa reduz sci-fi FRENTE aos outros gêneros
  const ratio = (p) => p.genre.get("scifi") / p.genre.get("drama");
  assert.ok(ratio(step2) < ratio(step1), `nota baixa reduz (sci-fi/drama ${ratio(step1).toFixed(2)} → ${ratio(step2).toFixed(2)})`);
  assert.ok(step2.genre.get("scifi") > 0, "não apaga o gênero");
  assert.ok(scifi(top(step1)) >= 3 && scifi(top(step1)) <= 4, "nota alta sobe sci-fi sem dominar o top 8");
  assert.ok(new Set(top(step1).map((c) => c.genre_ids[0])).size >= 2, "top continua diverso");
  assert.ok(scifi(top(step2)) <= scifi(top(step1)));
});

/* ---------- Filmes × Séries no feed final ---------- */
const mixProfile = (movies, total = 10) =>
  buildProfile(Array.from({ length: total }, (_, i) => sig({ media_type: i < movies ? "movie" : "tv", genres: ["Drama"], rating: 8.5 })), NOW);
const buildFeed = (p, pools, anchorsTv = 0) => {
  const used = new Set();
  const shelves = [];
  for (let i = 0; i < anchorsTv; i++) {
    const pool = rank(p, Array.from({ length: 12 }, () => cand({ media_type: "tv", genre_ids: [18] })));
    shelves.push({ mixed: false, picked: assemble(pool, { used, limit: 10 }), pool });
  }
  for (const raw of pools) {
    const pool = rank(p, raw);
    shelves.push({ mixed: true, picked: assemble(pool, { used, limit: 10, movieShare: p.movieShare }), pool });
  }
  return { shelves, used };
};
const both = (movies, tv, o = {}) => [
  ...Array.from({ length: movies }, () => cand({ genre_ids: [18], ...o })),
  ...Array.from({ length: tv }, () => cand({ media_type: "tv", genre_ids: [18], ...o })),
];

test("feed final: perfis 80/20, 50/50, 20/80, 100/0, 0/100 ficam entre 20% e 80% com candidatos suficientes", () => {
  for (const [movies, anchorsTv] of [[8, 0], [5, 0], [2, 3], [10, 0], [0, 3]]) {
    const p = mixProfile(movies);
    const { shelves, used } = buildFeed(p, [both(15, 15), both(15, 15), both(15, 15)], anchorsTv);
    const before = typeCounts(shelves.flatMap((s) => s.picked)).share;
    const sizes = shelves.map((s) => s.picked.length);
    const result = balanceTypes(shelves, { used, sort: "recommended" });
    const all = shelves.flatMap((s) => s.picked);
    const after = typeCounts(all).share;

    console.log(`   perfil ${movies * 10}% filmes: antes ${(before * 100).toFixed(0)}% → final ${(after * 100).toFixed(0)}% (trocas ${result.swaps})`);
    assert.ok(after >= 0.2 - 1e-9 && after <= 0.8 + 1e-9, `${movies * 10}% filmes: ${(before * 100).toFixed(0)}% → ${(after * 100).toFixed(0)}%`);
    assert.equal(result.relaxed, null);
    assert.deepEqual(shelves.map((s) => s.picked.length), sizes, "nenhuma prateleira encolhe");
    assert.equal(new Set(all.map((c) => c.key)).size, all.length, "sem duplicata");
    assert.ok(all.every((c) => used.has(c.key)));
  }
});

test("feed final: perfil acompanha o gosto dentro do intervalo (80/20 ≥ 60%, 20/80 ≤ 40% filmes)", () => {
  const share = (movies, anchorsTv) => {
    const p = mixProfile(movies);
    const { shelves, used } = buildFeed(p, [both(15, 15), both(15, 15), both(15, 15)], anchorsTv);
    balanceTypes(shelves, { used, sort: "recommended" });
    return typeCounts(shelves.flatMap((s) => s.picked)).share;
  };

  assert.ok(share(8, 0) >= 0.6 && share(8, 0) <= 0.8);
  assert.ok(share(2, 3) >= 0.2 && share(2, 3) <= 0.4);
});

test("escassez real: relaxa de forma explícita, sem inserir baixa qualidade nem esvaziar prateleira", () => {
  const p = mixProfile(0);
  // só 1 filme no pool elegível (filmes ruins já foram barrados pelo filtro da prateleira)
  const { shelves, used } = buildFeed(p, [both(1, 20)], 3);
  const result = balanceTypes(shelves, { used, sort: "recommended" });
  const all = shelves.flatMap((s) => s.picked);

  assert.ok(result.relaxed && result.relaxed.type === "movie" && result.relaxed.missing > 0, JSON.stringify(result));
  assert.equal(all.filter((c) => c.media_type === "movie").length, 1, "usa o único filme elegível e para");
  assert.ok(shelves.every((s) => s.picked.length === 10));
  assert.equal(new Set(all.map((c) => c.key)).size, all.length);
});

test("equilíbrio respeita o teto de franquia e não usa título já mostrado", () => {
  const p = mixProfile(0);
  const sameIp = Array.from({ length: 5 }, (_, i) => cand({ original_title: `Rush Hour ${i + 2}` }));
  const { shelves, used } = buildFeed(p, [[...sameIp, ...Array.from({ length: 20 }, () => cand({ media_type: "tv", genre_ids: [18] }))]], 3);
  balanceTypes(shelves, { used, sort: "recommended" });
  const rush = shelves.flatMap((s) => s.picked).filter((c) => /Rush Hour/.test(c.original_title)).length;

  assert.ok(rush <= 2);
});

/* ---------- Sci-Fi × Fantasy ---------- */
test("Sci-Fi & Fantasy (TV) é composto: perfis de sci-fi e de fantasia continuam distintos", () => {
  const A = buildProfile([
    ...Array.from({ length: 5 }, () => sig({ genres: ["Ficção científica"], rating: 9 })),
    sig({ media_type: "tv", genres: ["Sci-Fi & Fantasy"], rating: 9 }),
    sig({ genres: ["Fantasia"], rating: 5 }),
  ], NOW);
  const B = buildProfile([
    ...Array.from({ length: 5 }, () => sig({ genres: ["Fantasia", "Aventura"], rating: 9 })),
    sig({ media_type: "tv", genres: ["Sci-Fi & Fantasy"], rating: 9 }),
    sig({ genres: ["Ficção científica"], rating: 5 }),
  ], NOW);
  const scifiMovie = cand({ genre_ids: [878] });
  const fantasyMovie = cand({ genre_ids: [14] });

  console.log(`   A: scifi=${A.genre.get("scifi").toFixed(2)} fantasy=${A.genre.get("fantasy").toFixed(2)} | B: fantasy=${B.genre.get("fantasy").toFixed(2)} scifi=${B.genre.get("scifi").toFixed(2)}`);
  assert.ok(A.genre.get("scifi") > A.genre.get("fantasy") * 2);
  assert.ok(B.genre.get("fantasy") > B.genre.get("scifi") * 2);
  assert.equal(rank(A, [fantasyMovie, scifiMovie])[0].id, scifiMovie.id);
  assert.equal(rank(B, [scifiMovie, fantasyMovie])[0].id, fantasyMovie.id);
});
