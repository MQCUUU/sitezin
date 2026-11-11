"use client";

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
