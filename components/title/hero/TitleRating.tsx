"use client";

import { useRef, type KeyboardEvent } from "react";

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Fase 4 — "Sua nota" ao lado do título: o número grande e uma escala de 1 a
 * 10 (radiogroup: Tab entra no valor atual, setas mudam). Tocar no número
 * escolhido de novo tira a nota. Notas antigas com decimal (8,5) aparecem
 * como estão; a escala preenche até a parte inteira.
 */
export function TitleRating({
  value,
  onChange,
  headingId,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  headingId: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const filled = value === null ? 0 : Math.floor(value);
  // Item que recebe o Tab: o escolhido, ou o primeiro.
  const tabStop = filled >= 1 ? filled : 1;

  function focusItem(n: number) {
    groupRef.current?.querySelector<HTMLElement>(`[data-value="${n}"]`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = Number((document.activeElement as HTMLElement)?.dataset.value || tabStop);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(10, current + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(1, current - 1);
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = 10;
    if (next === null) return;
    event.preventDefault();
    focusItem(next);
    onChange(next);
  }

  const display = value === null ? "—" : Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <div className="tt-rating">
      <p className="tt-rating-value" aria-live="polite">
        {display}
        <span className="tt-visually-hidden">{value === null ? " — sem nota" : " de 10"}</span>
      </p>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={headingId}
        className="tt-rating-scale"
        onKeyDown={onKeyDown}
      >
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            data-value={n}
            aria-checked={filled === n}
            aria-label={`Nota ${n}`}
            tabIndex={n === tabStop ? 0 : -1}
            className="tt-rating-step"
            data-filled={n <= filled ? "true" : undefined}
            onClick={() => onChange(filled === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="tt-rating-hint">
        {value === null ? "Escolha de 1 a 10." : "Toque no mesmo número para tirar a nota."}
      </p>
    </div>
  );
}
