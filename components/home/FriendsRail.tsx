"use client";

import "@/styles/features/home-smart.css";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CarouselRail } from "@/components/CarouselRail";
import { Poster } from "@/components/Poster";
import { apiFetch } from "@/lib/api-client";
import { sendersLine } from "@/lib/recommendations/rules";

import { HomeSection } from "./HomeSections";

/*
 * Início — "Indicados pelos amigos": até 10 títulos que amigos te indicaram e
 * você ainda não viu nem pôs na Watchlist. Só aparece com indicações pendentes;
 * erro ou vazio não mostram nada (a seção some, como as outras do Início).
 */

type Group = {
  media: { tmdb_id: number; media_type: "movie" | "tv"; title: string; poster_path: string | null };
  senders: { username: string; display_name: string | null }[];
  state: string;
};

export function FriendsRail() {
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    let alive = true;
    apiFetch<{ pending: number }>("/api/recommendations/summary", { cache: "no-store" })
      .then((summary) => {
        if (!summary.pending) return null;
        return apiFetch<{ groups: Group[] }>("/api/recommendations?view=received", { cache: "no-store" });
      })
      .then((data) => {
        if (alive && data) setGroups((data.groups ?? []).filter((g) => g.state === "pending").slice(0, 10));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!groups.length) return null;

  return (
    <HomeSection id="hm-friends" title="Indicados pelos amigos" href="/for-you?view=amigos" linkLabel="Ver todas" className="home-friends">
      <CarouselRail className="home-guest-trending-rail">
        {groups.map((group) => {
          const href = `/title/${group.media.media_type}/${group.media.tmdb_id}`;
          const names = group.senders.map((s) => s.display_name?.trim() || `@${s.username}`);
          return (
            <div key={`${group.media.media_type}-${group.media.tmdb_id}`} className="home-guest-trending-item">
              <Link href={href} className="poster" tabIndex={-1} aria-hidden="true">
                <Poster path={group.media.poster_path} alt="" sizes="150px" />
              </Link>
              <Link href={href} className="home-guest-trending-name home-friends-title">
                {group.media.title}
              </Link>
              <span>{sendersLine(names)}</span>
            </div>
          );
        })}
      </CarouselRail>
    </HomeSection>
  );
}
