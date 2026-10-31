"use client";

import Link from "next/link";
import { Star, UserCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api-client";
import type { CommunityReview } from "@/lib/reviews/community";

/*
 * "Da comunidade" — notas e resenhas de outras pessoas para este título
 * (lib/reviews/community.ts). Quem você segue aparece primeiro; o resto vem
 * depois. Respeita a privacidade de cada perfil.
 */

type Data = { items: CommunityReview[]; total: number; followedTotal: number; average: number | null; ratingsCount: number };

const PAGE = 10;

function when(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function TitleCommunityReviews({ type, tmdbId }: { type: "movie" | "tv"; tmdbId: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);

  const fetchPage = useCallback(
    (offset: number) => apiFetch<Data>(`/api/reviews/community?type=${type}&tmdb_id=${tmdbId}&limit=${PAGE}&offset=${offset}`, { cache: "no-store" }),
    [type, tmdbId]
  );

  useEffect(() => {
    let alive = true;
    fetchPage(0)
      .then((first) => {
        if (!alive) return;
        setData(first);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (!data) return;
    setMore(true);
    try {
      const next = await fetchPage(data.items.length);
      setData({ ...next, items: [...data.items, ...next.items] });
    } catch {
      /* mantém o que já está na tela; o botão continua disponível */
    } finally {
      setMore(false);
    }
  }

  const items = data?.items ?? [];
  const followed = items.filter((r) => r.followed);
  const others = items.filter((r) => !r.followed);

  return (
    <section className="section mc-title-section title-community" aria-labelledby="title-community-heading">
      <div className="title-section-heading">
        <span>Da comunidade</span>
        <h2 id="title-community-heading">O que as pessoas acharam</h2>
      </div>

      {state === "loading" ? (
        <p className="muted" role="status">
          Carregando avaliações…
        </p>
      ) : state === "error" ? (
        <p className="muted" role="alert">
          Não foi possível carregar as avaliações da comunidade agora.
        </p>
      ) : !data || data.total === 0 ? (
        <div className="mc-title-empty-state">Ninguém avaliou este título ainda. Seja a primeira pessoa!</div>
      ) : (
        <>
          <p className="title-community-summary">
            {data.average !== null ? (
              <>
                <Star size={16} fill="currentColor" aria-hidden="true" />
                <strong>{data.average.toFixed(1)}</strong> média de {data.ratingsCount} {data.ratingsCount === 1 ? "nota" : "notas"} ·{" "}
              </>
            ) : null}
            {data.total} {data.total === 1 ? "avaliação" : "avaliações"}
            {data.followedTotal ? ` · ${data.followedTotal} de quem você segue` : ""}
          </p>

          {followed.length ? (
            <>
              <h3 className="title-community-group">Pessoas que você segue</h3>
              <ul className="title-community-list">{followed.map((r) => <ReviewCard key={r.username} review={r} />)}</ul>
            </>
          ) : null}

          {others.length ? (
            <>
              {followed.length ? <h3 className="title-community-group">Outras pessoas</h3> : null}
              <ul className="title-community-list">{others.map((r) => <ReviewCard key={r.username} review={r} />)}</ul>
            </>
          ) : null}

          {items.length < data.total ? (
            <div className="title-community-more">
              <button type="button" className="btn" disabled={more} onClick={loadMore}>
                {more ? "Carregando…" : `Ver mais avaliações (${data.total - items.length})`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function ReviewCard({ review }: { review: CommunityReview }) {
  const name = review.display_name || `@${review.username}`;
  const [open, setOpen] = useState(false);
  const long = (review.review?.length ?? 0) > 420;

  return (
    <li className="title-community-card">
      <header>
        <Link href={`/u/${review.username}`} className="title-community-user">
          <span className="title-community-avatar" aria-hidden="true">
            {review.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={review.avatar_url} alt="" loading="lazy" />
            ) : (
              name.replace("@", "").slice(0, 2).toUpperCase()
            )}
          </span>
          <span className="title-community-names">
            <strong>{name}</strong>
            <small>@{review.username}</small>
          </span>
        </Link>
        {review.followed ? (
          <span className="title-community-badge">
            <UserCheck size={13} aria-hidden="true" /> Você segue
          </span>
        ) : null}
        {review.rating !== null ? (
          <span className="title-community-rating" aria-label={`Nota ${review.rating.toFixed(1)} de 10`}>
            <Star size={14} fill="currentColor" aria-hidden="true" /> {review.rating.toFixed(1)}
          </span>
        ) : null}
      </header>
      {review.review ? (
        <>
          <p className={`title-community-text${long && !open ? " is-clamped" : ""}`}>{review.review}</p>
          {long ? (
            <button type="button" className="title-community-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "Mostrar menos" : "Ler resenha completa"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="title-community-text muted">Deu nota sem escrever resenha.</p>
      )}
      <small className="title-community-date">{when(review.updated_at)}</small>
    </li>
  );
}
