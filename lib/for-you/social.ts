/*
 * Recomendações sociais para o "Para você" (V2.9).
 *
 * Filtra e ranqueia títulos avaliados por amigos (follow mútuo).
 * Proteção anti-"várzea" (mesmo se o usuário seguir 100 perfis):
 *   1. Ponto de corte rigoroso: nota pessoal >= 7.0 ou curtido. Notas baixas (<=6) são descartadas.
 *   2. Não recomenda o que o usuário já tem na Biblioteca, já assistiu ou ocultou.
 *   3. Consenso entre amigos tem peso dominante (+40 por amigo adicional): se 2 ou 3 amigos
 *      avaliaram positivamente, o título sobe imediatamente para o topo.
 *   4. Resenha com texto tem bônus (+25): opinião escrita indica recomendação ativa real.
 *   5. Afinidade com o perfil do leitor: desempata a favor dos gêneros favoritos do usuário.
 *   6. Recência: avaliações dos últimos 30-60 dias ganham bônus.
 *   7. Mínimo de qualidade: requer ao menos 2 títulos para formar a prateleira.
 */

import type { Profile } from "./profile";
import type { SortMode } from "./rank";
import { keysFromNames } from "./genres";
import { normalizedTasteAffinity, socialRatingBucket } from "../social/ratings";

export type FriendRawData = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number | null;
  review: string | null;
  favorite: boolean;
  status: string | null;
  updated_at: string;
  average_rating_difference?: number | null;
  shared_ratings?: number;
};

export type FriendCandidateRow = {
  db_media_id: number;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  original_title?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  overview?: string;
  genres: string[] | null;
  release_date: string | null;
  first_air_date: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  friends_data: FriendRawData[];
  rating_friend_count: number;
  friend_count: number;
};

export type FriendEndorsement = {
  total_friends: number;
  friends: Array<Pick<FriendRawData, "user_id" | "username" | "display_name" | "avatar_url" | "rating">>;
  distribution: Record<"love" | "like_much" | "like" | "regular" | "dislike", number>;
  top_friend: {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    rating: number | null;
    review: string | null;
    favorite: boolean;
  };
  other_friends_count: number;
  headline: string;
  review_snippet: string | null;
};

export type FriendRecommendationCard = {
  id: number;
  media_type: "movie" | "tv";
  title: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  popularity?: number;
  in_library: boolean;
  status: string | null;
  favorite: boolean;
  library_id: string | null;
  personal_rating: number | null;
  reason: string;
  friend_endorsement: FriendEndorsement;
  social_score: number;
};

