/*
 * Indicações (migration 0010) — SQL. Amigos = follows aceitos nos dois sentidos
 * (a tabela friendships é legada). O estado de quem recebe sai do library_items
 * dela; quem indicou vê a nota só se o perfil do amigo deixa um seguidor aceito ver.
 */
import type { getDb } from "@/lib/db/neon";
import { faro, faroLabel, groupByTitle, recipientRating, recipientState, senderStatusLabel, type RecipientState } from "@/lib/recommendations/rules";

type Sql = ReturnType<typeof getDb>;

export type Person = { username: string; display_name: string | null; avatar_url: string | null };
export type RecMedia = { id: number; tmdb_id: number; media_type: "movie" | "tv"; title: string; poster_path: string | null; backdrop_path: string | null };

const FRIENDS_SQL = `
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.follows mine
  JOIN public.follows back
    ON back.follower_id = mine.following_id AND back.following_id = mine.follower_id AND back.status = 'accepted'
  JOIN public.profiles p ON p.id = mine.following_id AND p.username IS NOT NULL
  WHERE mine.follower_id = $1 AND mine.status = 'accepted'
`;

function person(r: any): Person {
  return { username: String(r.username ?? ""), display_name: r.display_name ?? null, avatar_url: r.avatar_url ?? null };
}

