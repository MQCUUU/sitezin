import { NextResponse } from "next/server";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { notifyReviewLike } from "@/lib/notifications/reviews";
import { reviewAccess } from "@/lib/reviews/access";
import { loadReview } from "@/lib/reviews/load";
import { actorName, PRIVATE, rateLimited, reviewNotFound, viewerOf } from "@/lib/reviews/route-helpers";

/*
 * POST curte, DELETE descurte. Idempotentes: repetir não muda a contagem.
 * O dono não curte a própria avaliação (404, como quem não pode ver).
 */
async function handle(method: "POST" | "DELETE", params: Promise<{ id: string }>) {
  const { id } = await params;
  const viewer = await viewerOf();
  if (viewer.unavailable) return sessionUnavailableResponse();
  if (!viewer.id) return naoAutenticado();

  const limited = rateLimited(`reviewLike:${viewer.id}`, 60, 60_000);
  if (limited) return limited;

  const sql = getDb();
  const loaded = await loadReview(sql, id, viewer.id);
  if (!loaded) return reviewNotFound();
  const access = reviewAccess(loaded.row, { id: viewer.id, followsOwner: loaded.followsOwner });
  if (!access.canLike) return reviewNotFound();

  let inserted = false;
  if (method === "POST") {
    const rows = await sql`
      INSERT INTO public.review_likes (library_item_id, user_id)
      VALUES (${loaded.id}::uuid, ${viewer.id}::uuid)
      ON CONFLICT DO NOTHING
      RETURNING 1 AS ok
    `;
    inserted = rows.length > 0;
  } else {
    await sql`DELETE FROM public.review_likes WHERE library_item_id = ${loaded.id}::uuid AND user_id = ${viewer.id}::uuid`;
  }

  const counts = await sql`SELECT count(*)::int AS total FROM public.review_likes WHERE library_item_id = ${loaded.id}::uuid`;

  if (inserted) {
    await notifyReviewLike(sql, {
      reviewId: loaded.id,
      ownerId: loaded.row.owner_id,
      actorId: viewer.id,
      actorName: await actorName(sql, viewer.id),
      titleName: loaded.media.title,
    }).catch((error) => console.error("Aviso de curtida falhou:", error));
  }

  return NextResponse.json({ liked: method === "POST", like_count: Number(counts[0]?.total) || 0 }, { headers: PRIVATE });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handle("POST", params);
  } catch (error) {
    return respostaDeErro(error, "POST /api/reviews/[id]/like");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handle("DELETE", params);
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/reviews/[id]/like");
  }
}
