"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Clock3,
  Compass,
  Heart,
  Play,
  Sparkles,
  Star,
  Tv,
  Clock,
  Library,
} from "lucide-react";
import { Poster } from "@/components/Poster";
import { useSpotlight } from "@/components/ui/premium";
import type { LibraryItem } from "@/lib/types";

/*
 * V2.2-B — blocos da Home autenticada. Só apresentam dados que
 * `/api/home` JÁ entrega (prateleiras limitadas + totais agregados).
 */

type StackItem = Pick<LibraryItem, "tmdb_id" | "media_type" | "title" | "poster_path">;

function MiniStack({ items }: { items: StackItem[] }) {
  if (items.length === 0) return null;

  return (
    <span className="home-stack" aria-hidden="true">
      {items.slice(0, 3).map((item, index) => (
        <span key={`${item.media_type}-${item.tmdb_id}`} className="home-stack-poster" style={{ zIndex: 3 - index }}>
          <Poster path={item.poster_path} alt="" sizes="30px" tmdbSize="w185" />
        </span>
      ))}
    </span>
  );
}

function SummaryCard({
  href,
  icon,
  label,
  value,
  sub,
  stack,
  tone,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  stack: StackItem[];
  tone: "watching" | "queue" | "liked" | "rated";
}) {
  const { ref: spotRef, onPointerMove: spotMove } = useSpotlight<HTMLAnchorElement>();

  return (
    <Link
      href={href}
      ref={spotRef}
      onPointerMove={spotMove}
      className={`home-summary-card mc-spot home-tone-${tone} mc-focusable`}
    >
      <span className="home-summary-top">
        <span className="home-summary-icon">{icon}</span>
        <span className="home-summary-label">{label}</span>
      </span>
      <span className="home-summary-body">
        <strong className="home-summary-value">{value}</strong>
        <MiniStack items={stack} />
      </span>
      <span className="home-summary-sub">{sub}</span>
    </Link>
  );
}

export function SmartQueueCta() {
  const { ref: spotRef, onPointerMove: spotMove } = useSpotlight<HTMLAnchorElement>();

  return (
    <Link
      href="/for-you?queue=open"
      ref={spotRef}
      onPointerMove={spotMove}
      className="home-queue-cta mc-spot mc-focusable"
    >
      <span className="home-queue-icon">
        <Clock3 size={22} aria-hidden="true" />
      </span>
      <span className="home-queue-copy">
        <span className="home-queue-eyebrow">Sem saber o que ver?</span>
        <strong>O que assistir agora?</strong>
        <small>Diga quanto tempo você tem e receba até 3 sugestões da sua fila e dos seus serviços.</small>
      </span>
      <span className="home-queue-action">
        Sugerir agora
        <ArrowRight size={15} aria-hidden="true" />
      </span>
    </Link>
  );
}

export function SummaryStrip({
  watching,
  want,
  liked,
  best,
  totals,
  averageRating,
}: {
  watching: LibraryItem[];
  want: LibraryItem[];
  liked: LibraryItem[];
  best: LibraryItem[];
  totals: { watching: number; want: number; favorites: number; rated: number };
  averageRating: string;
}) {
  const nextEpisode = watching.find((item) => item.progress?.next);
  const next = nextEpisode?.progress?.next;

  return (
    <div className="home-summary-strip">
      <SmartQueueCta />
      <SummaryCard
        href="/library?status=watching"
        tone="watching"
        icon={<Play size={15} />}
        label="Em andamento"
        value={totals.watching}
        stack={watching}
        sub={
          nextEpisode && next
            ? `S${next.season} E${next.episode} · ${nextEpisode.title}`
            : "Sem próximo episódio pendente"
        }
      />
      <SummaryCard
        href="/library?status=want"
        tone="queue"
        icon={<Clock size={15} />}
        label="Na fila"
        value={totals.want}
        stack={want}
        sub={want[0] ? `Mais recente: ${want[0].title}` : "Sua fila está vazia"}
      />
      <SummaryCard
        href="/library?favorite=true"
        tone="liked"
        icon={<Heart size={15} />}
        label="Curtidos"
        value={totals.favorites}
        stack={liked}
        sub={liked[0] ? `Último: ${liked[0].title}` : "Curta títulos para vê-los aqui"}
      />
      <SummaryCard
        href="/ranking"
        tone="rated"
        icon={<Star size={15} />}
        label="Avaliados"
        value={totals.rated}
        stack={best}
        sub={averageRating === "—" ? "Avalie para ver sua média" : `Nota média ★ ${averageRating}`}
      />
    </div>
  );
}

