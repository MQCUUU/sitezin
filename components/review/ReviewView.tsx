"use client";

import "@/styles/features/review.css";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

import { SmartBackButton } from "@/components/SmartBackButton";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";
import { TitleBand } from "@/components/title/hero/TitleBand";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { apiFetch, ApiError } from "@/lib/api-client";

/*
 * Página da avaliação: a Tela do título, quem avaliou, a nota e o texto inteiros,
 * curtir e os comentários (mais antigos primeiro). Comentar só com sessão; apagar
 * só o autor do comentário ou o dono da avaliação.
 */

type Person = { username: string; display_name: string | null; avatar_url: string | null };

export type ReviewData = {
  id: string;
  owner: Person;
  media: { media_type: "movie" | "tv"; tmdb_id: number; title: string; backdrop_path: string | null };
  rating: number | null;
  review: string | null;
  /** O autor deu só nota; resenha oculta para quem vê não conta como "sem resenha". */
  wrote_no_review: boolean;
  like_count: number;
  comment_count: number;
  liked_by_viewer: boolean;
  can_comment: boolean;
  can_like: boolean;
  is_owner: boolean;
};

type Comment = { id: string; body: string; created_at: string; author: Person; can_delete: boolean };
type CommentsPage = { items: Comment[]; next_cursor: string | null };

const MAX = 500;

function nameOf(person: Person) {
  return person.display_name?.trim() || `@${person.username}`;
}

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

