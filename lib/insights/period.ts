import type { DayRange, InsightsParams, PeriodKey, TypeFilter } from "./types";

/*
 * Resolução de período em DIAS (YYYY-MM-DD, fuso de Brasília). Os dois
 * limites são inclusivos. `{from:null,to:null}` = tudo (inclui registros
 * sem data). Função pura — o servidor passa `today`.
 */

export const INSIGHTS_TZ = "America/Sao_Paulo";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parse(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);

  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, amount: number): string {
  const date = parse(day);

  date.setUTCDate(date.getUTCDate() + amount);

  return format(date);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

function monthRange(year: number, month: number): DayRange {
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 0));

  return { from: format(from), to: format(to) };
}

function yearRange(year: number): DayRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function isDay(value: unknown): value is string {
  // Ida e volta exata: rejeita datas que o JS "conserta" (ex.: 2027-02-29 → 03-01).
  return typeof value === "string" && DAY.test(value) && !Number.isNaN(parse(value).getTime()) && format(parse(value)) === value;
}

export function normalizeParams(raw: {
  period?: string | null;
  type?: string | null;
  from?: string | null;
  to?: string | null;
  compare?: string | null;
}): InsightsParams {
  const type: TypeFilter = raw.type === "movie" || raw.type === "tv" ? raw.type : "all";
  let period: PeriodKey = "all";
  const value = raw.period || "all";

  if (value === "year" || value === "12m" || value === "last_year" || value === "month" || value === "30d" || value === "all") {
    period = value;
  } else if (/^\d{4}$/.test(value)) {
    const year = Number(value);

    if (year >= 1900 && year <= 2100) period = value as PeriodKey;
  } else if (value === "custom" && isDay(raw.from) && isDay(raw.to)) {
    period = "custom";
  }

  const [from, to] =
    period === "custom" && isDay(raw.from) && isDay(raw.to)
      ? raw.from <= raw.to
        ? [raw.from, raw.to]
        : [raw.to, raw.from]
      : [null, null];

  return { period, type, from, to, compare: raw.compare !== "0" };
}

export function resolveRanges(
  params: Pick<InsightsParams, "period" | "from" | "to">,
  today: string
): { range: DayRange; prev: DayRange | null } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;

  switch (params.period) {
    case "all":
      return { range: { from: null, to: null }, prev: null };
    case "year": {
      // Ano até hoje × MESMO trecho do ano anterior (comparação justa).
      const sameDay = `${year - 1}${today.slice(4)}`;

      return {
        range: { from: `${year}-01-01`, to: today },
        prev: { from: `${year - 1}-01-01`, to: isDay(sameDay) ? sameDay : `${year - 1}-02-28` },
      };
    }
    case "12m": {
      const from = addDays(today, -364);

      return { range: { from, to: today }, prev: { from: addDays(from, -365), to: addDays(from, -1) } };
    }
    case "last_year":
      return { range: yearRange(year - 1), prev: yearRange(year - 2) };
    case "month": {
      const prevMonth = month === 0 ? monthRange(year - 1, 11) : monthRange(year, month - 1);

      return { range: monthRange(year, month), prev: prevMonth };
    }
    case "30d": {
      const from = addDays(today, -29);

      return {
        range: { from, to: today },
        prev: { from: addDays(from, -30), to: addDays(from, -1) },
      };
    }
    case "custom": {
      const from = params.from as string;
      const to = params.to as string;
      const length = daysBetween(from, to) + 1;

      return {
        range: { from, to },
        prev: { from: addDays(from, -length), to: addDays(from, -1) },
      };
    }
    default: {
      const y = Number(params.period);

      return { range: yearRange(y), prev: yearRange(y - 1) };
    }
  }
}

export function inRange(day: string | null, range: DayRange): boolean {
  if (range.from === null || range.to === null) return true;

  return day !== null && day >= range.from && day <= range.to;
}

export function rangeLabel(period: PeriodKey, range: DayRange): string {
  switch (period) {
    case "all":
      return "em todo o seu histórico";
    case "year":
      return "neste ano";
    case "12m":
      return "nos últimos 12 meses";
    case "last_year":
      return "no ano passado";
    case "month":
      return "neste mês";
    case "30d":
      return "nos últimos 30 dias";
    case "custom":
      return "no período escolhido";
    default:
      return `em ${range.from?.slice(0, 4)}`;
  }
}
