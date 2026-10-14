"use client";

import { useEffect, useRef, useState } from "react";

/* Formatação e animação compartilhadas pelas telas de Insights. */

export const nf = new Intl.NumberFormat("pt-BR");
export const dec = (value: number, digits = 1) => value.toFixed(digits).replace(".", ",");
export const pct = (value: number) => `${Math.round(value * 100)}%`;

/** "45 min", "12 h", "3 dias e 4 h" — sempre legível, nunca "1.234 minutos". */
export function durationLabel(minutes: number) {
  return minutes < 60 ? `${Math.round(minutes)} min` : hoursText(Math.round(minutes / 60));
}

/** Rótulo a partir de HORAS INTEIRAS (somas exibidas sempre fecham). */
export function hoursText(hours: number) {
  if (hours < 48) return `${nf.format(hours)} h`;

  const days = Math.floor(hours / 24);
  const rest = hours % 24;

  return rest ? `${days} dias e ${rest} h` : `${days} dias`;
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthShort(key: string) {
  return MONTHS_SHORT[Number(key.slice(5, 7)) - 1] ?? key;
}

/** Número que "sobe" até o valor; desligado com prefers-reduced-motion. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(value);
  const frame = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || value === 0) {
      setShown(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 800);

      setShown(value * (1 - Math.pow(1 - progress, 3)));

      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame.current);
  }, [value]);

  return <>{decimals ? dec(shown, decimals) : nf.format(Math.round(shown))}</>;
}
