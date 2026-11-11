/*
 * Fase 7 — Insights clean: frase e blocos da página, como funções puras.
 * Sem imports de valor (import com extensão .ts entre libs quebra o tsc).
 */

const n = (value: number) => value.toLocaleString("pt-BR");
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "7,8" — uma casa, vírgula. */
export function decimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/** "em 2026", "nos últimos 12 meses", "no total", "no período". */
export function periodWhen(period: string, today: string): string {
  if (period === "year") return `em ${today.slice(0, 4)}`;
  if (/^\d{4}$/.test(period)) return `em ${period}`;
  if (period === "12m") return "nos últimos 12 meses";
  if (period === "all") return "no total";

  return "no período";
}

/** "312 horas em 2026"; menos de 1 hora vira minutos. */
export function summaryHeadline(cur: { minutes: number; hours: number }, period: string, today: string): string {
  const amount =
    cur.minutes < 60
      ? `${n(Math.round(cur.minutes))} ${Math.round(cur.minutes) === 1 ? "minuto" : "minutos"}`
      : `${n(cur.hours)} ${cur.hours === 1 ? "hora" : "horas"}`;

  return `${amount} ${periodWhen(period, today)}`;
}

/** "48 filmes e 210 episódios de 12 séries"; parte zerada sai. */
export function summaryFicha(cur: { movies: number; episodes: number; series: number }): string {
  const parts: string[] = [];

  if (cur.movies > 0) parts.push(`${n(cur.movies)} ${cur.movies === 1 ? "filme" : "filmes"}`);

  if (cur.episodes > 0) {
    const series = cur.series > 0 ? ` de ${n(cur.series)} ${cur.series === 1 ? "série" : "séries"}` : "";

    parts.push(`${n(cur.episodes)} ${cur.episodes === 1 ? "episódio" : "episódios"}${series}`);
  }

  return parts.join(" e ");
}

/** "18% a mais que em 2025"; null quando não há comparação confiável ou a variação é pequena. */
export function periodChange(cur: { minutes: number }, prev: { minutes: number } | null, period: string, today: string): string | null {
  if (!prev || prev.minutes < 60) return null;

  const change = (cur.minutes - prev.minutes) / prev.minutes;

  if (Math.abs(change) < 0.05) return null;

  let than: string | null = null;

  if (period === "year") than = `que em ${Number(today.slice(0, 4)) - 1}`;
  else if (/^\d{4}$/.test(period)) than = `que em ${Number(period) - 1}`;
  else if (period === "12m") than = "que nos 12 meses anteriores";

  if (!than) return null;

  return `${Math.round(Math.abs(change) * 100)}% a ${change > 0 ? "mais" : "menos"} ${than}`;
}

export type MonthBar = { key: string; label: string; hours: number; ratio: number; current: boolean };

/** Últimos 12 meses para as colunas do Ritmo. */
export function monthBars(monthly: { month: string; minutes: number }[], today: string): MonthBar[] {
  const last = monthly.slice(-12);
  const max = Math.max(0, ...last.map((m) => m.minutes));

  return last.map((m) => ({
    key: m.month,
    label: MONTHS_SHORT[Number(m.month.slice(5, 7)) - 1] ?? m.month,
    hours: Math.round(m.minutes / 60),
    ratio: max > 0 ? m.minutes / max : 0,
    current: m.month === today.slice(0, 7),
  }));
}

export type GenreRow = { name: string; count: number; ratio: number; avg: string | null };

/** Linhas da lista de gêneros; a sua média só com 3+ avaliados. */
export function genreRows(genres: { name: string; count: number; rated: number; avg: number | null }[], max = 6): GenreRow[] {
  const top = genres.slice(0, max);
  const peak = Math.max(0, ...top.map((g) => g.count));

  return top.map((g) => ({
    name: g.name,
    count: g.count,
    ratio: peak > 0 ? g.count / peak : 0,
    avg: g.avg !== null && g.rated >= 3 ? decimal(g.avg) : null,
  }));
}

/** Uma frase comparando a sua nota com a do TMDB. */
export function communityLine(community: { bias: number } | null): string | null {
  if (!community) return null;
  if (Math.abs(community.bias) < 0.15) return "Suas notas ficam na média do TMDB.";

  const gap = Math.abs(community.bias);
  const unit = Math.round(gap * 10) / 10 >= 2 ? "pontos" : "ponto";

  return `Você dá em média ${decimal(gap)} ${unit} a ${community.bias > 0 ? "mais" : "menos"} que o TMDB.`;
}