function media(r: any): RecMedia {
  return {
    id: Number(r.media_id),
    tmdb_id: Number(r.tmdb_id),
    media_type: r.media_type === "tv" ? "tv" : "movie",
    title: String(r.title ?? ""),
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
  };
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function displayName(p: { username: string; display_name: string | null }) {
  return p.display_name?.trim() || `@${p.username}`;
}

/** Id do título no catálogo, sem criar (para marcações dos candidatos). */
export async function findMediaId(sql: Sql, type: "movie" | "tv", tmdbId: number): Promise<number | null> {
  const rows = await sql.query(`SELECT id FROM public.media WHERE tmdb_id = $1 AND media_type = $2 LIMIT 1`, [tmdbId, type]);
  return rows[0] ? Number(rows[0].id) : null;
}

export async function candidates(sql: Sql, userId: string, mediaId: number | null) {
  const rows = await sql.query(
    `SELECT f.*,
       EXISTS (SELECT 1 FROM public.library_items li WHERE li.user_id = f.id AND li.media_id = $2 AND li.status = 'watched') AS watched,
       EXISTS (SELECT 1 FROM public.recommendations r WHERE r.sender_id = $1 AND r.recipient_id = f.id AND r.media_id = $2) AS already_sent
     FROM (${FRIENDS_SQL}) f
     ORDER BY lower(coalesce(nullif(btrim(f.display_name), ''), f.username))`,
    [userId, mediaId]
  );
  return rows.map((r: any) => ({
    id: String(r.id),
    ...person(r),
    watched: Boolean(r.watched),
    already_sent: Boolean(r.already_sent),
  }));
}

export type SkipReason = "not_friend" | "watched" | "already_sent";

/** Reconfere amizade e marcações no servidor; o UNIQUE resolve envios simultâneos. */
export async function sendRecommendations(sql: Sql, input: { senderId: string; mediaId: number; recipientIds: string[]; note: string | null }) {
  const unique = [...new Set(input.recipientIds)];
  const status = await sql.query(
    `SELECT id::text AS id,
       EXISTS (SELECT 1 FROM (${FRIENDS_SQL}) f WHERE f.id = x.id) AS friend,
       EXISTS (SELECT 1 FROM public.library_items li WHERE li.user_id = x.id AND li.media_id = $2 AND li.status = 'watched') AS watched
     FROM unnest($3::uuid[]) AS x(id)`,
    [input.senderId, input.mediaId, unique]
  );
  const byId = new Map(status.map((r: any) => [String(r.id), r]));

  const sent: { recipientId: string; recId: string }[] = [];
  const skipped: { id: string; reason: SkipReason }[] = [];
  for (const id of unique) {
    const row: any = byId.get(id);
    if (!row?.friend) {
      skipped.push({ id, reason: "not_friend" });
      continue;
    }
    if (row.watched) {
      skipped.push({ id, reason: "watched" });
      continue;
    }
    const inserted = await sql.query(
      `INSERT INTO public.recommendations (sender_id, recipient_id, media_id, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sender_id, recipient_id, media_id) DO NOTHING
       RETURNING id`,
      [input.senderId, id, input.mediaId, input.note]
    );
    if (inserted[0]) sent.push({ recipientId: id, recId: String(inserted[0].id) });
    else skipped.push({ id, reason: "already_sent" });
  }
  return { sent, skipped };
}

export type ReceivedGroup = {
  media: RecMedia;
  senders: (Person & { note: string | null; created_at: string })[];
  state: RecipientState;
};

const STATE_ORDER: Record<RecipientState, number> = { pending: 0, saved: 1, watched: 2, dismissed: 3 };

export async function received(sql: Sql, userId: string, tmdbFilter?: { tmdbId: number; type: "movie" | "tv" }): Promise<ReceivedGroup[]> {
  const rows = await sql.query(
    `SELECT r.id, r.media_id, r.note, r.dismissed_at, r.created_at,
       p.username, p.display_name, p.avatar_url,
       m.tmdb_id, m.media_type, m.title, m.poster_path, m.backdrop_path,
       li.status AS item_status
     FROM public.recommendations r
     JOIN public.profiles p ON p.id = r.sender_id
     JOIN public.media m ON m.id = r.media_id
     LEFT JOIN public.library_items li ON li.user_id = r.recipient_id AND li.media_id = r.media_id
     WHERE r.recipient_id = $1
       AND ($2::int IS NULL OR (m.tmdb_id = $2 AND m.media_type = $3))
     ORDER BY r.created_at DESC
     LIMIT 300`,
    [userId, tmdbFilter?.tmdbId ?? null, tmdbFilter?.type ?? null]
  );
  const recs = rows.map((r: any) => ({ ...r, media_id: Number(r.media_id), created_at: iso(r.created_at) }));
  return groupByTitle(recs)
    .map((group) => {
      const first: any = group.recs[0];
      // A dispensa vale para o título inteiro: dispensado só se todas foram dispensadas.
      const dismissed = group.recs.every((r: any) => r.dismissed_at);
      const state = recipientState({ dismissed_at: dismissed ? "x" : null }, first.item_status ? { status: String(first.item_status) } : null);
      return {
        media: media(first),
        senders: group.recs.map((r: any) => ({ ...person(r), note: r.note ?? null, created_at: r.created_at })),
        state,
      };
    })
    .filter((group) => group.state !== "dismissed")
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

export async function sent(sql: Sql, userId: string) {
  const rows = await sql.query(
    `SELECT r.id, r.media_id, r.dismissed_at, r.created_at,
       p.username, p.display_name, p.avatar_url,
       p.visibility, p.is_public, p.activity_visibility, p.ratings_visibility,
       m.tmdb_id, m.media_type, m.title, m.poster_path, m.backdrop_path,
       li.status AS item_status, li.personal_rating,
       EXISTS (SELECT 1 FROM public.follows fw WHERE fw.follower_id = r.sender_id AND fw.following_id = r.recipient_id AND fw.status = 'accepted') AS sender_follows
     FROM public.recommendations r
     JOIN public.profiles p ON p.id = r.recipient_id
     JOIN public.media m ON m.id = r.media_id
     LEFT JOIN public.library_items li ON li.user_id = r.recipient_id AND li.media_id = r.media_id
     WHERE r.sender_id = $1
     ORDER BY r.created_at DESC
     LIMIT 300`,
    [userId]
  );
  const ratings: (number | null)[] = [];
  const items = rows.map((r: any) => {
    const state = recipientState({ dismissed_at: r.dismissed_at ? iso(r.dismissed_at) : null }, r.item_status ? { status: String(r.item_status) } : null);
    const rating = state === "watched" ? recipientRating(r) : null;
    if (state === "watched") ratings.push(rating);
    return {
      id: String(r.id),
      media: media(r),
      recipient: person(r),
      label: senderStatusLabel(state, rating),
      can_cancel: state === "pending" || state === "dismissed",
      created_at: iso(r.created_at),
    };
  });
  const f = faro(ratings);
  return { items, faro: { ...f, label: faroLabel(f, 1) } };
}

/** Faro agregado para o perfil público (sem expor nenhuma nota individual). */
export async function faroOf(sql: Sql, userId: string) {
  const rows = await sql.query(
    `SELECT li.personal_rating, p.visibility, p.is_public, p.activity_visibility, p.ratings_visibility,
       EXISTS (SELECT 1 FROM public.follows fw WHERE fw.follower_id = r.sender_id AND fw.following_id = r.recipient_id AND fw.status = 'accepted') AS sender_follows
     FROM public.recommendations r
     JOIN public.profiles p ON p.id = r.recipient_id
     JOIN public.library_items li ON li.user_id = r.recipient_id AND li.media_id = r.media_id AND li.status = 'watched'
     WHERE r.sender_id = $1`,
    [userId]
  );
  return faro(rows.map((row: any) => recipientRating(row)));
}

export async function summary(sql: Sql, userId: string) {
  const rows = await sql.query(
    `SELECT
       (SELECT count(*)::int FROM public.notifications n
         WHERE n.user_id = $1 AND n.type = 'recommendation_received' AND n.read_at IS NULL) AS unseen,
       (SELECT count(DISTINCT r.media_id)::int FROM public.recommendations r
         WHERE r.recipient_id = $1 AND r.dismissed_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM public.library_items li WHERE li.user_id = r.recipient_id AND li.media_id = r.media_id)) AS pending`,
    [userId]
  );
  return { unseen: Number(rows[0]?.unseen) || 0, pending: Number(rows[0]?.pending) || 0 };
}

export async function dismiss(sql: Sql, userId: string, mediaId: number) {
  await sql.query(
    `UPDATE public.recommendations SET dismissed_at = now()
     WHERE recipient_id = $1 AND media_id = $2 AND dismissed_at IS NULL`,
    [userId, mediaId]
  );
}

/** Só quem indicou, e só enquanto o amigo não pôs na biblioteca. false = 404. */
export async function cancel(sql: Sql, userId: string, recId: string): Promise<boolean> {
  const rows = await sql.query(
    `DELETE FROM public.recommendations r
     WHERE r.id = $1 AND r.sender_id = $2
       AND NOT EXISTS (SELECT 1 FROM public.library_items li WHERE li.user_id = r.recipient_id AND li.media_id = r.media_id)
     RETURNING r.recipient_id`,
    [recId, userId]
  );
  if (!rows[0]) return false;
  await sql.query(
    `DELETE FROM public.notifications WHERE user_id = $1 AND event_key = $2 AND read_at IS NULL`,
    [rows[0].recipient_id, `recommendation_received:${recId}`]
  );
  return true;
}

/** Exportação da conta: indicações enviadas e recebidas. */
export async function exportRows(sql: Sql, userId: string) {
  const [sentRows, receivedRows] = await Promise.all([
    sql.query(
      `SELECT r.id, r.note, r.created_at, p.username AS recipient, m.tmdb_id, m.media_type
       FROM public.recommendations r
       LEFT JOIN public.profiles p ON p.id = r.recipient_id
       JOIN public.media m ON m.id = r.media_id
       WHERE r.sender_id = $1 ORDER BY r.created_at`,
      [userId]
    ),
    sql.query(
      `SELECT r.id, r.note, r.dismissed_at, r.created_at, p.username AS sender, m.tmdb_id, m.media_type
       FROM public.recommendations r
       LEFT JOIN public.profiles p ON p.id = r.sender_id
       JOIN public.media m ON m.id = r.media_id
       WHERE r.recipient_id = $1 ORDER BY r.created_at`,
      [userId]
    ),
  ]);
  return { sent: sentRows, received: receivedRows };
}
