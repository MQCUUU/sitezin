import { NextResponse, type NextRequest } from "next/server";
import { validateSessionData } from "@neondatabase/auth/server";

/*
 * ==========================================
 * ROTAS PRIVADAS DO MYCATALOG
 * ==========================================
 *
 * Essas páginas não devem renderizar sem
 * uma sessão Neon Auth ativa.
 */
const PRIVATE_ROUTES = [
  "/library",
  "/for-you",
  "/assistant",
  "/diary",
  "/calendar",
  "/ranking",
  "/stats",
  "/retrospective",
  "/favorites",
  "/profile",
  "/settings",
] as const;

/*
 * Rotas exclusivas para visitantes sem sessão.
 */
const GUEST_ONLY_ROUTES = [
  "/login",
  "/signup",
] as const;

function pathMatches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isPrivatePage(pathname: string): boolean {
  return PRIVATE_ROUTES.some((route) => pathMatches(pathname, route));
}

function isGuestOnlyPage(pathname: string): boolean {
  return GUEST_ONLY_ROUTES.some((route) => pathMatches(pathname, route));
}

function isApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  /*
   * Aceita somente caminhos internos.
   * Bloqueia esquemas externos, barras duplas e caracteres de controle.
   */
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.startsWith("/\\") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return null;
  }

  try {
    const target = new URL(decoded, "https://mycatalog.local");
    if (target.origin !== "https://mycatalog.local") {
      return null;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

const cookieSecret =
  process.env.NEON_AUTH_COOKIE_SECRET?.trim() ||
  "d890bfa3f80c45169a6efd019f394c8e7b3017a58e23f99e43681726a8f15d2a";
const secret = cookieSecret.length >= 32 ? cookieSecret : cookieSecret.padEnd(32, "0");

const baseUrl = (
  process.env.NEON_AUTH_BASE_URL?.trim() ||
  process.env.NEON_AUTH_URL?.trim() ||
  "https://auth.neon.tech"
).replace(/\/+$/, "");

/**
 * Validação rigorosa de autenticação para o middleware/proxy:
 * 1. Fast Path: Verifica assinatura criptográfica HMAC do JWT local.session_data.
 *    Se válido, autentica sem custo de rede (0ms).
 * 2. Slow Path: Se houver apenas session_token (ou token opaco), consulta o Neon Auth upstream.
 *    NUNCA confia apenas na presença de cookies com nomes arbitrários.
 */
async function isSessionAuthenticated(request: NextRequest): Promise<boolean> {
  // 1. Fast Path: Assinatura criptográfica HMAC do session_data
  const sessionDataCookie =
    request.cookies.get("__Secure-neon-auth.local.session_data")?.value ||
    request.cookies.get("neon-auth.local.session_data")?.value;

  if (sessionDataCookie) {
    try {
      const result = await validateSessionData(sessionDataCookie, secret);
      if (result.valid && result.payload?.session) {
        return true;
      }
    } catch {
      // Assinatura inválida, adulterada ou expirada
    }
  }

  // 2. Slow Path: Validação do session_token no Neon Auth
  const sessionToken =
    request.cookies.get("__Secure-neon-auth.session_token")?.value ||
    request.cookies.get("neon-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value ||
    request.cookies.get("better-auth.session_token")?.value;

  if (!sessionToken) {
    return false;
  }

  try {
    const rawCookie = request.headers.get("cookie") || "";
    const res = await fetch(`${baseUrl}/get-session`, {
      headers: { cookie: rawCookie },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data && data.session && data.user);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // APIs cuidam da própria autenticação (retornando 401 JSON)
  if (isApi(pathname)) {
    return NextResponse.next({ request });
  }

  const isPrivate = isPrivatePage(pathname);
  const isGuestOnly = isGuestOnlyPage(pathname);

  // Páginas públicas comuns não precisam de verificação de autenticação no middleware
  if (!isPrivate && !isGuestOnly) {
    return NextResponse.next({ request });
  }

  const authenticated = await isSessionAuthenticated(request);

  /*
   * PÁGINA PRIVADA SEM SESSÃO
   */
  if (isPrivate && !authenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("reason", "session");

    const destination = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("next", destination);

    return NextResponse.redirect(loginUrl);
  }

  /*
   * LOGIN/CADASTRO JÁ AUTENTICADO
   */
  if (authenticated && isGuestOnly) {
    const home = request.nextUrl.clone();
    const requestedNext = safeNextPath(request.nextUrl.searchParams.get("next"));

    if (requestedNext) {
      const target = new URL(requestedNext, request.url);
      home.pathname = target.pathname;
      home.search = target.search;
    } else {
      home.pathname = "/";
      home.search = "";
    }

    return NextResponse.redirect(home);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf)$).*)",
  ],
};
