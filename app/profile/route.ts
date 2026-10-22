import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

/*
 * Fase 4 (P3-06) — "/profile" leva ao perfil público do próprio usuário.
 * Antes era uma página: o layout e todos os providers renderizavam (200 +
 * ~110 requisições) e só então o redirect acontecia. O destino depende do
 * usuário (o @ vem do banco), então não cabe em next.config; como Route
 * Handler o 307 sai direto, sem renderizar nada. O proxy continua barrando
 * visitantes antes (→ /login?next=/profile).
 */
export async function GET(request: NextRequest) {
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;

  const to = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url), 307);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  if (!user?.id) return to("/login?next=%2Fprofile");

  const rows = await getDb()`
    SELECT username
    FROM public.profiles
    WHERE id = ${user.id}
    LIMIT 1
  `;

  const username = rows[0]?.username;
  return to(username ? `/u/${encodeURIComponent(username)}` : "/");
}