function Avatar({ person }: { person: Person }) {
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

export default function ReviewView({ initial }: { initial: ReviewData }) {
  const toast = useToast();
  const confirm = useConfirm();
  const fieldId = useId();

  const [liked, setLiked] = useState(initial.liked_by_viewer);
  const [likes, setLikes] = useState(initial.like_count);
  const [likeBusy, setLikeBusy] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(initial.comment_count);
  const [cursor, setCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const titleHref = `/title/${initial.media.media_type}/${initial.media.tmdb_id}`;
  const ownerName = nameOf(initial.owner);

  const fetchPage = useCallback(
    (after: string | null) =>
      apiFetch<CommentsPage>(`/api/reviews/${initial.id}/comments${after ? `?cursor=${encodeURIComponent(after)}` : ""}`, {
        cache: "no-store",
      }),
    [initial.id]
  );

  const loadFirst = useCallback(() => {
    setListState("loading");
    fetchPage(null)
      .then((page) => {
        setComments(page.items);
        setCursor(page.next_cursor);
        setListState("ready");
      })
      .catch(() => setListState("error"));
  }, [fetchPage]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      setComments((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setCursor(page.next_cursor);
    } catch {
      toast.show({ title: "Não foi possível carregar mais comentários.", kind: "error" });
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleLike() {
    if (likeBusy) return;
    const next = !liked;
    setLikeBusy(true);
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const result = await apiFetch<{ liked: boolean; like_count: number }>(`/api/reviews/${initial.id}/like`, {
        method: next ? "POST" : "DELETE",
      });
      setLiked(result.liked);
      setLikes(result.like_count);
    } catch {
      setLiked(!next);
      setLikes((value) => Math.max(0, value + (next ? -1 : 1)));
      toast.show({ title: "Não foi possível curtir agora.", kind: "error" });
    } finally {
      setLikeBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      setFormError("Escreva um comentário antes de enviar.");
      return;
    }
    if (body.length > MAX) {
      setFormError(`O comentário passa de ${MAX} caracteres.`);
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      const created = await apiFetch<Comment>(`/api/reviews/${initial.id}/comments`, { method: "POST", json: { body } });
      // Sem próxima página, o novo comentário é o último da lista; com mais páginas, ele chega ao fim delas.
      if (!cursor) setComments((current) => [...current, created]);
      setTotal((value) => value + 1);
      setDraft("");
    } catch (error) {
      setFormError(error instanceof ApiError && error.message ? error.message : "Não foi possível comentar agora.");
    } finally {
      setSending(false);
    }
  }

  async function remove(comment: Comment) {
    const ok = await confirm({
      title: "Apagar comentário?",
      description: "O comentário sai desta avaliação e não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/reviews/${initial.id}/comments/${comment.id}`, { method: "DELETE" });
      // O cursor é o id do último comentário carregado: se ele sai, o anterior vira o cursor.
      if (cursor === comment.id) {
        const index = comments.findIndex((item) => item.id === comment.id);
        setCursor(index > 0 ? comments[index - 1].id : null);
      }
      setComments((current) => current.filter((item) => item.id !== comment.id));
      setTotal((value) => Math.max(0, value - 1));
    } catch {
      toast.show({ title: "Não foi possível apagar o comentário.", kind: "error" });
    }
  }

  const rating = initial.rating !== null ? initial.rating.toFixed(1).replace(".", ",") : null;
  const remaining = MAX - draft.length;

  return (
    <article className="rv-page">
      <div className="title-back-wrap">
        <SmartBackButton />
      </div>

      <div className="rv-band">
        <TitleBand path={initial.media.backdrop_path} />
      </div>

      <header className="rv-head">
        <h1 className="rv-title">
          Avaliação de <Link href={`/u/${initial.owner.username}`}>{ownerName}</Link> para{" "}
          <Link href={titleHref}>{initial.media.title}</Link>
        </h1>
      </header>

      <section className="rv-review" aria-label="Avaliação">
        {rating ? (
          <p className="rv-rating" aria-label={`Nota ${rating} de 10`}>
            {rating}
          </p>
        ) : null}
        {initial.review ? (
          <p className="rv-text">{initial.review}</p>
        ) : initial.wrote_no_review ? (
          <p className="rv-text rv-muted">Deu nota sem escrever resenha.</p>
        ) : null}

        <div className="rv-actions">
          {initial.can_like ? (
            <button
              type="button"
              className="rv-like"
              data-liked={liked ? "true" : undefined}
              aria-pressed={liked}
              onClick={toggleLike}
            >
              <Heart size={18} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
              {liked ? "Curtiu" : "Curtir"}
              <span className="rv-count">{likes}</span>
            </button>
          ) : (
            <p className="rv-like-count">
              <Heart size={18} aria-hidden="true" /> {likes} {likes === 1 ? "curtida" : "curtidas"}
            </p>
          )}
        </div>
      </section>

      <section className="rv-comments-section" aria-labelledby="rv-comments-title">
        <h2 id="rv-comments-title" className="rv-comments-title">
          {total} {total === 1 ? "comentário" : "comentários"}
        </h2>

        {listState === "loading" ? (
          <ul className="rv-comments" aria-busy="true" aria-label="Carregando comentários">
            {[0, 1].map((key) => (
              <li key={key} className="rv-comment rv-comment-skeleton" aria-hidden="true">
                <span className="rv-avatar mc-skeleton" />
                <span className="rv-skeleton-lines">
                  <span className="mc-skeleton rv-skeleton-line rv-skeleton-line--short" />
                  <span className="mc-skeleton rv-skeleton-line" />
                </span>
              </li>
            ))}
          </ul>
        ) : listState === "error" ? (
          <div className="rv-error" role="alert">
            <p>Não foi possível carregar os comentários.</p>
            <Button type="button" onClick={loadFirst}>
              Tentar de novo
            </Button>
          </div>
        ) : comments.length ? (
          <ul className="rv-comments">
            {comments.map((comment) => (
              <li key={comment.id} className="rv-comment">
                <Avatar person={comment.author} />
                <div className="rv-comment-body">
                  <p className="rv-comment-meta">
                    <Link href={`/u/${comment.author.username}`}>{nameOf(comment.author)}</Link>
                    <time dateTime={comment.created_at}>{when(comment.created_at)}</time>
                  </p>
                  <p className="rv-comment-text">{comment.body}</p>
                  {comment.can_delete ? (
                    <button type="button" className="rv-text-action" onClick={() => remove(comment)}>
                      Apagar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {cursor && listState === "ready" ? (
          <Button type="button" className="rv-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Carregando…" : "Mais comentários"}
          </Button>
        ) : null}

        {initial.can_comment ? (
          <form className="rv-form" onSubmit={submit} noValidate>
            <label htmlFor={fieldId} className="rv-label">
              Escreva um comentário
            </label>
            <Textarea
              id={fieldId}
              value={draft}
              maxLength={MAX}
              rows={3}
              invalid={Boolean(formError)}
              aria-describedby={`${fieldId}-hint`}
              onChange={(event) => {
                setDraft(event.target.value);
                if (formError) setFormError(null);
              }}
            />
            <div className="rv-form-foot">
              <span id={`${fieldId}-hint`} className={formError ? "rv-form-error" : "rv-form-count"} role={formError ? "alert" : undefined}>
                {formError ?? `${draft.length}/${MAX}`}
              </span>
              <Button type="submit" variant="primary" disabled={sending || remaining < 0}>
                {sending ? "Enviando…" : "Comentar"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="rv-guest">
            <Link href={`/login?next=${encodeURIComponent(`/review/${initial.id}`)}`}>Entre para comentar</Link>
          </p>
        )}
      </section>
    </article>
  );
}
