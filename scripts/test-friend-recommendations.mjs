import { register } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href;
register("data:text/javascript," + encodeURIComponent(`const ROOT = ${JSON.stringify(ROOT)}; export async function resolve(s,c,n){if(s.startsWith("@/"))s=ROOT+s.slice(2)+(s.endsWith(".ts")?"":".ts");try{return await n(s,c)}catch(e){if(s.startsWith(".")&&!s.endsWith(".ts"))return n(s+".ts",c);throw e}}`));

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { SOCIAL_SQL, scoreSocialCandidate } = await import("../lib/for-you/social.ts");

const friend = (overrides = {}) => ({ user_id: "friend", username: "friend", display_name: "Friend", avatar_url: null, rating: 9, review: null, favorite: false, status: "watched", updated_at: "2026-01-01T00:00:00Z", ...overrides });
const candidate = (friends_data) => ({ media_type: "movie", tmdb_id: 1, title: "Film", poster_path: "/p.jpg", genres: [], release_date: "2020-01-01", vote_average: 0, vote_count: 0, popularity: 0, friend_count: friends_data.filter((f) => f.rating >= 7 || f.favorite).length, friends_data });

test("recomendações só consultam follows aceitos e recíprocos, respeitando as preferências de partilha", () => {
  assert.match(SOCIAL_SQL, /JOIN public\.follows mutual/);
  assert.match(SOCIAL_SQL, /mutual\.status = 'accepted'/);
  assert.match(SOCIAL_SQL, /ratings_visibility/);
  assert.match(SOCIAL_SQL, /reviews_visibility/);
  assert.match(SOCIAL_SQL, /likes_visibility/);
});

test("notas negativas não alteram a pontuação de recomendação positiva", () => {
  const onlyPositive = scoreSocialCandidate(candidate([friend()]), undefined, Date.parse("2026-01-02T00:00:00Z"));
  const positiveAndNegative = scoreSocialCandidate(candidate([friend(), friend({ user_id: "other", username: "other", rating: 2 })]), undefined, Date.parse("2026-01-02T00:00:00Z"));
  assert.equal(positiveAndNegative.score, onlyPositive.score);
});

test("afinidade só influencia com dados comuns suficientes e não elimina amigos diferentes", () => {
  const sparse = scoreSocialCandidate(candidate([friend({ shared_ratings: 2, average_rating_difference: 0 })]), undefined, Date.parse("2026-01-02T00:00:00Z"));
  const similar = scoreSocialCandidate(candidate([friend({ shared_ratings: 20, average_rating_difference: 0 })]), undefined, Date.parse("2026-01-02T00:00:00Z"));
  const different = scoreSocialCandidate(candidate([friend({ shared_ratings: 20, average_rating_difference: 9 })]), undefined, Date.parse("2026-01-02T00:00:00Z"));
  assert.ok(similar.score > sparse.score);
  assert.equal(different.score, sparse.score);
  assert.equal(different.topFriend.user_id, "friend");
});