export const SOCIAL_SQL = `
WITH friends AS (
  SELECT f.following_id AS user_id,
         p.username,
         p.display_name,
         p.avatar_url,
         p.ratings_visibility,
         p.reviews_visibility,
         p.likes_visibility
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.following_id
  JOIN public.follows mutual
    ON mutual.follower_id = f.following_id
   AND mutual.following_id = f.follower_id
   AND mutual.status = 'accepted'
  WHERE f.follower_id = $1::uuid
    AND f.status = 'accepted'
),
friend_affinity AS (
  SELECT fr.user_id,
    count(*)::int AS shared_ratings,
    avg(abs(theirs.personal_rating::float - mine.personal_rating::float))::float AS average_rating_difference
  FROM friends fr
  JOIN public.library_items theirs ON theirs.user_id = fr.user_id AND theirs.personal_rating IS NOT NULL
  JOIN public.library_items mine ON mine.user_id = $1::uuid AND mine.media_id = theirs.media_id AND mine.personal_rating IS NOT NULL
  WHERE coalesce(fr.ratings_visibility, 'profile') <> 'private'
  GROUP BY fr.user_id
),
friend_ratings AS (
  SELECT
    fr.user_id,
    fr.username,
    fr.display_name,
    fr.avatar_url,
    li.media_id,
    CASE WHEN coalesce(fr.ratings_visibility, 'profile') <> 'private' THEN li.personal_rating::float ELSE NULL END AS rating,
    CASE WHEN coalesce(fr.reviews_visibility, 'profile') <> 'private' THEN li.review ELSE NULL END AS review,
    CASE WHEN coalesce(fr.likes_visibility, 'profile') <> 'private' THEN li.favorite ELSE false END AS favorite,
    li.status,
    coalesce(li.updated_at, li.added_at) AS updated_at,
    fa.average_rating_difference,
    fa.shared_ratings
  FROM friends fr
  JOIN public.library_items li ON li.user_id = fr.user_id
  LEFT JOIN friend_affinity fa ON fa.user_id = fr.user_id
  WHERE (coalesce(fr.ratings_visibility, 'profile') <> 'private' AND li.personal_rating IS NOT NULL)
     OR (coalesce(fr.likes_visibility, 'profile') <> 'private' AND li.favorite = true)
),
candidates AS (
  SELECT
    m.id AS db_media_id,
    m.tmdb_id,
    m.media_type,
    m.title,
    m.original_title,
    m.poster_path,
    m.backdrop_path,
    m.overview,
    m.genres,
    m.release_date::text AS release_date,
    m.first_air_date::text AS first_air_date,
    m.tmdb_rating::float AS vote_average,
    m.tmdb_vote_count::int AS vote_count,
    m.popularity::float AS popularity,
    json_agg(
      json_build_object(
        'user_id', fr.user_id,
        'username', fr.username,
        'display_name', fr.display_name,
        'avatar_url', fr.avatar_url,
        'rating', fr.rating,
        'review', fr.review,
        'favorite', fr.favorite,
        'status', fr.status,
        'updated_at', fr.updated_at,
        'average_rating_difference', fr.average_rating_difference,
        'shared_ratings', fr.shared_ratings
      ) ORDER BY
        CASE WHEN fr.review IS NOT NULL AND trim(fr.review) <> '' THEN 1 ELSE 0 END DESC,
        coalesce(fr.rating, 8.5) DESC,
        fr.updated_at DESC
    ) AS friends_data,
    count(*) FILTER (WHERE fr.rating IS NOT NULL)::int AS rating_friend_count,
    count(*) FILTER (WHERE fr.rating >= 7.0 OR (fr.favorite = true AND (fr.rating IS NULL OR fr.rating >= 7.0)))::int AS friend_count,
    avg(fr.rating) FILTER (WHERE fr.rating >= 7.0)::float AS positive_average_rating
  FROM friend_ratings fr
  JOIN public.media m ON m.id = fr.media_id
  LEFT JOIN public.library_items my_li ON my_li.media_id = m.id AND my_li.user_id = $1::uuid
  WHERE my_li.id IS NULL
    AND m.tmdb_id IS NOT NULL
    AND m.poster_path IS NOT NULL
  GROUP BY m.id, m.tmdb_id, m.media_type, m.title, m.original_title, m.poster_path, m.backdrop_path,
           m.overview, m.genres, m.release_date, m.first_air_date, m.tmdb_rating, m.tmdb_vote_count, m.popularity
  HAVING count(*) FILTER (WHERE fr.rating >= 7.0 OR (fr.favorite = true AND (fr.rating IS NULL OR fr.rating >= 7.0))) > 0
)
SELECT * FROM candidates
ORDER BY positive_average_rating DESC NULLS LAST, friend_count DESC, popularity DESC NULLS LAST
LIMIT 120;
`;

