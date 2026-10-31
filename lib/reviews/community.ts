/*
 * Avaliações da comunidade de um título (aba "Avaliações e resenhas").
 *
 * Fonte: a nota e a resenha que cada pessoa deu ao título na própria Biblioteca
 * (library_items.personal_rating / review) — o mesmo campo de "Avaliação e opinião".
 * Nada duplicado: editar a resenha no título atualiza o que a comunidade vê.
 *
 * Privacidade: a MESMA regra do perfil público (lib/social/visibility.ts). No perfil,
 * as reviews aparecem conforme a visibilidade de ATIVIDADE; aqui também:
 *  - perfil público + atividade "perfil": qualquer pessoa vê;
 *  - perfil privado: só seguidores aceitos (atividade "perfil" ou "seguidores");
 *  - atividade "privada": ninguém além do dono.
 *
 * Ordem: primeiro quem o leitor segue; depois os demais. Dentro de cada grupo,
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
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  visibility: string | null;
  is_public: boolean | null;
  activity_visibility: string | null;
  /** O leitor segue esta pessoa (follow aceito). */
  followed: boolean;
  rating: number | null;
  review: string | null;
  updated_at: string;
};

export type CommunityReview = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  followed: boolean;
  rating: number | null;
  review: string | null;
  updated_at: string;
};

const hasText = (r: { review: string | null }) => Boolean(r.review && r.review.trim());

/** Filtra pela privacidade e ordena (puro — testado em scripts/test-community-reviews.mjs). */
export function visibleCommunityReviews(rows: CommunityCandidate[], viewerId: string | null): CommunityReview[] {
  return rows
    .filter((row) => row.user_id !== viewerId)
    .filter((row) => row.rating !== null || hasText(row))
    .filter((row) =>
      canViewSection(row, row.activity_visibility, { isOwner: false, isAcceptedFollower: Boolean(viewerId) && row.followed })
    )
    .sort(
      (a, b) =>
        Number(b.followed) - Number(a.followed) ||
        Number(hasText(b)) - Number(hasText(a)) ||
        b.updated_at.localeCompare(a.updated_at)
    )
    .map((row) => ({
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      followed: Boolean(viewerId) && row.followed,
      rating: row.rating,
      review: hasText(row) ? String(row.review).trim() : null,
      updated_at: row.updated_at,
    }));
}

export async function listCommunityReviews(
  sql: Sql,
  input: { mediaType: "movie" | "tv"; tmdbId: number; viewerId: string | null; limit: number; offset: number }
) {
  const viewer = input.viewerId;
  const rows = await sql`
    SELECT
      p.id AS user_id, p.username, p.display_name, p.avatar_url,
      p.visibility, p.is_public, p.activity_visibility,
      (f.follower_id IS NOT NULL) AS followed,
      li.personal_rating, li.review,
      COALESCE(li.updated_at, li.added_at) AS updated_at
    FROM public.media m
    JOIN public.library_items li ON li.media_id = m.id
    JOIN public.profiles p ON p.id = li.user_id AND p.username IS NOT NULL
    LEFT JOIN public.follows f
      ON f.follower_id = ${viewer}::uuid AND f.following_id = p.id AND f.status = 'accepted'
    WHERE m.media_type = ${input.mediaType} AND m.tmdb_id = ${input.tmdbId}
      AND (li.personal_rating IS NOT NULL OR (li.review IS NOT NULL AND trim(li.review) <> ''))
    ORDER BY COALESCE(li.updated_at, li.added_at) DESC
    LIMIT ${COMMUNITY_SCAN_MAX}
  `;

  const candidates: CommunityCandidate[] = rows.map((r) => ({
    user_id: String(r.user_id),
    username: String(r.username),
    display_name: r.display_name ?? null,
    avatar_url: r.avatar_url ?? null,
    visibility: r.visibility ?? null,
    is_public: r.is_public ?? null,
    activity_visibility: r.activity_visibility ?? null,
    followed: Boolean(r.followed),
    rating: r.personal_rating === null || r.personal_rating === undefined ? null : Number(r.personal_rating),
    review: r.review ?? null,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));

  const visible = visibleCommunityReviews(candidates, viewer);
  const limit = Math.min(Math.max(1, Math.floor(input.limit) || 10), COMMUNITY_PAGE_MAX);
  const offset = Math.max(0, Math.floor(input.offset) || 0);
  const ratings = visible.map((r) => r.rating).filter((n): n is number => n !== null);

  return {
    items: visible.slice(offset, offset + limit),
    total: visible.length,
    followedTotal: visible.filter((r) => r.followed).length,
    average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    ratingsCount: ratings.length,
  };
}
