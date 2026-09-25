import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const userId = user.id;
    const sql = getDb();

    const [notifications, unreadRes] = await Promise.all([
      sql`
        SELECT
          id,
          type,
          title,
          message,
          href,
          release_at,
          release_precision,
          read_at,
          created_at
        FROM public.notifications
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 30;
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM public.notifications
        WHERE user_id = ${userId} AND read_at IS NULL;
      `,
    ]);

    const unread = Number(unreadRes[0]?.count || 0);

    return NextResponse.json(
      { notifications: notifications || [], unread },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Erro em GET /api/notifications:", error);
    return respostaDeErro(error, "GET /api/notifications");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const userId = user.id;
    const body = await request.json().catch(() => ({}));
    const sql = getDb();

    if (body.all) {
      await sql`
        UPDATE public.notifications
        SET read_at = NOW()
        WHERE user_id = ${userId} AND read_at IS NULL;
      `;
    } else {
      const id = String(body.id || "");
      await sql`
        UPDATE public.notifications
        SET read_at = NOW()
        WHERE user_id = ${userId} AND id = ${id} AND read_at IS NULL;
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro em PATCH /api/notifications:", error);
    return respostaDeErro(error, "PATCH /api/notifications");
  }
}
