import { loadDiaryMonth } from "./load";
import { buildDays } from "./moments";
import type { DiaryDay, DiaryMoment } from "./types";

/*
 * Diário — os N momentos mais recentes (prévia da Home, V3.0).
 *
 * Mesma verdade do Diário: as mesmas fontes (`loadDiaryMonth`) e a mesma
 * narrativa (`buildDays` → DiaryMoment). Nada de copy própria nem de leitura
 * direta de activity_events. Títulos removidos da Biblioteca continuam com
 * nome (o Diário junta `media` pelo evento, não pela Biblioteca).
 *
 * Os momentos vêm na ordem em que o Diário os mostra (dia mais recente
 * primeiro; dentro do dia, mais recente primeiro). Grupos recolhidos
 * (organização em massa, registros sem título) ficam no Diário.
 */

export const HOME_RECENT_LIMIT = 3;

/** Pura: dias do Diário → os `limit` primeiros momentos visíveis, sem repetição. */
export function recentMoments(days: DiaryDay[], limit = HOME_RECENT_LIMIT): DiaryMoment[] {
  const seen = new Set<string>();
  const out: DiaryMoment[] = [];

  for (const day of days) {
    for (const moment of day.moments) {
      if (out.length >= limit) return out;
      if (seen.has(moment.id)) continue;

      seen.add(moment.id);
      out.push(moment);
    }
  }

  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;

/** Teto de meses COM atividade lidos para a prévia (cada mês = 4 consultas). */
export const HOME_RECENT_MAX_MONTHS = 4;

/**
 * Do mês mais recente COM atividade (não o mês corrente: em 1º de novembro sem
 * nada em novembro, começa em outubro) para trás, mês a mês, só pelos meses
 * que têm atividade, até juntar `limit` momentos ou ler `maxMonths` meses.
 * Fronteira de mês = dia civil de Brasília (a mesma do Diário).
 */
export async function loadRecentMoments(sql: Sql, userId: string, today: string, limit = HOME_RECENT_LIMIT, maxMonths = HOME_RECENT_MAX_MONTHS) {
  const first = await loadDiaryMonth(sql, userId, null, today);
  const moments = recentMoments(buildDays(first.items), limit);
  const older = first.months.filter((m) => m < first.month).slice(0, Math.max(0, maxMonths - 1));

  for (const month of older) {
    if (moments.length >= limit) break;

    const page = await loadDiaryMonth(sql, userId, month, today);

    moments.push(...recentMoments(buildDays(page.items), limit - moments.length));
  }

  return moments;
}