/** Resumo social em lote para todos os cards do Para Você, sem uma consulta por título. */
export const FRIEND_OPINIONS_SUMMARY_SQL = `
WITH targets AS (
  SELECT DISTINCT t.media_type, t.tmdb_id
  FROM jsonb_to_recordset($2::jsonb) AS t(media_type text, tmdb_id bigint)
), friends AS (
  SELECT f.following_id AS user_id
  FROM public.follows f
  JOIN public.follows mutual ON mutual.follower_id = f.following_id
    AND mutual.following_id = f.follower_id AND mutual.status = 'accepted'
  WHERE f.follower_id = $1::uuid AND f.status = 'accepted'
), rated AS (
  SELECT m.media_type, m.tmdb_id, p.username, p.display_name, p.avatar_url,
         li.personal_rating::float AS rating, coalesce(li.updated_at, li.added_at) AS updated_at
  FROM targets t
  JOIN public.media m ON m.media_type = t.media_type AND m.tmdb_id = t.tmdb_id
  JOIN public.library_items li ON li.media_id = m.id AND li.personal_rating IS NOT NULL
  JOIN public.profiles p ON p.id = li.user_id
  JOIN friends f ON f.user_id = p.id
  WHERE coalesce(p.ratings_visibility, p.activity_visibility, 'profile') <> 'private'
), ranked AS (
  SELECT rated.*, row_number() OVER (PARTITION BY media_type, tmdb_id ORDER BY rating DESC, updated_at DESC, username) AS rn
  FROM rated
), summary AS (
  SELECT media_type, tmdb_id, count(*)::int AS total_friends,
    count(*) FILTER (WHERE rating >= 9)::int AS love,
    count(*) FILTER (WHERE rating >= 7.6 AND rating < 9)::int AS like_much,
    count(*) FILTER (WHERE rating >= 6 AND rating < 7.6)::int AS like,
    count(*) FILTER (WHERE rating >= 5 AND rating < 6)::int AS regular,
    count(*) FILTER (WHERE rating < 5)::int AS dislike,
    round(avg(rating)::numeric, 1)::float AS average
  FROM rated GROUP BY media_type, tmdb_id
)
SELECT s.*, COALESCE((SELECT json_agg(json_build_object(
    'username', r.username, 'display_name', r.display_name, 'avatar_url', r.avatar_url, 'rating', r.rating
  ) ORDER BY r.rn) FROM ranked r WHERE r.media_type = s.media_type AND r.tmdb_id = s.tmdb_id AND r.rn <= 4), '[]'::json) AS friends
FROM summary s;
`;

/** Formata o texto de chamada para exibição no card do Para você. */
export function buildFriendHeadline(
  topFriend: FriendRawData,
  totalFriends: number
): { headline: string; reviewSnippet: string | null } {
  const friendName = (topFriend.display_name || topFriend.username || "Amigo").trim();
  const hasReview = Boolean(topFriend.review && topFriend.review.trim().length > 0);
  const ratingStr = topFriend.rating !== null && topFriend.rating !== undefined ? Number(topFriend.rating).toFixed(topFriend.rating % 1 === 0 ? 0 : 1) : null;
  const reviewText = hasReview ? topFriend.review!.trim() : null;

  const reviewSnippet = reviewText
    ? reviewText.length > 90
      ? `${reviewText.slice(0, 87)}...`
      : reviewText
    : null;

  if (totalFriends > 1) {
    const othersCount = totalFriends - 1;
    const othersLabel = othersCount === 1 ? "mais 1 amigo recomendam" : `mais ${othersCount} amigos recomendam`;

    if (reviewSnippet && ratingStr) {
      return {
        headline: `${friendName} (${ratingStr}★) e ${othersLabel}`,
        reviewSnippet: `"${reviewSnippet}"`,
      };
    }
    if (ratingStr) {
      return {
        headline: `${friendName} (${ratingStr}★) e ${othersLabel}`,
        reviewSnippet: null,
      };
    }
    return {
      headline: `${friendName} e ${othersLabel}`,
      reviewSnippet: reviewSnippet ? `"${reviewSnippet}"` : null,
    };
  }

  // 1 amigo
  if (reviewSnippet && ratingStr) {
    return {
      headline: `${friendName} avaliou com ${ratingStr} e opinou:`,
      reviewSnippet: `"${reviewSnippet}"`,
    };
  }

  if (ratingStr) {
    return {
      headline: `${friendName} avaliou com nota ${ratingStr}`,
      reviewSnippet: null,
    };
  }

  if (reviewSnippet) {
    return {
      headline: `${friendName} favoritou e opinou:`,
      reviewSnippet: `"${reviewSnippet}"`,
    };
  }

  return {
    headline: `${friendName} favoritou este título`,
    reviewSnippet: null,
  };
}

/**
 * Calcula a pontuação social anti-"várzea" para um candidato.
 * - Multi-amigos (+40 por amigo adicional): títulos com consenso de 2+ amigos disparam no ranking.
 * - Nota dos amigos: média ponderada (10★ = 100 pts, 8★ = 80 pts).
 * - Opinião escrita: +25 pontos pela presença de resenha, +10 por resenhas extras.
 * - Favorito: +15 pontos se algum amigo favoritou.
 * - Recência: até +15 pontos para atividade recente.
 * - Afinidade: até +20 pontos de afinidade com os gêneros do usuário leitor.
 */
