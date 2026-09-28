/**
 * Chave `YYYY-MM-DD` do dia civil local (getFullYear/getMonth/getDate),
 * não a data em UTC. `Date.toISOString().slice(0, 10)` desloca o dia em
 * até algumas horas para fusos diferentes de UTC (ex.: America/Sao_Paulo,
 * UTC-3) — um `air_date` do TMDB é uma data de calendário (`YYYY-MM-DD`),
 * não um instante UTC, e por isso deve ser comparada contra "hoje" no
 * mesmo sistema de referência (dia civil local), nunca contra a data UTC.
 *
 * Em componente cliente, "local" é o fuso real do navegador de quem
 * visita — correto para a maioria dos usuários deste produto (PT-BR).
 */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Igual a `localDateKey`, mas ancorada num fuso horário explícito via
 * `Intl`, independente do fuso do processo que executa o código. Server
 * (Node/Vercel) roda em UTC por padrão — `new Date().getFullYear()` no
 * servidor não corrige o viés de fuso para usuários no Brasil, então
 * qualquer comparação de "hoje" feita no server (ex.: validação de
 * episódio lançado, cronograma cacheado por CDN) precisa ancorar
 * explicitamente no fuso do público-alvo do produto (`America/Sao_Paulo`,
 * PT-BR — `app/manifest.ts` e `TMDB_LANGUAGE` padrão confirmam isso).
 */
export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
