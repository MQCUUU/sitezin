"use client";

import { useRef, type KeyboardEvent } from "react";

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const TENTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Fase 4 — "Sua nota" ao lado do título: o número grande e uma escala de 1 a
 * 10 (radiogroup: Tab entra no valor atual, setas mudam). Tocar no número
 * escolhido de novo tira a nota. Com um inteiro escolhido (1 a 9), a linha de
 * décimos logo abaixo completa a nota: 8 e depois ,5 dá 8,5.
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
  const tenth = value === null ? 0 : Math.round((value - filled) * 10);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
      {filled >= 1 && filled <= 9 ? (
        <div role="radiogroup" aria-label="Décimos da nota" className="tt-rating-tenths">
          {TENTHS.map((d) => {
            const next = Math.round((filled + d / 10) * 10) / 10;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={tenth === d}
                aria-label={`Nota ${fmt(next)}`}
                className="tt-rating-tenth"
                data-active={tenth === d ? "true" : undefined}
                onClick={() => onChange(next)}
              >
                ,{d}
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="tt-rating-hint">
        {value === null ? "Escolha de 1 a 10." : "Ajuste o décimo logo acima. Toque no mesmo número para tirar a nota."}
      </p>
    </div>
  );
}
