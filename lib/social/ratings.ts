export const SOCIAL_RATING_BUCKETS = ["love", "like_much", "like", "regular", "dislike"] as const;
export type SocialRatingBucket = (typeof SOCIAL_RATING_BUCKETS)[number];

/** Classificação social de notas na escala pessoal já armazenada (0–10). */
export function socialRatingBucket(value: number | null | undefined): SocialRatingBucket | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const rating = Number(value);
  if (rating < 0 || rating > 10) return null;
  if (rating >= 9) return "love";
  if (rating >= 7.6) return "like_much";
  if (rating >= 6) return "like";
  if (rating >= 5) return "regular";
  return "dislike";
}

/** Similaridade média absoluta suavizada para não exagerar com poucas notas comuns. */
export function normalizedTasteAffinity(sharedRatings: number, averageDifference: number): number | null {
  const count = Math.floor(Number(sharedRatings));
  const difference = Number(averageDifference);
  if (count < 3 || !Number.isFinite(difference) || difference < 0) return null;
  const raw = Math.max(0, Math.min(100, 100 - difference * 10));
  const reliability = count / (count + 5);
  return Math.round(50 + (raw - 50) * reliability);
}

export function tasteAffinityLabel(score: number | null): string | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 80) return "Alta afinidade";
  if (score >= 65) return "Gostos parecidos";
  return "Gostos diferentes";
}
