"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheck, CircleX, Minus, Star, ThumbsDown, ThumbsUp, Users, X } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { useModal } from "@/hooks/useModal";

type Review = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number;
  classification: string | null;
  review: string | null;
  updated_at: string;
};

type Opinions = {
  total: number;
  love: number;
  like_much: number;
  like: number;
  regular: number;
  dislike: number;
  average: number | null;
  items: Review[];
};

const PAGE = 10;
const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "love", label: "Excelente" },
  { key: "like_much", label: "Bom" },
  { key: "like", label: "OK" },
  { key: "regular", label: "Fraco" },
  { key: "dislike", label: "Ruim" },
] as const;

const CLASSIFICATIONS = [
  { key: "love", label: "Excelente", range: "10-9,0", icon: CircleCheck, color: "#2ECC71" },
  { key: "like_much", label: "Bom", range: "8,9-7,6", icon: ThumbsUp, color: "#3498DB" },
  { key: "like", label: "OK", range: "7,5-6,0", icon: Minus, color: "#F1C40F" },
  { key: "regular", label: "Fraco", range: "5,9-5,0", icon: ThumbsDown, color: "#E67E22" },
  { key: "dislike", label: "Ruim", range: "Abaixo de 5", icon: CircleX, color: "#E74C3C" },
] as const;

function asCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

