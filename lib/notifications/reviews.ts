import type { NeonQueryFunction } from "@neondatabase/serverless";
import { likeNoticeCopy } from "@/lib/reviews/access";

/*
 * Avisos de curtida e comentário em avaliações (migration 0009).
 * Curtida: UM aviso por avaliação, reescrito a cada curtida nova ("Caio e mais 5
 * pessoas curtiram…") e marcado como não lido de novo. Comentário: um por comentário.
 * Ambos respeitam notification_preferences (sem linha = ligado).
 */

type Sql = NeonQueryFunction<false, false>;

export async function notifyReviewLike(
  sql: Sql,
  input: { reviewId: string; ownerId: string; actorId: string; actorName: string; titleName: string }
) {
  if (input.actorId === input.ownerId) return;
  const totals = await sql.query(`SELECT count(*)::int AS total FROM public.review_likes WHERE library_item_id = $1`, [input.reviewId]);
  const total = Number(totals[0]?.total) || 1;
  const message = likeNoticeCopy(input.actorName, total, input.titleName);

  await sql.query(
    `INSERT INTO public.notifications (user_id, event_key, type, title, message, href, metadata, created_at)
     SELECT $1, $2, 'review_like', 'Curtidas na sua avaliação', $3, $4, $5::jsonb, now()
     WHERE COALESCE((SELECT review_like_site FROM public.notification_preferences WHERE user_id = $1), true)
     ON CONFLICT (user_id, event_key) DO UPDATE
       SET message = EXCLUDED.message, metadata = EXCLUDED.metadata, read_at = NULL, created_at = now()`,
    [
      input.ownerId,
      `review_like:${input.reviewId}`,
      message,
      `/review/${input.reviewId}`,
      JSON.stringify({ actor_id: input.actorId, review_id: input.reviewId, total }),
    ]
  );
}

export async function notifyReviewComment(
  sql: Sql,
  input: { commentId: string; reviewId: string; ownerId: string; actorId: string; actorName: string; titleName: string }
) {
  if (input.actorId === input.ownerId) return;
  await sql.query(
    `INSERT INTO public.notifications (user_id, event_key, type, title, message, href, metadata, created_at)
     SELECT $1, $2, 'review_comment', 'Novo comentário na sua avaliação', $3, $4, $5::jsonb, now()
     WHERE COALESCE((SELECT review_comment_site FROM public.notification_preferences WHERE user_id = $1), true)
     ON CONFLICT (user_id, event_key) DO NOTHING`,
    [
      input.ownerId,
      `review_comment:${input.commentId}`,
      `${input.actorName} comentou sua avaliação de ${input.titleName}`,
      `/review/${input.reviewId}`,
      JSON.stringify({ actor_id: input.actorId, review_id: input.reviewId, comment_id: input.commentId }),
    ]
  );
}