/*
 * Usuário sem biblioteca: a Home não vira deserto. Quatro caminhos reais,
 * nenhum conteúdo inventado.
 */
export function HomeEmpty() {
  const items: { href: string; icon: ReactNode; title: string; text: string }[] = [
    { href: "/discover", icon: <Compass size={20} />, title: "Comece sua biblioteca", text: "Descubra filmes e séries e adicione os primeiros." },
    { href: "/settings?tab=general", icon: <Tv size={20} />, title: "Escolha seus streamings", text: "Marque onde você assiste para filtrar o que está disponível." },
    { href: "/for-you", icon: <Sparkles size={20} />, title: "Veja recomendações", text: "Curtiu algo? O Para você aprende com suas notas e curtidos." },
    { href: "/calendar", icon: <Library size={20} />, title: "Acompanhe lançamentos", text: "Seu calendário mostra o que está chegando das suas séries." },
  ];

  return (
    <section className="section home-empty" aria-label="Como começar">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="home-empty-card mc-focusable">
          <span className="home-empty-icon">{item.icon}</span>
          <strong>{item.title}</strong>
          <small>{item.text}</small>
          <span className="home-empty-go">
            Abrir <ArrowRight size={13} aria-hidden="true" />
          </span>
        </Link>
      ))}
    </section>
  );
}

/*
 * Skeleton com as MESMAS alturas da composição real (hero, faixa de resumo,
 * trilho de posters) — o conteúdo chega sem empurrar a página.
 */
export function HomeSkeleton() {
  return (
    <div className="home-skeleton" role="status" aria-live="polite" aria-label="Carregando sua Home">
      <div className="mc-skeleton home-skel-hero" />
      <div className="home-skel-strip">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="mc-skeleton home-skel-card" />
        ))}
      </div>
      <div className="mc-skeleton home-skel-title" />
      <div className="home-skel-rail">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="mc-skeleton home-skel-poster" />
        ))}
      </div>
    </div>
  );
}

/*
 * Hero "O que importa agora": mesmos dados de antes (agenda > andamento >
 * fila > descobrir), com backdrop + scrim mais contrastado, glow que segue o
 * ponteiro (desktop) e uma linha de contexto (progresso/duração).
 */
export function HomeHero({
  kind,
  eyebrow,
  title,
  description,
  href,
  action,
  backdropPath,
  meta,
  progressPct,
  side,
}: {
  kind: "calendar" | "watching" | "queue" | "discover";
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  action: string;
  backdropPath: string | null;
  meta?: string | null;
  progressPct?: number | null;
  side: { loading: boolean; label: string; value: string; small: string };
}) {
  const { ref: spotRef, onPointerMove: spotMove } = useSpotlight<HTMLDivElement>();

  const icon =
    kind === "calendar" ? <Sparkles size={22} /> : kind === "watching" ? <Play size={22} /> : kind === "queue" ? <Clock size={22} /> : <Compass size={22} />;

  return (
    <div
      ref={spotRef}
      onPointerMove={spotMove}
      className={`home-focus-card mc-home-hero mc-spot ${backdropPath ? "mc-home-hero--photo" : ""} panel home-focus-${kind}`}
    >
      {backdropPath && (
        <div className="mc-home-hero-backdrop">
          <Poster path={backdropPath} alt="" sizes="(max-width:760px) 100vw, 1100px" tmdbSize="w1280" priority />
          <div className="mc-home-hero-scrim" />
        </div>
      )}

      <div className="home-focus-icon mc-home-hero-layer">{icon}</div>

      <div className="home-focus-copy mc-home-hero-layer">
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>

        {meta ? (
          <div className="home-hero-meta">
            <span>{meta}</span>
            {typeof progressPct === "number" ? (
              <span
                className="home-hero-bar"
                role="progressbar"
                aria-label="Progresso da série"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
              >
                <span style={{ width: `${progressPct}%` }} />
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="home-focus-actions">
          <Link href={href} className="btn primary">
            {kind === "watching" ? <Play size={15} /> : <ArrowRight size={15} />}
            {action}
          </Link>
          {kind !== "discover" && (
            <Link href="/discover" className="btn">
              <Compass size={15} />
              Quero outra coisa
            </Link>
          )}
        </div>
      </div>

      <div className="home-focus-side mc-home-hero-layer">
        {side.loading ? (
          <span className="home-side-loading">…</span>
        ) : (
          <>
            <span>{side.label}</span>
            <strong>{side.value}</strong>
            <small>{side.small}</small>
          </>
        )}
      </div>
    </div>
  );
}