export function scoreSocialCandidate(
  row: FriendCandidateRow,
  profile?: Profile,
  nowMs: number = Date.now()
): { score: number; topFriend: FriendRawData } {
  const friends = (Array.isArray(row.friends_data) ? row.friends_data : []).filter(
    (friend) => (friend.rating !== null && friend.rating >= 7) || friend.favorite
  );
  if (!friends.length) return { score: 0, topFriend: {} as FriendRawData };

  // Escolhe o top friend: prioriza quem escreveu resenha com maior nota; depois maior nota; depois mais recente
  const sortedFriends = [...friends].sort((a, b) => {
    const aHasReview = Boolean(a.review && a.review.trim().length > 0);
    const bHasReview = Boolean(b.review && b.review.trim().length > 0);
    if (aHasReview !== bHasReview) return aHasReview ? -1 : 1;

    const aRating = a.rating ?? (a.favorite ? 8.5 : 7.0);
    const bRating = b.rating ?? (b.favorite ? 8.5 : 7.0);
    if (aRating !== bRating) return bRating - aRating;

    const aTime = a.updated_at ? Date.parse(a.updated_at) : 0;
    const bTime = b.updated_at ? Date.parse(b.updated_at) : 0;
    return bTime - aTime;
  });

  const topFriend = sortedFriends[0];

  // 1. Consenso entre amigos
  // 1 amigo: 30 pts; 2 amigos: 70 pts; 3 amigos: 110 pts; 4 amigos: 150 pts; 5+: até 200 pts
  const friendCountScore = 30 + Math.min(friends.length - 1, 4) * 40;

  // 2. Média das notas dos amigos (0-100 pts)
  const ratings = friends.map((f) => (f.rating !== null && f.rating !== undefined ? f.rating : f.favorite ? 8.5 : 7.0));
  const avgRating = ratings.reduce((acc, r) => acc + r, 0) / Math.max(1, ratings.length);
  const ratingScore = avgRating * 10;

  // 3. Bônus de resenha com texto
  const reviewsCount = friends.filter((f) => f.review && f.review.trim().length > 0).length;
  const reviewScore = reviewsCount > 0 ? 25 + Math.min(reviewsCount - 1, 3) * 10 : 0;

  // 4. Bônus de favorito
  const favoriteScore = friends.some((f) => f.favorite) ? 15 : 0;
  // Afinidade suavizada por cinco avaliações neutras. Só recompensa
  // semelhança confiável; gostos diferentes não eliminam um amigo do feed.
  const affinityRows = friends
    .map((f) => normalizedTasteAffinity(Number(f.shared_ratings || 0), Number(f.average_rating_difference)))
    .filter((score): score is number => score !== null);
  const socialAffinityScore = affinityRows.length
    ? Math.round(Math.max(0, (affinityRows.reduce((sum, score) => sum + score, 0) / affinityRows.length - 50) / 50) * 12)
    : 0;

  // 5. Bônus de recência (últimos 14 dias: +15, 30 dias: +10, 60 dias: +5)
  let recencyScore = 0;
  const mostRecentMs = Math.max(...friends.map((f) => (f.updated_at ? Date.parse(f.updated_at) : 0)));
  if (mostRecentMs > 0) {
    const daysAgo = (nowMs - mostRecentMs) / (1000 * 60 * 60 * 24);
    if (daysAgo <= 14) recencyScore = 15;
    else if (daysAgo <= 30) recencyScore = 10;
    else if (daysAgo <= 60) recencyScore = 5;
  }

  // 6. Afinidade com o gosto do leitor (se perfil disponível)
  let affinityScore = 0;
  if (profile && profile.genre && row.genres && Array.isArray(row.genres)) {
    const keys = keysFromNames(row.genres);
    for (const k of keys) {
      const val = profile.genre.get(k) ?? 0;
      if (val > 0) {
        affinityScore = Math.max(affinityScore, Math.min(20, Math.round(val * 15)));
      }
    }
  }

  // 7. Sanidade TMDB (filmes reconhecidos com boas avaliações ganham pequeno empurrão)
  const tmdbScore = (row.vote_average || 0) >= 7.0 && (row.vote_count || 0) >= 100 ? 10 : 0;

  const totalScore = friendCountScore + ratingScore + reviewScore + favoriteScore + recencyScore + affinityScore + socialAffinityScore + tmdbScore;

  return { score: totalScore, topFriend };
}

/**
 * Ranqueia e monta a lista de cards recomendados pelos amigos.
 * Retorna null se não houver candidatos suficientes (mínimo de 2 títulos de qualidade).
 */
