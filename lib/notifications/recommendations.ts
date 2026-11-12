/*
 * Avisos de indicação (migration 0010).
 *  - recommendation_received: um por indicação, para quem recebe ("Ana te indicou Duna").
 *  - recommendation_result: um por indicação, para quem indicou, quando o amigo
 *    assiste; reescrito (DO UPDATE) se a nota vier depois. A nota só entra no
 *    texto se o perfil do amigo deixa um seguidor aceito vê-la.
 * Ambos respeitam recommendation_site (sem linha = ligado).
 */
import type { getDb } from "@/lib/db/neon";
import { recipientRating, resultCopy } from "@/lib/recommendations/rules";

type Sql = ReturnType<typeof getDb>;

function nameOf(r: { username?: string | null; display_name?: string | null }) {
  return r.display_name?.trim() || (r.username ? `@${r.username}` : "Alguém");
}

export async function notifyRecommendationReceived(
  sql: Sql,
  input: { recId: string; recipientId: string; senderId: string; senderName: string; titleName: string }
) {
  await sql.query(
    `INSERT INTO public.notifications (user_id, event_key, type, title, message, href, metadata, created_at)
     SELECT $1, $2, 'recommendation_received', 'Indicação de um amigo', $3, '/for-you?view=amigos', $4::jsonb, now()
     WHERE COALESCE((SELECT recommendation_site FROM public.notification_preferences WHERE user_id = $1), true)
     ON CONFLICT (user_id, event_key) DO NOTHING`,
    [
      input.recipientId,
      `recommendation_received:${input.recId}`,
      `${input.senderName} te indicou ${input.titleName}`,
      JSON.stringify({ actor_id: input.senderId, recommendation_id: input.recId }),
    ]
  );
}

/** Chamado pelas rotas da biblioteca depois de gravar um título como assistido. */
export async function notifyRecommendationResults(sql: Sql, input: { recipientId: string; mediaId: number }) {
  const rows = await sql.query(
    `SELECT r.id, r.sender_id, m.title,
       p.username, p.display_name, p.visibility, p.is_public, p.activity_visibility, p.ratings_visibility,
       li.personal_rating,
       EXISTS (SELECT 1 FROM public.follows fw WHERE fw.follower_id = r.sender_id AND fw.following_id = r.recipient_id AND fw.status = 'accepted') AS sender_follows
     FROM public.recommendations r
     JOIN public.media m ON m.id = r.media_id
     JOIN public.profiles p ON p.id = r.recipient_id
     JOIN public.library_items li ON li.user_id = r.recipient_id AND li.media_id = r.media_id AND li.status = 'watched'
     WHERE r.recipient_id = $1 AND r.media_id = $2`,
    [input.recipientId, input.mediaId]
  );

  for (const r of rows as any[]) {
    const rating = recipientRating(r);
    await sql.query(
      `INSERT INTO public.notifications (user_id, event_key, type, title, message, href, metadata, created_at)
       SELECT $1, $2, 'recommendation_result', 'Sua indicação', $3, '/for-you?view=enviadas', $4::jsonb, now()
       WHERE COALESCE((SELECT recommendation_site FROM public.notification_preferences WHERE user_id = $1), true)
       ON CONFLICT (user_id, event_key) DO UPDATE
         SET message = EXCLUDED.message, metadata = EXCLUDED.metadata, read_at = NULL, created_at = now()`,
      [
        r.sender_id,
        `recommendation_result:${r.id}`,
        resultCopy(nameOf(r), String(r.title), rating),
        JSON.stringify({ actor_id: input.recipientId, recommendation_id: String(r.id) }),
      ]
    );
  }
}
