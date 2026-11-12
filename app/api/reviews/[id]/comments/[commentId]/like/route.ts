import { NextResponse } from "next/server";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { notifyCommentLike } from "@/lib/notifications/reviews";
import { reviewAccess } from "@/lib/reviews/access";
import { isUuid, loadReview } from "@/lib/reviews/load";
import { actorName, PRIVATE, rateLimited, reviewNotFound, viewerOf } from "@/lib/reviews/route-helpers";

/*
 * Curtida em comentário (migration 0011). POST curte, DELETE descurte; idempotentes.
 * Só quem pode comentar a avaliação; ninguém curte o próprio comentário nem um
 * comentário apagado (404, como quem não pode ver).
 */
async function handle(method: "POST" | "DELETE", params: Promise<{ id: string; commentId: string }>) {
  const { id, commentId } = await params;
  const viewer = await viewerOf();
  if (viewer.unavailable) return sessionUnavailableResponse();
  if (!viewer.id) return naoAutenticado();
  if (!isUuid(commentId)) return reviewNotFound();

  const limited = rateLimited(`reviewCommentLike:${viewer.id}`, 60, 60_000);
  if (limited) return limited;

  const sql = getDb();
  const loaded = await loadReview(sql, id, viewer.id);
  if (!loaded) return reviewNotFound();
  if (!reviewAccess(loaded.row, { id: viewer.id, followsOwner: loaded.followsOwner }).canComment) return reviewNotFound();

  const found = await sql`
    SELECT user_id FROM public.review_comments
    WHERE id = ${commentId}::uuid AND library_item_id = ${loaded.id}::uuid AND deleted_at IS NULL
  `;
  if (!found[0] || String(found[0].user_id) === viewer.id) return reviewNotFound();
  const authorId = String(found[0].user_id);

  let inserted = false;
  if (method === "POST") {
    const rows = await sql`
      INSERT INTO public.review_comment_likes (comment_id, user_id)
      VALUES (${commentId}::uuid, ${viewer.id}::uuid)
      ON CONFLICT DO NOTHING
      RETURNING 1 AS ok
    `;
    inserted = rows.length > 0;
  } else {
    await sql`DELETE FROM public.review_comment_likes WHERE comment_id = ${commentId}::uuid AND user_id = ${viewer.id}::uuid`;
  }

  const counts = await sql`SELECT count(*)::int AS total FROM public.review_comment_likes WHERE comment_id = ${commentId}::uuid`;

  if (inserted) {
    await notifyCommentLike(sql, {
      commentId,
      reviewId: loaded.id,
      authorId,
      actorId: viewer.id,
      actorName: await actorName(sql, viewer.id),
      titleName: loaded.media.title,
    }).catch((error) => console.error("Aviso de curtida em comentário falhou:", error));
  }

  return NextResponse.json({ liked: method === "POST", like_count: Number(counts[0]?.total) || 0 }, { headers: PRIVATE });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    return await handle("POST", params);
  } catch (error) {
    return respostaDeErro(error, "POST /api/reviews/[id]/comments/[commentId]/like");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    return await handle("DELETE", params);
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/reviews/[id]/comments/[commentId]/like");
  }
}
