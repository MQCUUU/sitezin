/*
 * Quem vê, curte, comenta e apaga numa avaliação (library_items com nota ou
 * resenha). Mesmas regras de privacidade da lista da comunidade
 * (lib/reviews/community.ts): nota e resenha têm visibilidades próprias, com
 * activity_visibility como padrão. Curtidas e comentários herdam: quem não vê a
 * avaliação não vê nem os números, e as rotas respondem 404.
 */
import { canViewSection } from "@/lib/social/visibility";

export type ReviewRow = {
  owner_id: string;
  visibility: unknown;
  is_public: unknown;
  activity_visibility: unknown;
  ratings_visibility: unknown;
  reviews_visibility: unknown;
  rating: number | null;
  review: string | null;
};

export type ReviewViewer = { id: string | null; followsOwner: boolean };

export type ReviewAccess = {
  visible: boolean;
  rating: number | null;
  review: string | null;
  /** O autor deu só nota (não há resenha nenhuma, nem oculta). */
  wroteNoReview: boolean;
  isOwner: boolean;
  canComment: boolean;
  canLike: boolean;
};

export const COMMENT_MAX = 500;

export function reviewAccess(row: ReviewRow, viewer: ReviewViewer): ReviewAccess {
  const isOwner = viewer.id !== null && viewer.id === row.owner_id;
  const relation = { isOwner, isAcceptedFollower: viewer.id !== null && viewer.followsOwner };
  const text = typeof row.review === "string" && row.review.trim() ? row.review.trim() : null;

  const rating =
    row.rating !== null && canViewSection(row, row.ratings_visibility ?? row.activity_visibility, relation) ? row.rating : null;
  const review = text !== null && canViewSection(row, row.reviews_visibility ?? row.activity_visibility, relation) ? text : null;
  const visible = rating !== null || review !== null;
  const canComment = visible && viewer.id !== null;

  return { visible, rating, review, wroteNoReview: text === null, isOwner, canComment, canLike: canComment && !isOwner };
}

export function canDeleteComment(comment: { user_id: string }, reviewOwnerId: string, viewerId: string | null): boolean {
  if (!viewerId) return false;
  return comment.user_id === viewerId || reviewOwnerId === viewerId;
}

export function normalizeCommentBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  return body.length >= 1 && body.length <= COMMENT_MAX ? body : null;
}

export function likeNoticeCopy(actorName: string, total: number, titleName: string): string {
  const others = Math.max(0, Math.floor(total) - 1);
  if (others === 0) return `${actorName} curtiu sua avaliação de ${titleName}`;
  return `${actorName} e mais ${others} ${others === 1 ? "pessoa" : "pessoas"} curtiram sua avaliação de ${titleName}`;
}

/*
 * Respostas (migration 0011): um nível só. Responder a uma resposta fica no
 * mesmo nível (parent = o comentário de cima) e marca quem foi respondido.
 */
export function replyTarget(target: { id: string; parent_id: string | null; user_id: string }): {
  parentId: string;
  replyToUserId: string;
} {
  return { parentId: target.parent_id ?? target.id, replyToUserId: target.user_id };
}

/** Comentário de cima com respostas vivas vira "Comentário apagado"; o resto sai de vez. */
export function commentDeleteMode(comment: { parent_id: string | null }, liveReplies: number): "soft" | "hard" {
  return comment.parent_id === null && liveReplies > 0 ? "soft" : "hard";
}

export function replyNoticeCopy(actorName: string, titleName: string): string {
  return `${actorName} respondeu seu comentário na avaliação de ${titleName}`;
}

export function commentLikeNoticeCopy(actorName: string, total: number, titleName: string): string {
  const others = Math.max(0, Math.floor(total) - 1);
  if (others === 0) return `${actorName} curtiu seu comentário na avaliação de ${titleName}`;
  return `${actorName} e mais ${others} ${others === 1 ? "pessoa" : "pessoas"} curtiram seu comentário na avaliação de ${titleName}`;
}
