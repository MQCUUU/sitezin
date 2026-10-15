import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sanitizePreferences } from "@/lib/preferences";

/*
 * GET/PUT /api/profile/preferences — aparência salva NA CONTA, para valer em
 * qualquer navegador/aparelho. Sempre o usuário da sessão; nada vem do cliente
 * além dos valores, que são validados (sanitizePreferences).
 */

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const rows = (await getDb()`
      SELECT appearance, updated_at FROM public.user_preferences WHERE user_id = ${userId} LIMIT 1
    `) as { appearance: Record<string, unknown>; updated_at: string }[];

    return NextResponse.json(
      rows[0] ? { appearance: sanitizePreferences(rows[0].appearance), updated_at: rows[0].updated_at } : { appearance: null },
      { headers: PRIVATE }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/profile/preferences");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const body = await request.json().catch(() => null);

    if (!body || typeof body.appearance !== "object" || body.appearance === null) {
      return entradaInvalida("Preferências inválidas.");
    }

    const appearance = sanitizePreferences(body.appearance);

    await getDb()`
      INSERT INTO public.user_preferences (user_id, appearance, updated_at)
      VALUES (${userId}, ${JSON.stringify(appearance)}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET appearance = EXCLUDED.appearance, updated_at = now()
    `;

    return NextResponse.json({ appearance }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "PUT /api/profile/preferences");
  }
}
