"use client";

import "@/styles/features/recommend.css";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuthState } from "@/hooks/useLibraryAuth";
import { apiFetch } from "@/lib/api-client";

/*
 * Seletor de visão de /for-you (?view=amigos|enviadas). São links (mudam a URL),
 * marcados com aria-current. O número em âmbar ao lado de "Dos amigos" são as
 * indicações ainda não vistas; some quando a visão "Dos amigos" avisa que abriu.
 */

export type ForYouView = "para-voce" | "amigos" | "enviadas";

export const RECOMMENDATIONS_SEEN_EVENT = "mc:recommendations-seen";

const VIEWS: { id: ForYouView; label: string; href: string }[] = [
  { id: "para-voce", label: "Para você", href: "/for-you" },
  { id: "amigos", label: "Dos amigos", href: "/for-you?view=amigos" },
  { id: "enviadas", label: "Que você indicou", href: "/for-you?view=enviadas" },
];

export function ForYouViewTabs({ current }: { current: ForYouView }) {
  const authState = useAuthState();
  const [unseen, setUnseen] = useState(0);

  useEffect(() => {
    if (authState !== "authenticated" || current === "amigos") return;
    let alive = true;
    apiFetch<{ unseen: number }>("/api/recommendations/summary", { cache: "no-store" })
      .then((data) => alive && setUnseen(Number(data.unseen) || 0))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [authState, current]);

  useEffect(() => {
    const clear = () => setUnseen(0);
    window.addEventListener(RECOMMENDATIONS_SEEN_EVENT, clear);
    return () => window.removeEventListener(RECOMMENDATIONS_SEEN_EVENT, clear);
  }, []);

  if (authState === "guest") return null;

  return (
    <nav className="rc-views" aria-label="Visões de Para você">
      {VIEWS.map((view) => {
        const count = view.id === "amigos" && current !== "amigos" ? unseen : 0;
        return (
          <Link
            key={view.id}
            href={view.href}
            className="rc-view"
            aria-current={view.id === current ? "page" : undefined}
            aria-label={count ? `${view.label}, ${count} ${count === 1 ? "indicação nova" : "indicações novas"}` : undefined}
          >
            {view.label}
            {count ? (
              <span className="rc-view-count" aria-hidden="true">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
