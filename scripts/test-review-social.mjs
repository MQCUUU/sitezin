// Avaliações: quem vê, curte, comenta e apaga; textos dos avisos.
// node scripts/test-review-social.mjs (ou npm test).
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href;
register(
  "data:text/javascript," +
    encodeURIComponent(
      `const ROOT = ${JSON.stringify(ROOT)};
       export async function resolve(s, c, n) {
         if (s.startsWith("@/")) s = ROOT + s.slice(2) + (s.endsWith(".ts") ? "" : ".ts");
         try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; }
       }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { reviewAccess, canDeleteComment, normalizeCommentBody, likeNoticeCopy } = await import("../lib/reviews/access.ts");

const row = (over = {}) => ({
  owner_id: "dono", visibility: "public", is_public: true, activity_visibility: "profile",
  ratings_visibility: "profile", reviews_visibility: "profile", rating: 8, review: "Ótimo", ...over,
});
const visitor = { id: null, followsOwner: false };
const stranger = { id: "outra", followsOwner: false };

test("visitante vê avaliação pública mas não curte nem comenta", () => {
  const a = reviewAccess(row(), visitor);
  assert.equal(a.visible, true);
  assert.equal(a.canComment, false);
  assert.equal(a.canLike, false);
});

test("pessoa logada curte e comenta avaliação pública", () => {
  const a = reviewAccess(row(), stranger);
  assert.deepEqual([a.visible, a.canComment, a.canLike, a.isOwner], [true, true, true, false]);
});

test("dono vê e comenta, mas não curte a própria", () => {
  const a = reviewAccess(row({ reviews_visibility: "private", ratings_visibility: "private" }), { id: "dono", followsOwner: false });
  assert.deepEqual([a.visible, a.canComment, a.canLike, a.isOwner], [true, true, false, true]);
});

test("resenha só para seguidores: quem não segue vê só a nota", () => {
  const a = reviewAccess(row({ reviews_visibility: "followers" }), stranger);
  assert.equal(a.visible, true);
  assert.equal(a.rating, 8);
  assert.equal(a.review, null);
});

test("seguidor aceito vê a resenha de seguidores", () => {
  const a = reviewAccess(row({ reviews_visibility: "followers" }), { id: "outra", followsOwner: true });
  assert.equal(a.review, "Ótimo");
});

test("nota e resenha privadas: avaliação não existe para os outros", () => {
  const a = reviewAccess(row({ reviews_visibility: "private", ratings_visibility: "private" }), stranger);
  assert.equal(a.visible, false);
  assert.equal(a.canComment, false);
});

test("sem nota e com texto em branco não é avaliação", () => {
  assert.equal(reviewAccess(row({ rating: null, review: "   " }), stranger).visible, false);
});

test("visibilidade ausente usa activity_visibility", () => {
  const a = reviewAccess(row({ ratings_visibility: null, reviews_visibility: null, activity_visibility: "private" }), stranger);
  assert.equal(a.visible, false);
});

test("perfil privado: quem não segue não vê", () => {
  assert.equal(reviewAccess(row({ visibility: "private", is_public: false }), stranger).visible, false);
});

test("canDeleteComment: autor e dono da avaliação apagam; terceiro e visitante não", () => {
  const c = { user_id: "autor" };
  assert.equal(canDeleteComment(c, "dono", "autor"), true);
  assert.equal(canDeleteComment(c, "dono", "dono"), true);
  assert.equal(canDeleteComment(c, "dono", "outra"), false);
  assert.equal(canDeleteComment(c, "dono", null), false);
});

test("normalizeCommentBody aparas e limites", () => {
  assert.equal(normalizeCommentBody("  oi "), "oi");
  assert.equal(normalizeCommentBody("a".repeat(500)), "a".repeat(500));
  for (const bad of ["", "   ", "a".repeat(501), null, 42, undefined]) assert.equal(normalizeCommentBody(bad), null);
});

test("likeNoticeCopy agrupa curtidas", () => {
  assert.equal(likeNoticeCopy("Caio", 1, "Interestelar"), "Caio curtiu sua avaliação de Interestelar");
  assert.equal(likeNoticeCopy("Caio", 2, "Interestelar"), "Caio e mais 1 pessoa curtiram sua avaliação de Interestelar");
  assert.equal(likeNoticeCopy("Caio", 6, "Interestelar"), "Caio e mais 5 pessoas curtiram sua avaliação de Interestelar");
});

test("'sem resenha' só quando o autor não escreveu; resenha oculta não vira 'sem resenha'", () => {
  assert.equal(reviewAccess(row({ review: null }), stranger).wroteNoReview, true);
  assert.equal(reviewAccess(row({ review: "   " }), stranger).wroteNoReview, true);
  const hidden = reviewAccess(row({ reviews_visibility: "private" }), stranger);
  assert.equal(hidden.review, null);
  assert.equal(hidden.wroteNoReview, false);
});

const { replyTarget, commentDeleteMode, commentLikeNoticeCopy, replyNoticeCopy } = await import("../lib/reviews/access.ts");

test("responder a um comentário de cima: vira resposta dele, marcando o autor", () => {
  assert.deepEqual(replyTarget({ id: "c1", parent_id: null, user_id: "u1" }), { parentId: "c1", replyToUserId: "u1" });
});

test("responder a uma resposta: fica no mesmo nível, marcando quem respondeu", () => {
  assert.deepEqual(replyTarget({ id: "r1", parent_id: "c1", user_id: "u2" }), { parentId: "c1", replyToUserId: "u2" });
});

test("apagar: comentário de cima com respostas vira 'apagado'; o resto sai de vez", () => {
  assert.equal(commentDeleteMode({ parent_id: null }, 2), "soft");
  assert.equal(commentDeleteMode({ parent_id: null }, 0), "hard");
  assert.equal(commentDeleteMode({ parent_id: "c1" }, 0), "hard");
});

test("textos dos avisos de resposta e de curtida em comentário", () => {
  assert.equal(replyNoticeCopy("Caio", "Duna"), "Caio respondeu seu comentário na avaliação de Duna");
  assert.equal(commentLikeNoticeCopy("Caio", 1, "Duna"), "Caio curtiu seu comentário na avaliação de Duna");
  assert.equal(commentLikeNoticeCopy("Caio", 2, "Duna"), "Caio e mais 1 pessoa curtiram seu comentário na avaliação de Duna");
  assert.equal(commentLikeNoticeCopy("Caio", 4, "Duna"), "Caio e mais 3 pessoas curtiram seu comentário na avaliação de Duna");
});
