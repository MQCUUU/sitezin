/** Agenda em páginas de 7 dias (só no cliente; a API continua buscando 60 dias por vez). */
export const AGENDA_PAGE_DAYS = 7;

export type AgendaFilter = "all" | "mine" | "movie" | "tv";

const FILTER_VALUES: readonly string[] = ["all", "mine", "movie", "tv"];

/** Soma dias a "AAAA-MM-DD" (UTC, sem fuso). Cópia local de addDays em dates.ts (import de valor com .ts quebra o typecheck). */
function plusDays(day: string, amount: number) {
  const d = new Date(`${day}T00:00:00Z`);

  d.setUTCDate(d.getUTCDate() + amount);

  return d.toISOString().slice(0, 10);
}

/** Último dia visível quando a agenda mostra `days` dias a partir de hoje. */
export function visibleUntil(today: string, days: number): string {
  return plusDays(today, days - 1);
}

export function sliceAgenda<T extends { date: string }>(events: T[], today: string, days: number): T[] {
  const until = visibleUntil(today, days);

  return events.filter((event) => event.date <= until);
}

/** Filtro da URL, se válido; senão "Para mim" quando há algo seu na janela, senão "Todos". */
export function defaultFilter(raw: string | null, events: { relationship?: unknown }[]): AgendaFilter {
  if (raw && FILTER_VALUES.includes(raw)) return raw as AgendaFilter;

  return events.some((event) => Boolean(event.relationship)) ? "mine" : "all";
}

/** Com algo seu na janela, "Para mim" vira a primeira aba. */
export function orderFilters<T extends readonly [string, ...unknown[]]>(filters: T[], hasMine: boolean): T[] {
  if (!hasMine) return filters;

  return [...filters.filter((f) => f[0] === "mine"), ...filters.filter((f) => f[0] !== "mine")];
}
