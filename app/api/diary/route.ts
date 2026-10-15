import { NextRequest, NextResponse } from "next/server";

import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { CALENDAR_TZ, todayIn } from "@/lib/calendar/dates";
import { loadDiaryMonth } from "@/lib/diary/load";
import { buildDays, filterDays } from "@/lib/diary/moments";
import type { DiaryFilter, DiaryResponse } from "@/lib/diary/types";

/*
 * GET /api/diary?month=AAAA-MM&filter=all|watched|rewatch|rated
 *
 * Um mês por resposta (lib/diary/load.ts) → momentos (lib/diary/moments.ts).
 * Sem `month`, abre o mês mais recente com atividade. Filtro no servidor.
 * `prev` = mês anterior com atividade (cursor de "Carregar mais").
 */

const FILTERS: DiaryFilter[] = ["all", "watched", "rewatch", "rated"];

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const url = new URL(request.url);
    const rawFilter = url.searchParams.get("filter") as DiaryFilter;
    const filter: DiaryFilter = FILTERS.includes(rawFilter) ? rawFilter : "all";
    const today = todayIn(CALENDAR_TZ);
    const { month, months, items, truncated } = await loadDiaryMonth(getDb(), userId, url.searchParams.get("month"), today);

    const body: DiaryResponse = {
      month,
      today,
      filter,
      days: filterDays(buildDays(items), filter),
      prev: months.find((m) => m < month) ?? null,
      months,
      truncated,
    };

    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respostaDeErro(error, "GET /api/diary");
  }
}
