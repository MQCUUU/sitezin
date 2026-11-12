import { NextResponse } from "next/server";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { canDeleteComment, commentDeleteMode, reviewAccess } from "@/lib/reviews/access";
import { isUuid, loadReview } from "@/lib/reviews/load";
import { reviewNotFound, viewerOf } from "@/lib/reviews/route-helpers";

/*
 * DELETE apaga um comentário: o autor dele ou o dono da avaliação. Outros recebem 404.
 * Comentário de cima com respostas vira "Comentário apagado" e as respostas ficam;
 * quando a última resposta de um apagado sai, ele sai junto.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    const { id, commentId } = await params;
    const viewer = await viewerOf();
    if (viewer.unavailable) return sessionUnavailableResponse();
    if (!viewer.id) return naoAutenticado();
    if (!isUuid(commentId)) return reviewNotFound();

    const sql = getDb();
    const loaded = await loadReview(sql, id, viewer.id);
    if (!loaded) return reviewNotFound();
    if (!reviewAccess(loaded.row, { id: viewer.id, followsOwner: loaded.followsOwner }).visible) return reviewNotFound();

    const rows = await sql`
      SELECT user_id, parent_id,
        (SELECT count(*)::int FROM public.review_comments r WHERE r.parent_id = c.id) AS replies
      FROM public.review_comments c
      WHERE id = ${commentId}::uuid AND library_item_id = ${loaded.id}::uuid AND deleted_at IS NULL
    `;
    if (!rows[0] || !canDeleteComment({ user_id: String(rows[0].user_id) }, loaded.row.owner_id, viewer.id)) {
      return reviewNotFound();
    }
    const parentId = rows[0].parent_id ? String(rows[0].parent_id) : null;

    if (commentDeleteMode({ parent_id: parentId }, Number(rows[0].replies) || 0) === "soft") {
      await sql`UPDATE public.review_comments SET deleted_at = now() WHERE id = ${commentId}::uuid`;
      await sql`DELETE FROM public.review_comment_likes WHERE comment_id = ${commentId}::uuid`;
    } else {
      await sql`DELETE FROM public.review_comments WHERE id = ${commentId}::uuid`;
      if (parentId) {
        await sql`
          DELETE FROM public.review_comments p
          WHERE p.id = ${parentId}::uuid AND p.deleted_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.review_comments r WHERE r.parent_id = p.id)
        `;
      }
    }
    const keys = [`review_comment:${commentId}`, `review_comment_reply:${commentId}`, `review_comment_like:${commentId}`];
    await sql`DELETE FROM public.notifications WHERE event_key = ANY(${keys}::text[]) AND read_at IS NULL`;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/reviews/[id]/comments/[commentId]");
  }
}
