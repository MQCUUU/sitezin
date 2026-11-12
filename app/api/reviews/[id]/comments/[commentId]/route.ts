import { NextResponse } from "next/server";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { canDeleteComment, reviewAccess } from "@/lib/reviews/access";
import { isUuid, loadReview } from "@/lib/reviews/load";
import { reviewNotFound, viewerOf } from "@/lib/reviews/route-helpers";

/* DELETE apaga um comentário: o autor dele ou o dono da avaliação. Outros recebem 404. */
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
      SELECT user_id FROM public.review_comments
      WHERE id = ${commentId}::uuid AND library_item_id = ${loaded.id}::uuid
    `;
    if (!rows[0] || !canDeleteComment({ user_id: String(rows[0].user_id) }, loaded.row.owner_id, viewer.id)) {
      return reviewNotFound();
    }

    const eventKey = `review_comment:${commentId}`;
    await sql`DELETE FROM public.review_comments WHERE id = ${commentId}::uuid`;
    await sql`DELETE FROM public.notifications WHERE event_key = ${eventKey} AND read_at IS NULL`;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/reviews/[id]/comments/[commentId]");
  }
}
