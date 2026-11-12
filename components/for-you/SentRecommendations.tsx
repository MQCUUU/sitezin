"use client";

import "@/styles/features/recommend.css";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useConfirm } from "@/components/ConfirmProvider";
import { Poster } from "@/components/Poster";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api-client";
import { senderStatusLabel, timeAgo, type RecipientState } from "@/lib/recommendations/rules";

import { RowsSkeleton } from "./FriendsInbox";

/*
 * "Que você indicou" — cada envio, para quem e o que o amigo fez com ele. A
 * dispensa aparece como "ainda não viu" (por gentileza). O faro fica no topo
 * a partir de uma indicação com nota visível.
 */

type Item = {
  id: string;
  media: { tmdb_id: number; media_type: "movie" | "tv"; title: string; poster_path: string | null };
  recipient: { username: string; display_name: string | null };
  label: string;
  state: RecipientState;
  rating: number | null;
  state_at: string | null;
  can_cancel: boolean;
  created_at: string;
};
type Data = { items: Item[]; faro: { hits: number; rated: number; label: string | null } };

export function SentRecommendations() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(() => {
    setStatus("loading");
    apiFetch<Data>("/api/recommendations?view=sent", { cache: "no-store" })
      .then((next) => {
        setData(next);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(item: Item) {
    const friend = item.recipient.display_name?.trim() || `@${item.recipient.username}`;
    const ok = await confirm({
      title: "Cancelar indicação?",
      description: `${friend} deixa de ver ${item.media.title} entre as indicações.`,
      confirmLabel: "Cancelar indicação",
      cancelLabel: "Manter",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/recommendations/${item.id}`, { method: "DELETE" });
      setData((current) => (current ? { ...current, items: current.items.filter((i) => i.id !== item.id) } : current));
    } catch {
      toast.error("Não foi possível cancelar a indicação.");
    }
  }

  if (status === "loading") return <RowsSkeleton />;

  if (status === "error" || !data) {
    return (
      <div className="rc-state" role="alert">
        <p>Não foi possível carregar o que você indicou.</p>
        <Button type="button" onClick={load}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!data.items.length) {
    return (
      <div className="rc-state">
        <p>Você ainda não indicou nada. Abra um filme ou série e use Indicar para mandar a um amigo.</p>
        <Link href="/discover" className="rc-text-action">
          Descobrir
        </Link>
      </div>
    );
  }

  return (
    <>
      {data.faro.label ? (
        <p className="rc-faro">
          Faro: <strong>{data.faro.label}</strong>
        </p>
      ) : null}
      <ul className="rc-rows" aria-label="Indicações que você fez">
        {data.items.map((item) => {
          const href = `/title/${item.media.media_type}/${item.media.tmdb_id}`;
          const friend = item.recipient.display_name?.trim() || `@${item.recipient.username}`;
          return (
            <li key={item.id} className="rc-row">
              <Link href={href} className="rc-poster" tabIndex={-1} aria-hidden="true">
                <Poster path={item.media.poster_path} alt="" sizes="72px" tmdbSize="w185" />
              </Link>
              <div className="rc-row-body">
                <Link href={href} className="rc-row-title">
                  {item.media.title}
                </Link>
                {/* Uma linha: "para Bisnaga, colocou na Watchlist hoje" / "para Bisnaga hoje, ainda não viu". */}
                <p className="rc-row-meta">
                  para <Link href={`/u/${item.recipient.username}`}>{friend}</Link>
                  {item.state === "saved" || item.state === "watched" ? (
                    <>, <span className="rc-row-state rc-row-state--inline">{senderStatusLabel(item.state, item.rating, item.state_at ? timeAgo(item.state_at) : "")}</span></>
                  ) : (
                    <> {timeAgo(item.created_at)}, <span className="rc-row-state rc-row-state--inline">{item.label}</span></>
                  )}
                </p>
                {item.can_cancel ? (
                  <div className="rc-row-actions">
                    <button type="button" className="rc-text-action rc-text-action--quiet" onClick={() => cancel(item)}>
                      Cancelar indicação
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
