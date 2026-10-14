/*
 * Calendário — datas SEM fuso. Toda data de lançamento do TMDB é "só data"
 * (`AAAA-MM-DD`, sem horário): nunca vira `Date` local para comparar nem
 * ganha horário inventado. Comparações são de strings `AAAA-MM-DD`; o "hoje"
 * é o dia civil em America/Sao_Paulo (servidor) ou o fuso do navegador
 * (cliente), nunca o UTC do servidor.
 */

export const CALENDAR_TZ = "America/Sao_Paulo";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function parse(day: string) {
  const [y, m, d] = day.split("-").map(Number);

  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Valida `AAAA-MM-DD` com ida e volta (rejeita 2027-02-29). */
export function isDay(value: unknown): value is string {
  return typeof value === "string" && DAY.test(value) && format(parse(value)) === value;
}

export function addDays(day: string, amount: number) {
  const d = parse(day);

  d.setUTCDate(d.getUTCDate() + amount);

  return format(d);
}

export function daysBetween(a: string, b: string) {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

export function weekday(day: string) {
  return parse(day).getUTCDay();
}

/** "Hoje" no fuso informado (padrão: Brasília). */
export function todayIn(timeZone = CALENDAR_TZ, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Domingo da semana do dia. */
export function startOfWeek(day: string) {
  return addDays(day, -weekday(day));
}

export function monthKey(day: string) {
  return day.slice(0, 7);
}

export function firstOfMonth(day: string) {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(day: string, amount: number) {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + amount, 1));

  return format(d);
}

export function lastOfMonth(day: string) {
  return addDays(addMonths(firstOfMonth(day), 1), -1);
}

/** Grade do mês: de domingo antes do dia 1 até sábado depois do último dia. */
export function monthGrid(day: string) {
  const from = startOfWeek(firstOfMonth(day));
  const last = lastOfMonth(day);
  const to = addDays(startOfWeek(last), 6);

  return { from, to };
}

export function monthLabel(day: string) {
  const [y, m] = day.split("-").map(Number);

  return `${MONTHS[m - 1]} de ${y}`;
}

export function shortDate(day: string) {
  const [, m, d] = day.split("-").map(Number);

  return { day: String(d).padStart(2, "0"), month: MONTHS_SHORT[m - 1] };
}

/** "quarta-feira, 14 de outubro" (+ ano quando não é o ano corrente). */
export function longDate(day: string, today: string) {
  const [y, m, d] = day.split("-").map(Number);
  const year = y !== Number(today.slice(0, 4)) ? ` de ${y}` : "";

  return `${WEEKDAYS[weekday(day)]}, ${d} de ${MONTHS[m - 1]}${year}`;
}

/** Rótulo do dia para a Agenda: Hoje, Amanhã, nome do dia na semana, ou data. */
export function dayHeading(day: string, today: string) {
  const diff = daysBetween(today, day);

  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";

  return capitalize(longDate(day, today));
}

/** Tempo relativo curto para o hero: Hoje, Amanhã, Em 3 dias, Sexta-feira, 16 out. */
export function relativeWhen(day: string, today: string) {
  const diff = daysBetween(today, day);

  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff > 1 && diff < 7) return capitalize(WEEKDAYS[weekday(day)]);
  if (diff >= 7 && diff < 14) return `Em ${diff} dias`;

  const { day: d, month } = shortDate(day);
  const year = day.slice(0, 4) !== today.slice(0, 4) ? ` de ${day.slice(0, 4)}` : "";

  return `${Number(d)} de ${month}${year}`;
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
