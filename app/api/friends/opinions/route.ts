import { getRouteSession, sessionUnavailableResponse } from "@/lib/auth/route-session";
import { NextRequest, NextResponse } from "next/server";

import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { limitPublicRequest } from "@/lib/rate-limit";
import { socialRatingBucket } from "@/lib/social/ratings";

const PAGE_MAX = 30;
const FILTERS = ["all", "love", "like_much", "like", "regular", "dislike"] as const;
const SORTS = ["recent", "highest", "lowest"] as const;

const FRIEND_REVIEWS_SQL = `
  SELECT p.username, p.display_name, p.avatar_url,
         li.personal_rating::float AS rating,
         CASE WHEN coalesce(p.reviews_visibility, p.activity_visibility, 'profile') = 'private' THEN NULL ELSE li.review END AS review,
         coalesce(li.updated_at, li.added_at) AS updated_at
  FROM public.media m
  JOIN public.library_items li ON li.media_id = m.id AND li.personal_rating IS NOT NULL
  JOIN public.profiles p ON p.id = li.user_id AND p.username IS NOT NULL
  JOIN public.follows viewer_follows
    ON viewer_follows.follower_id = $1::uuid AND viewer_follows.following_id = p.id AND viewer_follows.status = 'accepted'
  JOIN public.follows mutual_follows
    ON mutual_follows.follower_id = p.id AND mutual_follows.following_id = $1::uuid AND mutual_follows.status = 'accepted'
  WHERE m.media_type = $2 AND m.tmdb_id = $3
    AND coalesce(p.ratings_visibility, p.activity_visibility, 'profile') <> 'private'
`;

function ratingFilter(filter: string) {
  if (filter === "love") return "rating >= 9";
  if (filter === "like_much") return "rating >= 7.6 AND rating < 9";
  if (filter === "like") return "rating >= 6 AND rating < 7.6";
  if (filter === "regular") return "rating >= 5 AND rating < 6";
  if (filter === "dislike") return "rating < 5";
  return "TRUE";
}

export async function GET(request: NextRequest) {
  const limited = limitPublicRequest(request, "communityReviews");
  if (limited) return limited;

  try {
    const session = await getRouteSession();
    if (session.unavailable) return sessionUnavailableResponse();
    const viewerId = session?.data?.user?.id;
    if (!viewerId) return naoAutenticado();

    const params = request.nextUrl.searchParams;
    const mediaType = params.get("type");
    const tmdbId = Number(params.get("tmdb_id"));
    const filter = params.get("filter") || "all";
    const sort = params.get("sort") || "recent";
    const limitValue = Number(params.get("limit") || 10);
    const offsetValue = Number(params.get("offset") || 0);

    if (mediaType !== "movie" && mediaType !== "tv") return entradaInvalida("Tipo inválido.");
    if (!Number.isInteger(tmdbId) || tmdbId < 1) return entradaInvalida("Título inválido.");
    if (!(FILTERS as readonly string[]).includes(filter)) return entradaInvalida("Filtro de nota inválido.");
    if (!(SORTS as readonly string[]).includes(sort)) return entradaInvalida("Ordenação inválida.");

    const limit = Math.min(PAGE_MAX, Math.max(1, Number.isFinite(limitValue) ? Math.floor(limitValue) : 10));
    const offset = Math.min(1_000_000, Math.max(0, Number.isFinite(offsetValue) ? Math.floor(offsetValue) : 0));
    const sql = getDb();
    const args = [viewerId, mediaType, tmdbId];

    const [summaryRows, items] = await Promise.all([
      sql.query(
        `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE rating >= 9)::int AS love,
          count(*) FILTER (WHERE rating >= 7.6 AND rating < 9)::int AS like_much,
          count(*) FILTER (WHERE rating >= 6 AND rating < 7.6)::int AS like,
          count(*) FILTER (WHERE rating >= 5 AND rating < 6)::int AS regular,
          count(*) FILTER (WHERE rating < 5)::int AS dislike,
          round(avg(rating)::numeric, 1)::float AS average
         FROM (${FRIEND_REVIEWS_SQL}) friend_reviews`, args),
      sql.query(
        `SELECT * FROM (${FRIEND_REVIEWS_SQL}) friend_reviews
         WHERE ${ratingFilter(filter)}
         ORDER BY
           CASE WHEN $4 = 'highest' THEN rating END DESC NULLS LAST,
           CASE WHEN $4 = 'lowest' THEN rating END ASC NULLS LAST,
           CASE WHEN $4 = 'recent' THEN updated_at END DESC NULLS LAST,
           username ASC
         LIMIT $5 OFFSET $6`, [...args, sort, limit, offset]),
    ]);

    return NextResponse.json({
      ...summaryRows[0],
      items: items.map((row: any) => ({
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        rating: Number(row.rating),
        classification: socialRatingBucket(Number(row.rating)),
        review: row.review ? String(row.review).trim() || null : null,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      })),
      filter,
      sort,
      limit,
      offset,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respostaDeErro(error, "GET /api/friends/opinions");
  }
}
