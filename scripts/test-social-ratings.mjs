import { register } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href;
register("data:text/javascript," + encodeURIComponent(`const ROOT = ${JSON.stringify(ROOT)}; export async function resolve(s,c,n){if(s.startsWith("@/"))s=ROOT+s.slice(2)+(s.endsWith(".ts")?"":".ts");try{return await n(s,c)}catch(e){if(s.startsWith(".")&&!s.endsWith(".ts"))return n(s+".ts",c);throw e}}`));

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { socialRatingBucket, normalizedTasteAffinity, tasteAffinityLabel } = await import("../lib/social/ratings.ts");

test("faixas sociais usam os limites definidos sem converter nota ausente em zero", () => {
  assert.equal(socialRatingBucket(null), null);
  assert.equal(socialRatingBucket(undefined), null);
  assert.equal(socialRatingBucket(0), "dislike");
  assert.equal(socialRatingBucket(4.9), "dislike");
  assert.equal(socialRatingBucket(5), "regular");
  assert.equal(socialRatingBucket(5.9), "regular");
  assert.equal(socialRatingBucket(6), "like");
  assert.equal(socialRatingBucket(7.5), "like");
  assert.equal(socialRatingBucket(7.6), "like_much");
  assert.equal(socialRatingBucket(8.9), "like_much");
  assert.equal(socialRatingBucket(9), "love");
  assert.equal(socialRatingBucket(10), "love");
  assert.equal(socialRatingBucket(10.1), null);
});

test("afinidade precisa de pelo menos três notas e suaviza amostras pequenas", () => {
  assert.equal(normalizedTasteAffinity(2, 0), null);
  assert.equal(normalizedTasteAffinity(3, 0), 69);
  assert.equal(normalizedTasteAffinity(20, 0), 90);
  assert.equal(normalizedTasteAffinity(20, 10), 10);
  assert.equal(tasteAffinityLabel(null), null);
  assert.equal(tasteAffinityLabel(82), "Alta afinidade");
  assert.equal(tasteAffinityLabel(70), "Gostos parecidos");
  assert.equal(tasteAffinityLabel(54), "Gostos diferentes");
});
