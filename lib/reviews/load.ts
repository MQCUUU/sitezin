/*
 * Carrega uma avaliação (library_items) com o perfil do dono, o título e a
 * relação de quem pede, para lib/reviews/access.ts decidir o que mostrar.
 * Devolve null para id inválido ou inexistente: as rotas respondem 404 igual.
 */
import type { ReviewRow } from "@/lib/reviews/access";

type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type LoadedReview = {
  id: string;
  row: ReviewRow;
  followsOwner: boolean;
  owner: { username: string; display_name: string | null; avatar_url: string | null };
  media: { media_type: "movie" | "tv"; tmdb_id: number; title: string; backdrop_path: string | null; poster_path: string | null; year: number | null };
  /** Data em que assistiu e a visibilidade do diário (a página decide se mostra). */
  watched_at: string | null;
  diary_visibility: unknown;
  like_count: number;
  comment_count: number;
  liked_by_viewer: boolean;
};

export async function loadReview(sql: Sql, id: string, viewerId: string | null): Promise<LoadedReview | null> {
  if (!isUuid(id)) return null;
  const rows = await sql`
    SELECT
      li.id, li.user_id AS owner_id, li.personal_rating, li.review, li.watched_at,
      p.username, p.display_name, p.avatar_url,
      p.visibility, p.is_public, p.activity_visibility, p.ratings_visibility, p.reviews_visibility, p.diary_visibility,
      m.media_type, m.tmdb_id, m.title, m.backdrop_path, m.poster_path,
      EXTRACT(YEAR FROM COALESCE(m.release_date, m.first_air_date))::int AS year,
      EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = ${viewerId}::uuid AND f.following_id = li.user_id AND f.status = 'accepted'
      ) AS follows_owner,
      (SELECT count(*)::int FROM public.review_likes l WHERE l.library_item_id = li.id) AS like_count,
      (SELECT count(*)::int FROM public.review_comments c WHERE c.library_item_id = li.id) AS comment_count,
      EXISTS (
        SELECT 1 FROM public.review_likes l WHERE l.library_item_id = li.id AND l.user_id = ${viewerId}::uuid
      ) AS liked_by_viewer
    FROM public.library_items li
    JOIN public.profiles p ON p.id = li.user_id AND p.username IS NOT NULL
    JOIN public.media m ON m.id = li.media_id
    WHERE li.id = ${id}::uuid
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;

  return {
    id: String(r.id),
    row: {
      owner_id: String(r.owner_id),
      visibility: r.visibility,
      is_public: r.is_public,
      activity_visibility: r.activity_visibility,
      ratings_visibility: r.ratings_visibility,
      reviews_visibility: r.reviews_visibility,
      rating: r.personal_rating === null || r.personal_rating === undefined ? null : Number(r.personal_rating),
      review: r.review ?? null,
    },
    followsOwner: Boolean(r.follows_owner),
    owner: { username: String(r.username), display_name: r.display_name ?? null, avatar_url: r.avatar_url ?? null },
    media: {
      media_type: r.media_type === "tv" ? "tv" : "movie",
      tmdb_id: Number(r.tmdb_id),
      title: String(r.title),
      backdrop_path: r.backdrop_path ?? null,
      poster_path: r.poster_path ?? null,
      year: r.year === null || r.year === undefined ? null : Number(r.year),
    },
    watched_at: r.watched_at ? new Date(r.watched_at).toISOString() : null,
    diary_visibility: r.diary_visibility ?? null,
    like_count: Number(r.like_count) || 0,
    comment_count: Number(r.comment_count) || 0,
    liked_by_viewer: Boolean(r.liked_by_viewer),
  };
}

export type ReviewComment = {
  id: string;
  body: string;
  created_at: string;
  author: { username: string; display_name: string | null; avatar_url: string | null };
  can_delete: boolean;
};

export const COMMENTS_PAGE = 20;

export function toComment(r: any, ownerId: string, viewerId: string | null): ReviewComment {
  const userId = String(r.user_id);
  return {
    id: String(r.id),
    body: String(r.body),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    author: { username: String(r.username ?? ""), display_name: r.display_name ?? null, avatar_url: r.avatar_url ?? null },
    can_delete: viewerId !== null && (userId === viewerId || ownerId === viewerId),
  };
}

export function displayName(person: { username: string; display_name: string | null }) {
  return person.display_name?.trim() || `@${person.username}`;
}
