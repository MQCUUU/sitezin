import { NextRequest, NextResponse } from "next/server";

function safeNextPath(raw: string | null): string {
  const fallback = "/";

  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;

  return raw;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));

  // Neon Auth gerencia callbacks OAuth em /api/auth/callback/[provider].
  // Esta rota legada apenas redireciona com segurança para a aplicação.
  return NextResponse.redirect(new URL(next, request.url));
}
