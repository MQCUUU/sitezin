import { NextResponse } from "next/server";

import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { CALENDAR_TZ, todayIn } from "@/lib/calendar/dates";
import { HOME_RECENT_LIMIT, loadRecentMoments } from "@/lib/diary/recent";
import type { DiaryMoment } from "@/lib/diary/types";

/*
 * GET /api/diary/recent — prévia do Diário na Home (V3.0).
 * Os mesmos momentos que /api/diary mostraria no topo; usuário só da sessão.
 */

export type DiaryRecentResponse = { today: string; moments: DiaryMoment[] };

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const today = todayIn(CALENDAR_TZ);
    const moments = await loadRecentMoments(getDb(), userId, today, HOME_RECENT_LIMIT);
    const body: DiaryRecentResponse = { today, moments };

    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respostaDeErro(error, "GET /api/diary/recent");
  }
}
