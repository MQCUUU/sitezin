import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const userId = user.id;
    const url = new URL(request.url);
    const year = url.searchParams.get("year");
    const requestedLimit = Number(url.searchParams.get("limit") || 300);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 1000)
      : 300;

    const sql = getDb();

    /*
     * V2.1-A — RETRO-03/CASO 8 (docs/V2.1-A-DATA-INTEGRITY.md):
     * `season_completed`/`series_completed` têm linhas duplicadas reais
     * no banco (mesmo usuário+mídia+event_type+occurred_at, sem produtor
     * de código ativo hoje). `DISTINCT ON` protege a leitura por
     * identidade lógica do evento direto na fonte — todo consumidor
     * desta rota (Diário, Retrospectiva, e qualquer futuro) fica imune,
     * sem apagar nada no banco e sem afetar eventos de rewatch legítimos
     * (que têm `occurred_at` real distinto entre si).
     *
     * (ajuste pós-gate) `season` entra na chave só para
     * `season_completed` — sem isso, duas temporadas DIFERENTES da
     * mesma série concluídas no mesmíssimo `occurred_at` colidiriam e
     * uma seria descartada indevidamente. `series_completed` não tem
     * essa sub-dimensão, mantém a identidade original.
     */
    let rows;
    if (year && /^\d{4}$/.test(year)) {
      const start = `${year}-01-01T00:00:00.000Z`;
      const end = `${Number(year) + 1}-01-01T00:00:00.000Z`;

      rows = await sql`
        SELECT id, event_type, metadata, occurred_at, media FROM (
          SELECT DISTINCT ON (
            ae.event_type,
            COALESCE(ae.media_id, li.media_id),
            ae.occurred_at,
            CASE WHEN ae.event_type = 'season_completed' THEN ae.metadata->>'season' END
          )
            ae.id,
            ae.event_type,
            ae.metadata,
            ae.occurred_at,
            to_jsonb(m.*) AS media
          FROM public.activity_events ae
          LEFT JOIN public.library_items li ON li.id = ae.library_item_id
          LEFT JOIN public.media m ON m.id = COALESCE(ae.media_id, li.media_id)
          WHERE ae.user_id = ${userId}
            AND ae.occurred_at >= ${start}::timestamptz
            AND ae.occurred_at < ${end}::timestamptz
          ORDER BY
            ae.event_type,
            COALESCE(ae.media_id, li.media_id),
            ae.occurred_at,
            CASE WHEN ae.event_type = 'season_completed' THEN ae.metadata->>'season' END,
            ae.id
        ) deduped
        ORDER BY occurred_at DESC
        LIMIT ${limit};
      `;
    } else {
      rows = await sql`
        SELECT id, event_type, metadata, occurred_at, media FROM (
          SELECT DISTINCT ON (
            ae.event_type,
            COALESCE(ae.media_id, li.media_id),
            ae.occurred_at,
            CASE WHEN ae.event_type = 'season_completed' THEN ae.metadata->>'season' END
          )
            ae.id,
            ae.event_type,
            ae.metadata,
            ae.occurred_at,
            to_jsonb(m.*) AS media
          FROM public.activity_events ae
          LEFT JOIN public.library_items li ON li.id = ae.library_item_id
          LEFT JOIN public.media m ON m.id = COALESCE(ae.media_id, li.media_id)
          WHERE ae.user_id = ${userId}
          ORDER BY
            ae.event_type,
            COALESCE(ae.media_id, li.media_id),
            ae.occurred_at,
            CASE WHEN ae.event_type = 'season_completed' THEN ae.metadata->>'season' END,
            ae.id
        ) deduped
        ORDER BY occurred_at DESC
        LIMIT ${limit};
      `;
    }

    const activities = (rows || []).map((row: any) => ({
      id: row.id,
      event_type: row.event_type,
      metadata: row.metadata,
      occurred_at: row.occurred_at,
      media: row.media || null,
    }));

    return NextResponse.json(activities);
  } catch (error) {
    console.error("Erro em GET /api/activity:", error);
    return respostaDeErro(error, "GET /api/activity");
  }
}
