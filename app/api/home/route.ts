import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { loadHome, type HomeSql } from "@/lib/home/load";

/*
 * ==========================================
 * GET /api/home — V2.1-D, revisto na V3.0
 * ==========================================
 *
 * Devolve SÓ o que a Home usa:
 *  - `totals`: agregado SQL (COUNT/AVG) da Biblioteca ATUAL — payload
 *    constante, independente do tamanho da biblioteca;
 *  - 4 prateleiras com limite fixo, no mesmo formato de linha de
 *    `GET /api/library` (o client achata `...item.media`).
 *
 * V3.0:
 *  - "Em andamento" (Hero + Retomar) ordena pela última atividade de
 *    CONTINUIDADE — o maior entre:
 *      · último episódio marcado (`episodes_progress.watched_at`);
 *      · última visualização registrada (`watch_entries.watched_at`);
 *      · última entrada em Assistindo/Reassistindo (`activity_events`:
 *        `status_changed` → watching/rewatching, `rewatch_started`,
 *        `library_added` já como watching/rewatching).
 *    Sem nenhum desses fatos (legado/importado): `added_at`.
 *    NUNCA `library_items.updated_at`: ele é reescrito por nota, Curtir,
 *    review e sync automático de temporadas — nada disso é continuar.
 *    Desempate por `li.id`. Fatos lidos em lote (lib/home/load.ts): número
 *    de consultas constante, qualquer que seja a quantidade de ativos.
 *  - Progresso de série = o MESMO da Biblioteca (`attachSeriesProgress`).
 *  - Toda prateleira tem desempate determinístico.
 *
 * Agenda e Atividade vêm dos domínios do Calendário (/api/calendar/events)
 * e do Diário (/api/diary/recent) — nenhuma regra própria aqui.
 */

export async function GET() {
  const startedAt = performance.now();

  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const dbStartedAt = performance.now();
    const body = await loadHome(getDb() as unknown as HomeSql, user.id);
    const dbMs = performance.now() - dbStartedAt;
    const totalMs = performance.now() - startedAt;

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "private, no-store",
        // Só durações agregadas — nenhum SQL, id ou dado de conexão.
        "Server-Timing": `db;dur=${dbMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
      },
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/home");
  }
}
