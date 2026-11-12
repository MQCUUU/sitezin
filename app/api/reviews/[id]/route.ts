import { NextResponse } from "next/server";
import { respostaDeErro } from "@/lib/api-error";
import { getDb } from "@/lib/db/neon";
import { reviewAccess } from "@/lib/reviews/access";
import { loadReview } from "@/lib/reviews/load";
import { PRIVATE, reviewNotFound, viewerOf } from "@/lib/reviews/route-helpers";

/*
 * GET /api/reviews/[id] — uma avaliação com curtidas e contagem de comentários.
 * Quem não pode ver (ou id inexistente) recebe 404, nunca 403.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await viewerOf();
    const loaded = await loadReview(getDb(), id, viewer.id);
    if (!loaded) return reviewNotFound();

    const access = reviewAccess(loaded.row, { id: viewer.id, followsOwner: loaded.followsOwner });
    if (!access.visible) return reviewNotFound();

    return NextResponse.json(
      {
        id: loaded.id,
        owner: loaded.owner,
        media: loaded.media,
        rating: access.rating,
        review: access.review,
        like_count: loaded.like_count,
        comment_count: loaded.comment_count,
        liked_by_viewer: loaded.liked_by_viewer,
        can_comment: access.canComment,
        can_like: access.canLike,
        is_owner: access.isOwner,
      },
      { headers: PRIVATE }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/reviews/[id]");
  }
}
