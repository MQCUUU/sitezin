// Testes unitários para o ranqueamento social de Para Você (Anti-"Várzea")
// Execução: node scripts/test-for-you-social.mjs
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
  scoreSocialCandidate,
  buildFriendHeadline,
  buildFriendRecommendations,
} = await import("../lib/for-you/social.ts");

const NOW = Date.parse("2026-11-01T12:00:00Z");

function makeFriend(overrides = {}) {
  return {
    user_id: "user-1",
    username: "fabricio",
    display_name: "Fabrício",
    avatar_url: "https://example.com/avatar.jpg",
    rating: 10,
    review: "bom filme",
    favorite: false,
    status: "watched",
    updated_at: "2026-10-25T10:00:00Z",
    ...overrides,
  };
}

function makeRow(overrides = {}) {
  const f = makeFriend();
  return {
    db_media_id: 1,
    tmdb_id: 101,
    media_type: "movie",
    title: "Filme Teste",
    original_title: "Test Movie",
    poster_path: "/test.jpg",
    backdrop_path: "/back.jpg",
    overview: "Sinopse do filme",
    genres: ["Ação", "Ficção científica"],
    release_date: "2024-05-10",
    first_air_date: null,
    vote_average: 8.1,
    vote_count: 500,
    popularity: 120,
    friends_data: [f],
    friend_count: 1,
    ...overrides,
  };
}

test("buildFriendHeadline formata com nota e opinião", () => {
  const friend = makeFriend({ display_name: "Fabrício", rating: 10, review: "bom filme" });
  const { headline, reviewSnippet } = buildFriendHeadline(friend, 1);
  assert.equal(headline, 'Fabrício avaliou com 10 e opinou:');
  assert.equal(reviewSnippet, '"bom filme"');
});

test("buildFriendHeadline formata múltiplos amigos quando mais de um avaliaram", () => {
  const friend = makeFriend({ display_name: "Fabrício", rating: 9, review: null });
  const { headline, reviewSnippet } = buildFriendHeadline(friend, 3);
  assert.equal(headline, 'Fabrício (9★) e mais 2 amigos recomendam');
  assert.equal(reviewSnippet, null);
});

test("buildFriendHeadline trata apenas favorito sem nota e sem resenha", () => {
  const friend = makeFriend({ display_name: "Ana", rating: null, review: null, favorite: true });
  const { headline, reviewSnippet } = buildFriendHeadline(friend, 1);
  assert.equal(headline, 'Ana favoritou este título');
  assert.equal(reviewSnippet, null);
});

test("anti-várzea: consenso de múltiplos amigos supera avaliação isolada de 1 pessoa", () => {
  // Filme A: 1 amigo deu nota 10
  const rowA = makeRow({
    tmdb_id: 1,
    title: "Filme Obscuro de 1 amigo",
    friends_data: [makeFriend({ user_id: "u1", rating: 10, review: null })],
    friend_count: 1,
  });

  // Filme B: 3 amigos deram nota 8 e 8.5
  const rowB = makeRow({
    tmdb_id: 2,
    title: "Filme Aclamado por 3 amigos",
    friends_data: [
      makeFriend({ user_id: "u1", rating: 8.5 }),
      makeFriend({ user_id: "u2", rating: 8.0 }),
      makeFriend({ user_id: "u3", rating: 8.0 }),
    ],
    friend_count: 3,
  });

  const scoreA = scoreSocialCandidate(rowA, undefined, NOW).score;
  const scoreB = scoreSocialCandidate(rowB, undefined, NOW).score;

  assert.ok(scoreB > scoreA, `Consenso (${scoreB}) deve superar nota isolada (${scoreA})`);
});

test("anti-várzea: resenha escrita gera bônus significativo sobre apenas nota estelar", () => {
  const rowNoReview = makeRow({
    tmdb_id: 1,
    friends_data: [makeFriend({ rating: 8, review: null })],
    friend_count: 1,
  });

  const rowWithReview = makeRow({
    tmdb_id: 2,
    friends_data: [makeFriend({ rating: 8, review: "Excelente roteiro e direção!" })],
    friend_count: 1,
  });

  const scoreNoReview = scoreSocialCandidate(rowNoReview, undefined, NOW).score;
  const scoreWithReview = scoreSocialCandidate(rowWithReview, undefined, NOW).score;

  assert.ok(scoreWithReview > scoreNoReview, "Candidato com resenha deve ter pontuação maior");
});

test("buildFriendRecommendations descarta quando há menos de 2 títulos (evita prateleira de 1 item)", () => {
  const singleRow = [makeRow({ tmdb_id: 1 })];
  const recs = buildFriendRecommendations(singleRow);
  assert.equal(recs, null, "Deve retornar null se houver menos de 2 títulos");
});

test("buildFriendRecommendations gera cards válidos quando há 2 ou mais títulos", () => {
  const rows = [
    makeRow({ tmdb_id: 1, title: "Filme 1" }),
    makeRow({ tmdb_id: 2, title: "Filme 2" }),
  ];
  const recs = buildFriendRecommendations(rows);
  assert.ok(recs);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].friend_endorsement.top_friend.username, "fabricio");
});

console.log("Todos os testes sociais de Para Você passaram com sucesso!");
