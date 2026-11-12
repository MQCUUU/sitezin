"use client";

import "@/styles/features/recommend.css";

import { Send, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useAuthState } from "@/hooks/useLibraryAuth";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { joinNames, NOTE_MAX } from "@/lib/recommendations/rules";

/*
 * Indicações (migration 0010) na página do título: o botão Indicar (só com sessão
 * e pelo menos um amigo), o painel de envio e a linha "Indicado por Ana e Bruno".
 * O servidor reconfere amizade e marcações; o painel só antecipa o que ele diria.
 */

type Friend = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  watched: boolean;
  already_sent: boolean;
};

type SendResult = { sent: string[]; skipped: { id: string; reason: "not_friend" | "watched" | "already_sent" }[] };

const SEARCH_FROM = 12;

function nameOf(friend: Pick<Friend, "username" | "display_name">) {
  return friend.display_name?.trim() || `@${friend.username}`;
}

const SKIP_COPY: Record<SendResult["skipped"][number]["reason"], string> = {
  not_friend: "não é mais seu amigo",
  watched: "já viu",
  already_sent: "já tinha recebido",
};

export function RecommendButton({ tmdbId, type, title }: { tmdbId: number; type: "movie" | "tv"; title: string }) {
  const authState = useAuthState();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    return apiFetch<{ friends: Friend[] }>(`/api/recommendations/candidates?tmdb_id=${tmdbId}&type=${type}`, { cache: "no-store" })
      .then((data) => setFriends(Array.isArray(data.friends) ? data.friends : []))
      .catch(() => setFriends([]));
  }, [tmdbId, type]);

  useEffect(() => {
    if (authState === "authenticated") void load();
  }, [authState, load]);

  if (authState !== "authenticated" || !friends?.length) return null;

  return (
    <>
      <Button type="button" className="tt-quiet tt-icon rc-trigger" aria-label="Indicar" title="Indicar" onClick={() => setOpen(true)}>
        <Send size={18} aria-hidden="true" />
      </Button>
      <RecommendDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        tmdbId={tmdbId}
        type={type}
        friends={friends}
        onSent={() => void load()}
      />
    </>
  );
}

function RecommendDialog({
  open,
  onClose,
  title,
  tmdbId,
  type,
  friends,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  tmdbId: number;
  type: "movie" | "tv";
  friends: Friend[];
  onSent: () => void;
}) {
  const toast = useToast();
  const titleId = useId();
  const noteId = useId();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (sending) return;
    onClose();
    setSelected(new Set());
    setQuery("");
    setNote("");
    setError(null);
  }, [onClose, sending]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((friend) => `${friend.display_name ?? ""} ${friend.username}`.toLowerCase().includes(q));
  }, [friends, query]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected.size || sending) return;
    if (note.trim().length > NOTE_MAX) {
      setError(`O bilhete tem até ${NOTE_MAX} caracteres.`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await apiFetch<SendResult>("/api/recommendations", {
        method: "POST",
        json: { tmdb_id: tmdbId, media_type: type, recipient_ids: [...selected], note: note.trim() || null },
      });
      const byId = new Map(friends.map((friend) => [friend.id, friend]));
      const sentNames = result.sent.map((id) => nameOf(byId.get(id) ?? { username: "", display_name: "Um amigo" }));
      const skippedLines = result.skipped.map((skip) => `${nameOf(byId.get(skip.id) ?? { username: "", display_name: "Um amigo" })} ${SKIP_COPY[skip.reason]}.`);

      if (sentNames.length) {
        toast.success(`Indicado para ${joinNames(sentNames)}`, skippedLines.length ? { description: skippedLines.join(" ") } : undefined);
      } else {
        toast.error("Nada foi enviado", { description: skippedLines.join(" ") || undefined });
      }
      onSent();
      setSending(false);
      onClose();
      setSelected(new Set());
      setNote("");
      setQuery("");
    } catch (sendError) {
      setError(errorMessage(sendError, "Não foi possível indicar agora. Tente de novo."));
      setSending(false);
    }
  }

  const count = selected.size;

  return (
    <Dialog open={open} onClose={close} labelledBy={titleId} className="rc-dialog">
      <form className="rc-form" onSubmit={submit} noValidate>
        <header className="rc-head">
          <h2 id={titleId}>Indicar {title}</h2>
          <button type="button" className="rc-close" onClick={close} aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {friends.length > SEARCH_FROM ? (
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar amigo"
            aria-label="Buscar amigo"
          />
        ) : null}

        <fieldset className="rc-friends">
          <legend className="mc-visually-hidden">Amigos</legend>
          {visible.length ? (
            <ul>
              {visible.map((friend) => {
                const reason = friend.watched ? "já viu" : friend.already_sent ? "já indicado" : null;
                return (
                  <li key={friend.id}>
                    <label className="rc-friend" data-disabled={reason ? "true" : undefined}>
                      <input
                        type="checkbox"
                        checked={selected.has(friend.id)}
                        disabled={Boolean(reason) || sending}
                        onChange={() => toggle(friend.id)}
                      />
                      <span className="rc-avatar" aria-hidden="true">
                        {friend.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={friend.avatar_url} alt="" loading="lazy" />
                        ) : (
                          nameOf(friend).replace("@", "").slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <span className="rc-name">
                        <strong>{nameOf(friend)}</strong>
                        <small>@{friend.username}</small>
                      </span>
                      {reason ? <span className="rc-reason">{reason}</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rc-empty">Nenhum amigo com esse nome.</p>
          )}
        </fieldset>

        <div className="rc-note">
          <label htmlFor={noteId}>Bilhete (opcional)</label>
          <Textarea
            id={noteId}
            value={note}
            rows={2}
            maxLength={NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            aria-describedby={`${noteId}-count`}
          />
          <span id={`${noteId}-count`} className="rc-count">
            {note.length}/{NOTE_MAX}
          </span>
        </div>

        {error ? (
          <p className="rc-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rc-foot">
          <Button type="submit" variant="primary" disabled={!count || sending}>
            {sending ? "Enviando…" : "Enviar indicação"}
          </Button>
          <span className="rc-selected" aria-live="polite">
            {count ? `${count} ${count === 1 ? "amigo" : "amigos"}` : ""}
          </span>
        </div>
      </form>
    </Dialog>
  );
}

/** "Indicado por Ana e Bruno" — só com indicação pendente ou na Watchlist deste título. */
export function RecommendedBy({ tmdbId, type }: { tmdbId: number; type: "movie" | "tv" }) {
  const authState = useAuthState();
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (authState !== "authenticated") return;
    let alive = true;
    apiFetch<{ groups: { state: string; senders: { username: string; display_name: string | null }[] }[] }>(
      `/api/recommendations?view=received&tmdb_id=${tmdbId}&type=${type}`,
      { cache: "no-store" }
    )
      .then((data) => {
        if (!alive) return;
        const group = (data.groups ?? []).find((g) => g.state === "pending" || g.state === "saved");
        setNames(group ? group.senders.map(nameOf) : []);
      })
      .catch(() => alive && setNames([]));
    return () => {
      alive = false;
    };
  }, [authState, tmdbId, type]);

  if (!names.length) return null;
  return <p className="rc-by">Indicado por {joinNames(names)}</p>;
}
