"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useId, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { apiFetch, ApiError } from "@/lib/api-client";

/*
 * Um comentário da avaliação com as respostas dele (migration 0011). Um nível só:
 * as respostas ficam recuadas, ligadas ao comentário de cima por uma linha fina,
 * com "Respondendo a @fulano". Curtir, Responder e Apagar ficam embaixo do texto.
 */

export type Person = { username: string; display_name: string | null; avatar_url: string | null };

export type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: Person;
  can_delete: boolean;
  parent_id: string | null;
  reply_to: { username: string; display_name: string | null } | null;
  deleted: boolean;
  like_count: number;
  liked_by_viewer: boolean;
  can_like: boolean;
  replies?: Comment[];
};

export const COMMENT_MAX = 500;

export function nameOf(person: { username: string; display_name: string | null }) {
  return person.display_name?.trim() || `@${person.username}`;
}

export function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

export function Avatar({ person }: { person: Person }) {
  return (
    <span className="rv-avatar" aria-hidden="true">
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatar_url} alt="" loading="lazy" />
      ) : (
        nameOf(person).replace("@", "").slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function LikeButton({ reviewId, comment }: { reviewId: string; comment: Comment }) {
  const toast = useToast();
  const [liked, setLiked] = useState(comment.liked_by_viewer);
  const [count, setCount] = useState(comment.like_count);
  const [busy, setBusy] = useState(false);

  if (!comment.can_like) {
    return count > 0 ? (
      <span className="rv-c-like rv-c-like--static">
        <Heart size={15} aria-hidden="true" />
        <span className="rv-count">{count}</span>
        <span className="mc-visually-hidden">{count === 1 ? " curtida" : " curtidas"}</span>
      </span>
    ) : null;
  }

  async function toggle() {
    if (busy) return;
    const next = !liked;
    setBusy(true);
    setLiked(next);
    setCount((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const result = await apiFetch<{ liked: boolean; like_count: number }>(
        `/api/reviews/${reviewId}/comments/${comment.id}/like`,
        { method: next ? "POST" : "DELETE" }
      );
      setLiked(result.liked);
      setCount(result.like_count);
    } catch {
      setLiked(!next);
      setCount((value) => Math.max(0, value + (next ? -1 : 1)));
      toast.show({ title: "Não foi possível curtir agora.", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="rv-c-like"
      data-liked={liked ? "true" : undefined}
      aria-pressed={liked}
      aria-label={liked ? `Descurtir comentário, ${count} ${count === 1 ? "curtida" : "curtidas"}` : `Curtir comentário, ${count} ${count === 1 ? "curtida" : "curtidas"}`}
      onClick={toggle}
    >
      <Heart size={15} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
      {count > 0 ? <span className="rv-count">{count}</span> : null}
    </button>
  );
}

function ReplyForm({
  reviewId,
  target,
  onCreated,
  onCancel,
}: {
  reviewId: string;
  target: Comment;
  onCreated: (reply: Comment) => void;
  onCancel: () => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      setError("Escreva a resposta antes de enviar.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const created = await apiFetch<Comment>(`/api/reviews/${reviewId}/comments`, {
        method: "POST",
        json: { body, reply_to: target.id },
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Não foi possível responder agora.");
      setSending(false);
    }
  }

  return (
    <form className="rv-reply-form" onSubmit={submit} noValidate>
      <label htmlFor={fieldId} className="mc-visually-hidden">
        Responder a {nameOf(target.author)}
      </label>
      <Textarea
        id={fieldId}
        value={draft}
        maxLength={COMMENT_MAX}
        rows={2}
        autoFocus
        placeholder={`Responder a ${nameOf(target.author)}`}
        invalid={Boolean(error)}
        aria-describedby={`${fieldId}-hint`}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      />
      <div className="rv-form-foot">
        <span id={`${fieldId}-hint`} className={error ? "rv-form-error" : "rv-form-count"} role={error ? "alert" : undefined}>
          {error ?? `${draft.length}/${COMMENT_MAX}`}
        </span>
        <span className="rv-reply-form-actions">
          <Button type="button" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={sending}>
            {sending ? "Enviando…" : "Responder"}
          </Button>
        </span>
      </div>
    </form>
  );
}

function CommentItem({
  reviewId,
  comment,
  canComment,
  replyingTo,
  onReply,
  onReplyCreated,
  onRemove,
}: {
  reviewId: string;
  comment: Comment;
  canComment: boolean;
  replyingTo: string | null;
  onReply: (id: string | null) => void;
  onReplyCreated: (reply: Comment) => void;
  onRemove: (comment: Comment) => void;
}) {
  const isReply = comment.parent_id !== null;
  return (
    <div className="rv-c" data-reply={isReply ? "true" : undefined}>
      {comment.deleted ? <span className="rv-avatar rv-avatar--ghost" aria-hidden="true" /> : <Avatar person={comment.author} />}
      <div className="rv-comment-body">
        {comment.deleted ? (
          <p className="rv-comment-text rv-muted">Comentário apagado</p>
        ) : (
          <>
            <p className="rv-comment-meta">
              <Link href={`/u/${comment.author.username}`}>{nameOf(comment.author)}</Link>
              <time dateTime={comment.created_at}>{when(comment.created_at)}</time>
            </p>
            {isReply && comment.reply_to ? (
              <p className="rv-replying">
                Respondendo a <Link href={`/u/${comment.reply_to.username}`}>@{comment.reply_to.username}</Link>
              </p>
            ) : null}
            <p className="rv-comment-text">{comment.body}</p>
            <div className="rv-c-actions">
              <LikeButton reviewId={reviewId} comment={comment} />
              {canComment ? (
                <button
                  type="button"
                  className="rv-text-action"
                  aria-expanded={replyingTo === comment.id}
                  onClick={() => onReply(replyingTo === comment.id ? null : comment.id)}
                >
                  Responder
                </button>
              ) : null}
              {comment.can_delete ? (
                <button type="button" className="rv-text-action" onClick={() => onRemove(comment)}>
                  Apagar
                </button>
              ) : null}
            </div>
          </>
        )}
        {replyingTo === comment.id ? (
          <ReplyForm
            reviewId={reviewId}
            target={comment}
            onCancel={() => onReply(null)}
            onCreated={(reply) => {
              onReplyCreated(reply);
              onReply(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Um comentário de cima e, embaixo dele, as respostas ligadas pela linha. */
export function CommentThread(props: {
  reviewId: string;
  comment: Comment;
  canComment: boolean;
  replyingTo: string | null;
  onReply: (id: string | null) => void;
  onReplyCreated: (reply: Comment) => void;
  onRemove: (comment: Comment) => void;
}) {
  const { comment, ...rest } = props;
  const replies = comment.replies ?? [];
  return (
    <li className="rv-comment">
      <CommentItem comment={comment} {...rest} />
      {replies.length ? (
        <ul className="rv-replies" aria-label={`Respostas a ${comment.deleted ? "um comentário apagado" : nameOf(comment.author)}`}>
          {replies.map((reply) => (
            <li key={reply.id}>
              <CommentItem comment={reply} {...rest} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
