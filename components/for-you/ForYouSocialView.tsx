"use client";

import "@/styles/features/for-you.css";
import "@/styles/features/recommend.css";

import Link from "next/link";

import { useAuthState } from "@/hooks/useLibraryAuth";

import { FriendsInbox, RowsSkeleton } from "./FriendsInbox";
import { ForYouViewTabs } from "./ForYouViewTabs";
import { SentRecommendations } from "./SentRecommendations";

/* /for-you?view=amigos|enviadas — as visões de indicações, sem os filtros do feed. */
export function ForYouSocialView({ view }: { view: "amigos" | "enviadas" }) {
  const authState = useAuthState();
  const amigos = view === "amigos";

  return (
    <div className="fy-page rc-page">
      <header className="fy-head">
        <h1 className="fy-head-title">{amigos ? "Dos amigos" : "Que você indicou"}</h1>
        <p className="fy-head-text">
          {amigos
            ? "Filmes e séries que seus amigos mandaram para você."
            : "O que você mandou para os amigos e o que eles acharam."}
        </p>
      </header>

      <ForYouViewTabs current={view} />

      {authState === "guest" ? (
        <div className="rc-state">
          <p>Entre para ver as indicações dos seus amigos.</p>
          <Link href={`/login?next=${encodeURIComponent(`/for-you?view=${view}`)}`} className="rc-text-action">
            Entrar
          </Link>
        </div>
      ) : authState !== "authenticated" ? (
        <RowsSkeleton />
      ) : amigos ? (
        <FriendsInbox />
      ) : (
        <SentRecommendations />
      )}
    </div>
  );
}
