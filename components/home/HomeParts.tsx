"use client";


import "@/styles/features/home-smart.css";
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
  Search,
} from "lucide-react";
import { Poster } from "@/components/Poster";
import { useSpotlight } from "@/components/ui/premium";
import type { LibraryItem } from "@/lib/types";
import type { HeroBar, SummaryKey } from "@/lib/home/home";

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
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </Link>
  );
}

export function SummaryStrip({
  cards,
  watching,
  want,
  liked,
  best,
  totals,
  watchingLine,
}: {
  cards: SummaryKey[];
  watching: LibraryItem[];
  want: LibraryItem[];
  liked: LibraryItem[];
  best: LibraryItem[];
  totals: { watching: number; want: number; favorites: number; rated: number };
  /** O que o destaque NÃO mostra (lib/home/home.ts → watchingSummaryLine). */
  watchingLine: string;
}) {
  const top = best[0];

  return (
    <div className="home-summary-strip" data-count={cards.length}>
      <SmartQueueCta />
      {cards.includes("watching") && (
        <SummaryCard
          href="/library?status=watching"
          tone="watching"
          icon={<Play size={16} />}
          label="Em andamento"
          value={totals.watching}
          stack={watching}
          sub={watchingLine}
        />
      )}
      {cards.includes("want") && (
        <SummaryCard
          href="/library?status=want"
          tone="queue"
          icon={<Clock size={16} />}
          label="Na fila"
          value={totals.want}
          stack={want}
          sub={want[0] ? `Adicionado por último: ${want[0].title}` : "Quero assistir"}
        />
      )}
      {cards.includes("favorites") && (
        <SummaryCard
          href="/library?favorite=true"
          tone="liked"
          icon={<Heart size={16} />}
          label="Curtidos"
          value={totals.favorites}
          stack={liked}
          sub={liked[0] ? `Último: ${liked[0].title}` : "Seus curtidos"}
        />
      )}
      {cards.includes("rated") && (
        <SummaryCard
          href="/ranking"
          tone="rated"
          icon={<Star size={16} />}
          label="Avaliados"
          value={totals.rated}
          stack={best}
          sub={top && top.personal_rating !== null ? `Maior nota: ${top.title} · ★ ${Number(top.personal_rating).toFixed(1)}` : "Suas notas"}
        />
      )}
    </div>
  );
}

/*
 * Biblioteca vazia: direção simples, sem onboarding gigante. O destaque acima
 * já leva ao Descobrir; aqui ficam só os outros dois caminhos reais.
 */
export function HomeEmpty() {
  const items: { href: string; icon: ReactNode; title: string; text: string }[] = [
    { href: "/search", icon: <Search size={20} />, title: "Já assistiu algo?", text: "Pesquise pelo nome e marque o que você já viu." },
    { href: "/settings?tab=general", icon: <Tv size={20} />, title: "Escolha seus streamings", text: "Marque onde você assiste para filtrar o que está disponível." },
  ];

  return (
    <section className="section home-empty home-empty--compact" aria-label="Como começar">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="home-empty-card mc-focusable">
          <span className="home-empty-icon">{item.icon}</span>
          <strong>{item.title}</strong>
          <small>{item.text}</small>
          <span className="home-empty-go">
            Abrir <ArrowRight size={14} aria-hidden="true" />
          </span>
        </Link>
      ))}
    </section>
  );
}

/*
 * Skeleton com as MESMAS alturas da composição real (hero, trilho de
 * "Continuar assistindo", faixa de resumo) — o conteúdo chega sem empurrar a página.
 */
export function HomeSkeleton() {
  return (
    <div className="home-skeleton" role="status" aria-live="polite" aria-label="Carregando sua Home">
      <div className="mc-skeleton home-skel-hero" />
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
 * Hero "O que importa agora" (V3.0: ativo com ação > agenda urgente > ativo >
 * fila > descobrir — lib/home/home.ts). Backdrop + scrim, glow que segue o
 * ponteiro (desktop) e uma linha de contexto. Quando há barra, a linha de
 * contexto é exatamente o que a barra mede (mesma unidade).
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
  bar,
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
  bar?: HeroBar | null;
  side: { loading: boolean; label: string; value: string; small: string } | null;
}) {
  const { ref: spotRef, onPointerMove: spotMove } = useSpotlight<HTMLDivElement>();

  const icon =
    kind === "calendar" ? <Sparkles size={22} /> : kind === "watching" ? <Play size={22} /> : kind === "queue" ? <Clock size={22} /> : <Compass size={22} />;

  return (
    <div
      ref={spotRef}
      onPointerMove={spotMove}
      className={`home-focus-card mc-home-hero mc-spot ${backdropPath ? "mc-home-hero--photo" : ""}${side ? "" : " home-focus-card--no-side"} panel home-focus-${kind}`}
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
            {bar ? (
              <span
                className="home-hero-bar"
                role="progressbar"
                aria-label="Episódios exibidos assistidos"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={bar.percent}
                aria-valuetext={bar.label}
              >
                <span style={{ width: `${bar.percent}%` }} />
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="home-focus-actions">
          <Link href={href} className="btn primary">
            {kind === "watching" ? <Play size={16} /> : <ArrowRight size={16} />}
            {action}
          </Link>
          {kind !== "discover" && (
            <Link href="/discover" className="btn">
              <Compass size={16} />
              Quero outra coisa
            </Link>
          )}
        </div>
      </div>

      {side ? (
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
      ) : null}
    </div>
  );
}
