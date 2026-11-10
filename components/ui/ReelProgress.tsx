import "@/styles/features/reel.css";

import { cx } from "@/components/ui/cx";

export type ReelProgressProps = {
  /** Quantos já foram vistos (episódios, filmes da coleção…). */
  watched: number;
  /** Total que conta para o progresso. */
  total: number;
  /** Nome acessível ("Progresso da série"). */
  label: string;
  /** Texto lido pelo leitor de tela ("12 de 62 episódios"). */
  valueText?: string;
  /** Acima disto, cada marca representa um grupo (a barra não vira pó). Padrão 40. */
  maxMarks?: number;
  className?: string;
};

/**
 * Projeção (Fase 2) — Rolo: progresso desenhado como marcas, uma por item
 * (episódio, filme). Visto em Tela (claro), o próximo em âmbar, o resto em fio.
 * Mostra quantidade e posição, não só uma porcentagem. Acima de `maxMarks`,
 * cada marca vale um grupo igual de itens (arredondado para baixo no "visto").
 */
export function ReelProgress({ watched, total, label, valueText, maxMarks = 40, className }: ReelProgressProps) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeWatched = Math.min(Math.max(0, Math.floor(watched)), safeTotal);
  const marks = Math.min(safeTotal, Math.max(1, maxMarks));
  const per = marks ? safeTotal / marks : 1;
  const percent = safeTotal ? Math.round((safeWatched / safeTotal) * 100) : 0;
  const doneMarks = Math.floor(safeWatched / per + 1e-9);
  const hasNext = safeWatched < safeTotal;

  if (!safeTotal) return null;

  return (
    <span
      className={cx("mc-reel", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText ?? `${safeWatched} de ${safeTotal}`}
      data-dense={marks > 24 ? "" : undefined}
    >
      {Array.from({ length: marks }, (_, index) => (
        <span
          key={index}
          className="mc-reel-mark"
          data-state={index < doneMarks ? "done" : index === doneMarks && hasNext ? "next" : "todo"}
        />
      ))}
    </span>
  );
}
