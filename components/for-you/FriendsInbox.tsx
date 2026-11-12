"use client";

import "@/styles/features/recommend.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { Poster } from "@/components/Poster";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { sendersLine, timeAgo, type RecipientState } from "@/lib/recommendations/rules";

import { RECOMMENDATIONS_SEEN_EVENT } from "./ForYouViewTabs";

/*
 * "Dos amigos" — o que os amigos te indicaram, um título por linha (várias
 * indicações do mesmo título viram uma linha só). Pendentes primeiro, depois as
 * que já estão na Watchlist; assistidas e dispensadas não aparecem aqui.
 * Abrir esta visão marca os avisos de indicação como lidos.
 */

type Sender = { username: string; display_name: string | null; avatar_url: string | null; note: string | null; created_at: string };
type Group = {
  media: { id: number; tmdb_id: number; media_type: "movie" | "tv"; title: string; poster_path: string | null };
  senders: Sender[];
  state: RecipientState;
};

function nameOf(sender: Sender) {
  return sender.display_name?.trim() || `@${sender.username}`;
}

export function FriendsInbox() {
  const toast = useToast();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [groups, setGroups] = useState<Group[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    apiFetch<{ groups: Group[] }>("/api/recommendations?view=received", { cache: "no-store" })
      .then((data) => {
        setGroups((data.groups ?? []).filter((g) => g.state === "pending" || g.state === "saved"));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    load();
    apiFetch("/api/notifications", { method: "PATCH", json: { type: "recommendation_received" } })
      .then(() => window.dispatchEvent(new Event(RECOMMENDATIONS_SEEN_EVENT)))
      .catch(() => undefined);
  }, [load]);

  async function addToWatchlist(group: Group) {
    setBusy(group.media.id);
    try {
      await apiFetch("/api/library", {
        method: "POST",
        json: { media: { id: group.media.tmdb_id, media_type: group.media.media_type }, status: "want" },
      });
      setGroups((current) => current.map((g) => (g.media.id === group.media.id ? { ...g, state: "saved" } : g)));
      toast.success(`${group.media.title} está na sua Watchlist.`);
    } catch (error) {
      toast.error("Não foi possível pôr na Watchlist.", { description: errorMessage(error, "") || undefined });
    } finally {
      setBusy(null);
    }
  }

  async function markWatched(group: Group) {
    setBusy(group.media.id);
    try {
      const existing = await apiFetch<{ id?: string } | null>(
        `/api/library?tmdb_id=${group.media.tmdb_id}&type=${group.media.media_type}`,
        { cache: "no-store" }
      );
      if (existing?.id) {
        await apiFetch(`/api/library/${existing.id}`, { method: "PATCH", json: { status: "watched" } });
      } else {
        await apiFetch("/api/library", {
          method: "POST",
          json: { media: { id: group.media.tmdb_id, media_type: group.media.media_type }, status: "watched" },
        });
      }
      // Leva ao título para dar a nota.
      router.push(`/title/${group.media.media_type}/${group.media.tmdb_id}`);
    } catch (error) {
      toast.error("Não foi possível marcar como visto.", { description: errorMessage(error, "") || undefined });
      setBusy(null);
    }
  }

  async function dismiss(group: Group) {
    setBusy(group.media.id);
    try {
      await apiFetch("/api/recommendations/dismiss", { method: "POST", json: { media_id: group.media.id } });
      setGroups((current) => current.filter((g) => g.media.id !== group.media.id));
    } catch (error) {
      toast.error("Não foi possível dispensar.", { description: errorMessage(error, "") || undefined });
    } finally {
      setBusy(null);
    }
  }

  if (status === "loading") return <RowsSkeleton />;

  if (status === "error") {
    return (
      <div className="rc-state" role="alert">
        <p>Não foi possível carregar as indicações dos amigos.</p>
        <Button type="button" onClick={load}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="rc-state">
        <p>Quando um amigo te indicar algo, aparece aqui.</p>
        <Link href="/discover" className="rc-text-action">
          Descobrir
        </Link>
      </div>
    );
  }

  return (
    <ul className="rc-rows" aria-label="Indicações dos amigos">
      <AnimatePresence initial={false}>
        {groups.map((group) => {
          const href = `/title/${group.media.media_type}/${group.media.tmdb_id}`;
          const latest = group.senders[0];
          const notes = group.senders.filter((s) => s.note);
          const disabled = busy === group.media.id;
          return (
            <motion.li
              key={group.media.id}
              className="rc-row"
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
            >
              <Link href={href} className="rc-poster" tabIndex={-1} aria-hidden="true">
                <Poster path={group.media.poster_path} alt="" sizes="72px" tmdbSize="w185" />
              </Link>
              <div className="rc-row-body">
                <Link href={href} className="rc-row-title">
                  {group.media.title}
                </Link>
                <p className="rc-row-meta">
                  {sendersLine(group.senders.map(nameOf))}, {timeAgo(latest.created_at)}
                </p>
                {notes.map((sender) => (
                  <blockquote key={sender.username} className="rc-note-quote">
                    “{sender.note}”{group.senders.length > 1 ? <cite> {nameOf(sender)}</cite> : null}
                  </blockquote>
                ))}
                <div className="rc-row-actions">
                  {group.state === "saved" ? (
                    <span className="rc-row-state">Na sua Watchlist</span>
                  ) : (
                    <button type="button" className="rc-text-action" disabled={disabled} onClick={() => addToWatchlist(group)}>
                      Pôr na Watchlist
                    </button>
                  )}
                  <button type="button" className="rc-text-action" disabled={disabled} onClick={() => markWatched(group)}>
                    Já vi
                  </button>
                  {group.state === "pending" ? (
                    <button type="button" className="rc-text-action rc-text-action--quiet" disabled={disabled} onClick={() => dismiss(group)}>
                      Dispensar
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/** Esqueleto das linhas: mesmo pôster 2:3 e as mesmas três linhas de texto. */
export function RowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="rc-rows" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="rc-row" aria-hidden="true">
          <span className="rc-poster mc-skeleton" />
          <span className="rc-row-body">
            <span className="mc-skeleton rc-skeleton-line rc-skeleton-line--title" />
            <span className="mc-skeleton rc-skeleton-line rc-skeleton-line--meta" />
            <span className="mc-skeleton rc-skeleton-line rc-skeleton-line--actions" />
          </span>
        </li>
      ))}
    </ul>
  );
}
