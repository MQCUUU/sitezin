/*
 * Avaliações da comunidade de um título (aba "Avaliações e resenhas").
 *
 * Fonte: a nota e a resenha que cada pessoa deu ao título na própria Biblioteca
 * (library_items.personal_rating / review) — o mesmo campo de "Avaliação e opinião".
 * Nada duplicado: editar a resenha no título atualiza o que a comunidade vê.
 *
 * Privacidade: ratings_visibility e reviews_visibility são avaliadas separadamente
 * no servidor; ambos também respeitam a visibilidade geral do perfil.
 *
 * Ordem: amigos (follow mútuo), pessoas seguidas e demais. Dentro de cada grupo,
 * resenhas com texto antes das só com nota, e as mais recentes primeiro.
 * O próprio leitor não aparece aqui (a avaliação dele já está logo acima).
 */
import { canViewSection } from "@/lib/social/visibility";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

/** Teto de candidatos lidos por título (os mais recentes). */
export const COMMUNITY_SCAN_MAX = 500;
export const COMMUNITY_PAGE_MAX = 30;

export type CommunityCandidate = {
  /** library_items.id — o id da avaliação (página /review/[id]). */
  id?: string;
  like_count?: number;
  comment_count?: number;
  liked_by_viewer?: boolean;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  visibility: string | null;
  is_public: boolean | null;
  activity_visibility: string | null;
  ratings_visibility?: string | null;
  reviews_visibility?: string | null;
  /** O leitor segue esta pessoa (follow aceito). */
  followed: boolean;
  /** O follow é mútuo: esta pessoa também segue o leitor. */
  friend?: boolean;
  rating: number | null;
  review: string | null;
  updated_at: string;
};

export type CommunityReview = {
  id: string;
  like_count: number;
  comment_count: number;
  liked_by_viewer: boolean;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  followed: boolean;
  friend: boolean;
  rating: number | null;
  review: string | null;
  updated_at: string;
};

const hasText = (r: { review: string | null }) => Boolean(r.review && r.review.trim());

/** Filtra pela privacidade e ordena (puro — testado em scripts/test-community-reviews.mjs). */
export function visibleCommunityReviews(rows: CommunityCandidate[], viewerId: string | null): CommunityReview[] {
  return rows
    .filter((row) => row.user_id !== viewerId)
    .filter((row) => {
      const viewer = { isOwner: false, isAcceptedFollower: Boolean(viewerId) && row.followed };
      const canSeeRating = row.rating !== null && canViewSection(row, row.ratings_visibility ?? row.activity_visibility, viewer);
      const canSeeReview = hasText(row) && canViewSection(row, row.reviews_visibility ?? row.activity_visibility, viewer);
      return canSeeRating || canSeeReview;
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.friend)) - Number(Boolean(a.friend)) ||
        Number(b.followed) - Number(a.followed) ||
        Number(hasText(b)) - Number(hasText(a)) ||
        b.updated_at.localeCompare(a.updated_at)
    )
    .map((row) => ({
      id: String(row.id ?? ""),
      like_count: Number(row.like_count) || 0,
      comment_count: Number(row.comment_count) || 0,
      liked_by_viewer: Boolean(viewerId) && Boolean(row.liked_by_viewer),
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      followed: Boolean(viewerId) && row.followed,
      friend: Boolean(viewerId) && Boolean(row.followed) && Boolean(row.friend),
      rating: row.rating !== null && canViewSection(row, row.ratings_visibility ?? row.activity_visibility, { isOwner: false, isAcceptedFollower: Boolean(viewerId) && row.followed }) ? row.rating : null,
      review: hasText(row) && canViewSection(row, row.reviews_visibility ?? row.activity_visibility, { isOwner: false, isAcceptedFollower: Boolean(viewerId) && row.followed }) ? String(row.review).trim() : null,
      updated_at: row.updated_at,
    }));
}

/** Linha do SQL da comunidade → candidato (com as visibilidades por seção). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCommunityCandidate(r: Record<string, any>): CommunityCandidate {
  return {
    id: String(r.id),
    like_count: Number(r.like_count) || 0,
    comment_count: Number(r.comment_count) || 0,
    liked_by_viewer: Boolean(r.liked_by_viewer),
    user_id: String(r.user_id),
    username: String(r.username),
    display_name: r.display_name ?? null,
    avatar_url: r.avatar_url ?? null,
    visibility: r.visibility ?? null,
    is_public: r.is_public ?? null,
    activity_visibility: r.activity_visibility ?? null,
    ratings_visibility: r.ratings_visibility ?? null,
    reviews_visibility: r.reviews_visibility ?? null,
    followed: Boolean(r.followed),
    friend: Boolean(r.friend),
    rating: r.personal_rating === null || r.personal_rating === undefined ? null : Number(r.personal_rating),
    review: r.review ?? null,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function listCommunityReviews(
  sql: Sql,
  input: { mediaType: "movie" | "tv"; tmdbId: number; viewerId: string | null; limit: number; offset: number }
) {
  const viewer = input.viewerId;
  const rows = await sql`
    SELECT
      p.id AS user_id, p.username, p.display_name, p.avatar_url,
      p.visibility, p.is_public, p.activity_visibility, p.ratings_visibility, p.reviews_visibility,
      (f.follower_id IS NOT NULL) AS followed,
      (f.follower_id IS NOT NULL AND f_back.follower_id IS NOT NULL) AS friend,
      li.id, li.personal_rating, li.review,
      COALESCE(li.updated_at, li.added_at) AS updated_at,
      (SELECT count(*)::int FROM public.review_likes l WHERE l.library_item_id = li.id) AS like_count,
      (SELECT count(*)::int FROM public.review_comments c WHERE c.library_item_id = li.id AND c.deleted_at IS NULL) AS comment_count,
      EXISTS (
        SELECT 1 FROM public.review_likes l WHERE l.library_item_id = li.id AND l.user_id = ${viewer}::uuid
      ) AS liked_by_viewer
    FROM public.media m
    JOIN public.library_items li ON li.media_id = m.id
    JOIN public.profiles p ON p.id = li.user_id AND p.username IS NOT NULL
    LEFT JOIN public.follows f
      ON f.follower_id = ${viewer}::uuid AND f.following_id = p.id AND f.status = 'accepted'
    LEFT JOIN public.follows f_back
      ON f_back.follower_id = p.id AND f_back.following_id = ${viewer}::uuid AND f_back.status = 'accepted'
    WHERE m.media_type = ${input.mediaType} AND m.tmdb_id = ${input.tmdbId}
      AND (li.personal_rating IS NOT NULL OR (li.review IS NOT NULL AND trim(li.review) <> ''))
    ORDER BY friend DESC, followed DESC, COALESCE(li.updated_at, li.added_at) DESC
    LIMIT ${COMMUNITY_SCAN_MAX}
  `;

  const candidates: CommunityCandidate[] = rows.map(toCommunityCandidate);

  const visible = visibleCommunityReviews(candidates, viewer);
  const limit = Math.min(Math.max(1, Math.floor(input.limit) || 10), COMMUNITY_PAGE_MAX);
  const offset = Math.max(0, Math.floor(input.offset) || 0);
  const ratings = visible.map((r) => r.rating).filter((n): n is number => n !== null);

  return {
    items: visible.slice(offset, offset + limit),
    total: visible.length,
    followedTotal: visible.filter((r) => r.followed).length,
    friendTotal: visible.filter((r) => r.friend).length,
    followingTotal: visible.filter((r) => r.followed && !r.friend).length,
    average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    ratingsCount: ratings.length,
  };
}