export function FriendOpinions({ item }: { item: any }) {
  const type = item.media_type === "tv" ? "tv" : "movie";
  const title = item.title || item.name || "este título";
  const endorsement = item.friend_endorsement || item.friend_opinion_summary;
  const avatars = Array.isArray(endorsement?.friends) ? endorsement.friends.slice(0, 4) : [];
  const total = asCount(endorsement?.total_friends);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [data, setData] = useState<Opinions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const modalRef = useModal(open, () => setOpen(false));

  const endpoint = useCallback((offset: number) => {
    const params = new URLSearchParams({
      type,
      tmdb_id: String(item.id),
      filter,
      sort,
      limit: String(PAGE),
      offset: String(offset),
    });
    return apiFetch<Opinions>(`/api/friends/opinions?${params}`, { cache: "no-store" });
  }, [filter, item.id, sort, type]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(false);
    endpoint(0)
      .then((result) => alive && setData(result))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [endpoint, open]);

  const counts = useMemo(() => CLASSIFICATIONS.map((c) => ({ ...c, count: asCount(data?.[c.key as keyof Opinions]) })), [data]);
  const denominator = asCount(data?.total);
  const activeCount = filter === "all" ? asCount(data?.total) : asCount(data?.[filter as keyof Opinions]);

  async function loadMore() {
    if (!data || loading) return;
    setLoading(true);
    try {
      const next = await endpoint(data.items.length);
      setData({ ...next, items: [...data.items, ...next.items] });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (!total) return null;

  return (
    <>
      <button type="button" className="fy-social-endorsement fy-social-trigger" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); }} aria-label={`Ver as avaliações dos ${total} amigos de ${title}`}>
        <span className="fy-social-visuals" aria-hidden="true">
          <span className="fy-social-avatar-stack">
            {avatars.map((friend: any) => friend.avatar_url ? <img key={friend.username} src={friend.avatar_url} alt="" loading="lazy" /> : <span key={friend.username}>{(friend.display_name || friend.username || "?").slice(0, 1).toUpperCase()}</span>)}
          </span>
          {total > avatars.length && <span className="fy-social-more">+{total - avatars.length}</span>}
        </span>
        <span className="fy-social-trigger-copy"><Users size={14} /><span>{total} {total === 1 ? "amigo avaliou" : "amigos avaliaram"}</span></span>
      </button>

      {open && typeof document !== "undefined" && createPortal(<div className="fy-opinions-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <section ref={modalRef as React.RefObject<HTMLElement>} className="fy-opinions-panel" role="dialog" aria-modal="true" aria-labelledby={`fy-opinions-title-${type}-${item.id}`}>
          <header className="fy-opinions-head">
            <div><span className="eyebrow">OPINIÕES DOS SEUS AMIGOS</span><h2 id={`fy-opinions-title-${type}-${item.id}`}>{title}</h2><p>{data?.total ?? total} amigos avaliaram este título</p></div>
            <button type="button" aria-label="Fechar painel" onClick={() => setOpen(false)}><X size={20} /></button>
          </header>

          {data && <>
            <div className="fy-opinions-summary">
              {counts.map((category) => {
                const Icon = category.icon;
                return <div key={category.key} aria-label={`${category.label}: ${category.count} avaliações, notas ${category.range}`}>
                  <Icon size={20} aria-hidden="true" style={{ color: category.color }} />
                  <strong>{category.count}</strong>
                  <small>{category.label}</small>
                  <small className="fy-opinions-range" style={{ color: category.color }} title={`Notas ${category.range}`}>{category.range}</small>
                </div>;
              })}
            </div>
            {denominator > 0 && <div className="fy-opinions-bar" role="img" aria-label="Distribuição das avaliações dos amigos">
              {counts.filter((c) => c.count > 0).map((c) => <span key={c.key} style={{ width: `${(c.count / denominator) * 100}%`, background: c.color }} title={`${Math.round((c.count / denominator) * 100)}% ${c.label.toLowerCase()}`} />)}
            </div>}
            <p className="fy-opinions-average"><Star size={15} fill="currentColor" /> Média dos amigos: <strong>{data.average == null ? "—" : Number(data.average).toFixed(1)}</strong></p>
          </>}

          <div className="fy-opinions-controls">
            <div className="fy-opinions-filters" aria-label="Filtrar por classificação">
              {FILTERS.map(({ key, label }) => {
                const category = CLASSIFICATIONS.find((item) => item.key === key);
                const selected = filter === key;
                return <button
                  key={key}
                  type="button"
                  className={selected ? "active" : ""}
                  aria-label={category ? `${label}, notas ${category.range}` : label}
                  title={category ? `Notas ${category.range}` : label}
                  style={selected && category ? { borderColor: category.color, color: category.color, background: `color-mix(in srgb, ${category.color} 12%, var(--panel))` } : undefined}
                  onClick={() => setFilter(key)}
                >{label}</button>;
              })}
            </div>
            <label>Ordenar por <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Mais recentes</option><option value="highest">Maior nota</option><option value="lowest">Menor nota</option></select></label>
          </div>

          {error && <p className="fy-opinions-state" role="alert">Não foi possível carregar as opiniões. Tente novamente.</p>}
          {!error && loading && !data && <p className="fy-opinions-state" role="status">Carregando opiniões…</p>}
          {data && data.items.length === 0 && <p className="fy-opinions-state">Nenhum amigo nesta classificação.</p>}
          {data && data.items.length > 0 && <ul className="fy-opinions-list">{data.items.map((review) => <li key={review.username}>
            <Link href={`/u/${review.username}`} onClick={() => setOpen(false)} className="fy-opinions-person">
              {review.avatar_url ? <img src={review.avatar_url} alt="" loading="lazy" /> : <span>{(review.display_name || review.username).slice(0, 1).toUpperCase()}</span>}
              <strong>{review.display_name || `@${review.username}`}</strong>
            </Link>
            <span className="fy-opinions-rating">
              {(() => {
                const category = CLASSIFICATIONS.find((item) => item.key === review.classification);
                const Icon = category?.icon;
                return Icon ? <Icon size={15} aria-label={category.label} style={{ color: category.color }} /> : null;
              })()}
              <Star size={14} fill="currentColor" /> {Number(review.rating).toFixed(1)}
            </span>
            {review.review && <p>{review.review}</p>}
            <time dateTime={review.updated_at}>{new Date(review.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</time>
          </li>)}</ul>}
          {data && data.items.length < activeCount && <button type="button" className="btn fy-opinions-more" disabled={loading} onClick={loadMore}>{loading ? "Carregando…" : "Ver todos os amigos que avaliaram"}</button>}
        </section>
      </div>, document.body)}
    </>
  );
}
