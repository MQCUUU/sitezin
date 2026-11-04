import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";

/*
 * Sessão para rotas que EXIGEM login.
 *
 * Diferença para `auth.getSession().catch(() => null)`: falha do provedor de
 * auth (rede, 502, timeout) não vira "sem sessão". Essa rota responde 503
 * (tentar de novo) e NÃO 401 (sessão expirada → login). Só há 401 quando o
 * provedor confirma que não existe sessão.
 *
 * O formato devolvido é o mesmo de `auth.getSession()` (`data`, `error`),
 * acrescido de `unavailable`, então o código que lê `session?.data?.user`
 * continua igual.
 */
export async function getRouteSession() {
  try {
    const session = await auth.getSession();
    const error = session?.error ?? null;
    return {
      data: session?.data ?? null,
      error,
      unavailable: error !== null,
    };
  } catch {
    return {
      data: null,
      error: { unavailable: true },
      unavailable: true,
    };
  }
}

export function sessionUnavailableResponse() {
  return NextResponse.json(
    { error: "Não foi possível confirmar sua sessão agora. Tente novamente em instantes." },
    { status: 503, headers: { "Retry-After": "5" } }
  );
}
