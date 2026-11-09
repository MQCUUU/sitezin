import "@/styles/features/home-screen.css";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Fase 4 — seções do Início: título (h2) e um link de texto à direita.
 * Sem rótulo em caixa alta, sem descrição de apoio, sem seta: a hierarquia
 * vem do tamanho do título e do espaço.
 */
export function HomeSection({
  id,
  title,
  href,
  linkLabel,
  className,
  children,
}: {
  id: string;
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`hm-section${className ? ` ${className}` : ""}`} aria-labelledby={id}>
      <div className="hm-section-head">
        <h2 id={id} className="hm-section-title">{title}</h2>
        {href && linkLabel ? (
          <Link href={href} className="hm-section-link">
            {linkLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export type HomeRow = {
  key: string;
  href: string;
  when: string;
  title: string;
  /** Continuação da frase depois do título (", episódio novo"). */
  what?: string;
  ariaLabel?: string;
};

/** Linhas de texto separadas por uma linha fina: quando · o quê. */
export function HomeRows({ rows, loading, loadingLabel }: { rows: HomeRow[]; loading?: boolean; loadingLabel?: string }) {
  if (loading) {
    return (
      <div className="hm-rows" role="status" aria-label={loadingLabel}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="hm-row hm-row--skeleton">
            <span className="mc-skeleton" />
            <span className="mc-skeleton" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul className="hm-rows">
      {rows.map((row) => (
        <li key={row.key}>
          <Link href={row.href} className="hm-row" aria-label={row.ariaLabel}>
            <span className="hm-row-when">{row.when}</span>
            <span className="hm-row-what">
              <strong>{row.title}</strong>
              {row.what ? <span>{row.what}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
