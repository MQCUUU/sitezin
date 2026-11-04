import type { NeonQueryFunction } from "@neondatabase/serverless";

export type SocialNoticeType = "follow_request" | "new_follower" | "follow_accepted" | "new_friend";

type SocialNotice = {
  recipientId: string;
  actorId: string;
  actorUsername: string;
  type: SocialNoticeType;
  eventKey: string;
  href: string;
};

const copy: Record<SocialNoticeType, (username: string) => { title: string; message: string }> = {
  follow_request: (username) => ({ title: "Nova solicitação para seguir você", message: `@${username} quer seguir seu perfil.` }),
  new_follower: (username) => ({ title: "Novo seguidor", message: `@${username} começou a seguir você.` }),
  follow_accepted: (username) => ({ title: "Solicitação aceita", message: `@${username} aceitou sua solicitação para seguir.` }),
  new_friend: (username) => ({ title: "Vocês agora são amigos", message: `Você e @${username} agora se seguem mutuamente.` }),
};

export async function createSocialNotice(sql: NeonQueryFunction<false, false>, notice: SocialNotice) {
  const { title, message } = copy[notice.type](notice.actorUsername);
  const preference = notice.type === "follow_request" ? "follow_request_site" : "new_follower_site";

  await sql.query(
    `INSERT INTO public.notifications (user_id, event_key, type, title, message, href, metadata, created_at)
     SELECT $1, $2, $3, $4, $5, $6, $7::jsonb, now()
     WHERE COALESCE((SELECT ${preference} FROM public.notification_preferences WHERE user_id = $1), true)
     ON CONFLICT (user_id, event_key) DO NOTHING`,
    [notice.recipientId, notice.eventKey, notice.type, title, message, notice.href,
      JSON.stringify({ actor_id: notice.actorId, actor_username: notice.actorUsername })]
  );
}
