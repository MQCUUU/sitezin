import { getRouteSession, sessionUnavailableResponse } from "@/lib/auth/route-session";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { respostaDeErro } from "@/lib/api-error";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) {
      return NextResponse.json({ authenticated: false, enabled: false }, { headers: PRIVATE });
    }

    const rows = (await getDb()`
      SELECT (appearance->>'uncensored_mode')::boolean AS uncensored_mode
      FROM public.user_preferences
      WHERE user_id = ${userId}
      LIMIT 1
    `) as { uncensored_mode: boolean | null }[];

    const enabled = Boolean(rows[0]?.uncensored_mode);

    return NextResponse.json({ authenticated: true, enabled }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "GET /api/profile/uncensored-mode");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getRouteSession();
    if (session.unavailable) return sessionUnavailableResponse();
    const userId = session?.data?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: PRIVATE });
    }

    const body = await request.json().catch(() => null);
    const enabled = Boolean(body?.enabled);

    await getDb()`
      INSERT INTO public.user_preferences (user_id, appearance, updated_at)
      VALUES (${userId}, jsonb_build_object('uncensored_mode', ${enabled}::boolean), now())
      ON CONFLICT (user_id) DO UPDATE SET
        appearance = jsonb_set(COALESCE(public.user_preferences.appearance, '{}'::jsonb), '{uncensored_mode}', ${enabled ? 'true' : 'false'}::jsonb),
        updated_at = now()
    `;

    return NextResponse.json({ success: true, enabled }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "PUT /api/profile/uncensored-mode");
  }
}
