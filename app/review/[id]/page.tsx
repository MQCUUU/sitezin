import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRouteSession } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { reviewAccess } from "@/lib/reviews/access";
import { displayName, loadReview } from "@/lib/reviews/load";

import ReviewView, { type ReviewData } from "@/components/review/ReviewView";

/*
 * Página de uma avaliação (migration 0009): a avaliação inteira, curtidas e os
 * comentários. Quem não pode ver a avaliação recebe 404, como na API.
 */

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<ReviewData | null> {
  const session = await getRouteSession();
  const viewerId = session?.data?.user?.id ? String(session.data.user.id) : null;
  const loaded = await loadReview(getDb(), id, viewerId);
  if (!loaded) return null;
  const access = reviewAccess(loaded.row, { id: viewerId, followsOwner: loaded.followsOwner });
  if (!access.visible) return null;

  return {
    id: loaded.id,
    owner: loaded.owner,
    media: loaded.media,
    rating: access.rating,
    review: access.review,
    wrote_no_review: access.wroteNoReview,
    like_count: loaded.like_count,
    comment_count: loaded.comment_count,
    liked_by_viewer: loaded.liked_by_viewer,
    can_comment: access.canComment,
    can_like: access.canLike,
    is_owner: access.isOwner,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id).catch(() => null);
  if (!data) return { title: "Avaliação não encontrada", robots: { index: false } };
  return {
    title: `Avaliação de ${displayName(data.owner)} para ${data.media.title}`,
    robots: { index: false },
  };
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  return <ReviewView key={data.id} initial={data} />;
}
