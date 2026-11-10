import "@/styles/features/credits.css";

import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";

export type CreditItem = {
  label: string;
  value: ReactNode;
};

/**
 * Projeção (Fase 2) — Créditos: ficha técnica em duas colunas alinhadas a um
 * eixo, como os créditos finais (função à direita, apagada; nome à esquerda).
 * Substitui os cartões de "fato" (ícone + rótulo + valor). No celular empilha.
 */
export function Credits({ items, className, label }: { items: CreditItem[]; className?: string; label?: string }) {
  const visible = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");

  if (visible.length === 0) return null;

  return (
    <dl className={cx("mc-credits", className)} aria-label={label}>
      {visible.map((item) => (
        <div key={item.label} className="mc-credits-row">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