function normalizeDate(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value) return value.slice(0, 10);
  return undefined;
}

export function buildFriendRecommendations(
  rows: FriendCandidateRow[],
  profile?: Profile,
  options?: {
    sort?: SortMode;
    limit?: number;
    nowMs?: number;
    hidden?: Set<string>;
    exclude?: Set<string>;
  }
): FriendRecommendationCard[] | null {
  const limit = options?.limit ?? 12;
  const nowMs = options?.nowMs ?? Date.now();
  const hidden = options?.hidden ?? new Set();
  const exclude = options?.exclude ?? new Set();

  const scoredCards: FriendRecommendationCard[] = [];

  for (const row of rows) {
    const key = `${row.media_type}-${row.tmdb_id}`;
    if (hidden.has(key) || exclude.has(key)) continue;

    const { score, topFriend } = scoreSocialCandidate(row, profile, nowMs);
    if (!topFriend.user_id) continue;

    const supporters = row.friend_count || 1;
    const ratedFriends = (Array.isArray(row.friends_data) ? row.friends_data : [])
      .filter((friend) => friend.rating !== null)
      .sort((a, b) => Number(b.rating) - Number(a.rating) || Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""));
    const totalFriends = row.rating_friend_count ?? ratedFriends.length;
    const { headline, reviewSnippet } = buildFriendHeadline(topFriend, supporters);
    const distribution = { love: 0, like_much: 0, like: 0, regular: 0, dislike: 0 };
    for (const friend of ratedFriends) {
      const bucket = socialRatingBucket(friend.rating);
      if (bucket) distribution[bucket] += 1;
    }

    const releaseDate = normalizeDate(row.release_date);
    const firstAirDate = normalizeDate(row.first_air_date);

    scoredCards.push({
      id: row.tmdb_id,
      media_type: row.media_type,
      title: row.title,
      name: row.title,
      original_title: row.original_title,
      original_name: row.original_title,
      overview: row.overview,
      poster_path: row.poster_path,
      backdrop_path: row.backdrop_path,
      release_date: releaseDate,
      first_air_date: firstAirDate,
      vote_average: Number(row.vote_average || 0),
      vote_count: Number(row.vote_count || 0),
      popularity: Number(row.popularity || 0),
      in_library: false,
      status: null,
      favorite: false,
      library_id: null,
      personal_rating: null,
      reason: headline,
      friend_endorsement: {
        total_friends: totalFriends,
        friends: ratedFriends.slice(0, 4).map(({ user_id, username, display_name, avatar_url, rating }) => ({ user_id, username, display_name, avatar_url, rating })),
        distribution,
        top_friend: {
          user_id: topFriend.user_id,
          username: topFriend.username,
          display_name: topFriend.display_name,
          avatar_url: topFriend.avatar_url,
          rating: topFriend.rating,
          review: topFriend.review,
          favorite: Boolean(topFriend.favorite),
        },
        other_friends_count: Math.max(0, totalFriends - Math.min(4, ratedFriends.length)),
        headline,
        review_snippet: reviewSnippet,
      },
      social_score: score,
    });
  }

  // Seleciona primeiro os candidatos mais relevantes para o usuário: nota e
  // consenso dos amigos, afinidade com o perfil e qualidade geral.
  scoredCards.sort((a, b) => b.social_score - a.social_score);
  const selectedCards = scoredCards.slice(0, limit);

  // Dentro da seleção, mantém a ordenação que o usuário escolheu na página.
  if (options?.sort === "rating") {
    selectedCards.sort((a, b) => b.vote_average - a.vote_average || b.social_score - a.social_score);
  } else if (options?.sort === "newest") {
    selectedCards.sort((a, b) => {
      const aDate = a.release_date || a.first_air_date || "";
      const bDate = b.release_date || b.first_air_date || "";
      return bDate.localeCompare(aDate) || b.social_score - a.social_score;
    });
  } else if (options?.sort === "popular") {
    selectedCards.sort((a, b) => (b.popularity || 0) - (a.popularity || 0) || b.social_score - a.social_score);
  }

  // Mínimo de 2 títulos para formar uma prateleira sólida e relevante (evita prateleira com 1 item solitário)
  if (scoredCards.length < 2) {
    return null;
  }

  return selectedCards;
}
