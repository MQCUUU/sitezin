import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Renova a sessão Supabase e aplica as regras de acesso
 * centralizadas em lib/supabase/proxy.ts.
 *
 * É indispensável retornar a resposta: ela pode conter cookies
 * renovados ou um redirecionamento para login/home.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf)$).*)",
  ],
};