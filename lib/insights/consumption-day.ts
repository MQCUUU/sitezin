import { dateKeyInTimeZone } from "@/lib/date-only";

/*
 * Hotfix Insights — em que DIA um título da Biblioteca foi assistido.
 *
 * Antes, o Insights usava só `library_items.watched_at`. Esse campo só é gravado ao
 * registrar uma visualização pelo histórico (ou por importação). Marcar "Assistido"
 * pelo status (cards, página do título, adicionar já como Assistido) não grava
 * data: o título entrava em "Todo o período", mas sumia de ano, mês, retrospectiva
 * e gráficos.
 *
 * Mas a ação do usuário já tem data real no banco: o evento da transição de status
 * (`activity_events`: `status_changed` com `to`, ou `library_added` com o `status`
 * inicial), gravado no mesmo comando que muda o status (lib/library/status-event.ts).
 * É a mesma fonte que o Diário usa para "Assistiu". Nenhum campo novo; `updated_at`
 * nunca (qualquer edição de nota/resenha o mudaria).
 *
 * Ordem:
 *   1. data explícita de visualização (`watched_at`), quando existe — vale para
 *      qualquer status, como antes;
 *   2. sem ela, e só se o título está Assistido/Reassistido: a transição MAIS
 *      RECENTE para "Assistido" (o estado atual começou ali; ida e volta de status
 *      fica com a última); se nunca passou por "Assistido" (foi direto para
 *      Reassistido), a transição mais recente para "Reassistido";
 *   3. nada disso: `null` (legado sem data — não se inventa data; o título só conta
 *      em "Todo o período", como já acontecia).
 * O dia é calculado no fuso do produto (INSIGHTS_TZ, Brasília).
 */

const WATCHED_STATUSES = new Set(["watched", "rewatched"]);

export type ConsumptionDayInput = {
  status: string;
  /** library_items.watched_at (data explícita de visualização). */
  watchedAt: string | Date | null | undefined;
  /** Momento da transição mais recente para "watched" (evento de status/adição). */
  watchedEventAt: string | Date | null | undefined;
  /** Momento da transição mais recente para "rewatched". */
  rewatchedEventAt: string | Date | null | undefined;
};

function toDayKey(value: string | Date | null | undefined, timeZone: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : dateKeyInTimeZone(date, timeZone);
}

export function consumptionDay(input: ConsumptionDayInput, timeZone: string): string | null {
  const explicit = toDayKey(input.watchedAt, timeZone);

  if (explicit) return explicit;
  if (!WATCHED_STATUSES.has(input.status)) return null;

  return toDayKey(input.watchedEventAt, timeZone) ?? toDayKey(input.rewatchedEventAt, timeZone);
}
