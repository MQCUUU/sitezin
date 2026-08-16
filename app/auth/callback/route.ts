import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sanitiza o parâmetro ?next= para impedir open redirect.
 *
 * Aceita SOMENTE caminhos internos:
 *   ok      -> "/library", "/title/movie/550?tab=reviews"
 *   bloqueado -> "https://evil.com", "//evil.com", "/\evil.com", "javascript:..."
 *
 * A mesma regra já existia em lib/supabase/proxy.ts; aqui ela estava faltando.
 */
function safeNextPath(raw: string | null): string {
  const fallback = "/";

  if (!raw) return fallback;

  // Precisa começar com uma única barra.
  if (!raw.startsWith("/")) return fallback;

  // "//host" e "/\host" são interpretados como protocol-relative pelo navegador.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;

  // Defesa extra: nada de esquema embutido após decode.
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
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
