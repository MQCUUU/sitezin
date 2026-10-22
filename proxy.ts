import { NextResponse, type NextRequest } from "next/server";
import { validateSessionData } from "@neondatabase/auth/server";

import { getAuthCookieSecret } from "@/lib/auth/cookie-secret";
import { episodeExists, listAccess, personExists, profileExists, titleExists } from "@/lib/resource-exists";

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
  "/insights",
] as const;

/*
 * V2.1-B — "/lists" (a tela "Minhas listas") é pessoal, igual às rotas
 * acima, mas não pode usar o mesmo `pathMatches` por prefixo: uma
 * lista individual pública (`/lists/[id]`) é pública por design
 * (confirmado em fases anteriores) e `pathMatches("/lists/abc",
 * "/lists")` daria `true` (bate no `startsWith("/lists/")`), o que
 * bloquearia a lista pública também. Por isso "/lists" usa correspondência
 * EXATA — só a listagem "minhas listas" é privada, nunca `/lists/*`.
 */
const PRIVATE_EXACT_ROUTES = ["/lists"] as const;

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
  return (
    PRIVATE_ROUTES.some((route) => pathMatches(pathname, route)) ||
    PRIVATE_EXACT_ROUTES.some((route) => pathname === route)
  );
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

const secret = getAuthCookieSecret();

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

/*
 * ==========================================
 * FASE 5 (P3-05) — 404 REAL PARA RECURSO INEXISTENTE
 * ==========================================
 *
 * Com app/loading.tsx na raiz, a página responde em streaming e o 200 já saiu
 * quando ela chama notFound() ("soft 404"). Aqui, antes de renderizar, as
 * rotas dinâmicas públicas checam se o recurso existe (lib/resource-exists):
 * comprovadamente inexistente → a resposta é a página 404 do app com status
 * 404. Falha temporária (TMDB/banco fora, timeout) → segue normal.
 *
 * Só em GET/HEAD de documento: navegação client-side (cabeçalho `rsc`) e prefetch
 * continuam como antes (a página mostra o "não encontrado" dela).
 */
const NOT_FOUND_REWRITE = "/_mc/nao-encontrado";

const TITLE_RE = /^\/title\/([^/]+)\/([^/]+)\/?$/;
const EPISODE_RE = /^\/title\/tv\/([^/]+)\/season\/([^/]+)\/episode\/([^/]+)\/?$/;
const PERSON_RE = /^\/person\/([^/]+)\/?$/;
const PROFILE_RE = /^\/u\/([^/]+)\/?$/;
const LIST_RE = /^\/lists\/([^/]+)\/?$/;

function isDocumentRequest(request: NextRequest): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") && // HEAD: verificadores de link
    !request.headers.get("rsc") &&
    !request.headers.get("next-router-prefetch")
  );
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

/**
 * Id do usuário pela assinatura local do session_data (sem rede).
 * `null` = sem sessão nenhuma; `undefined` = há token mas não dá para saber
 * o usuário sem consultar o Neon Auth (nesse caso não decidimos nada aqui).
 */
async function sessionUserId(request: NextRequest): Promise<string | null | undefined> {
  const sessionDataCookie =
    request.cookies.get("__Secure-neon-auth.local.session_data")?.value ||
    request.cookies.get("neon-auth.local.session_data")?.value;

  if (sessionDataCookie) {
    try {
      const result = await validateSessionData(sessionDataCookie, secret);
      const id = result.valid ? result.payload?.user?.id : null;
      if (id) return String(id);
    } catch {
      // assinatura inválida/expirada: trata como "não sei"
    }
  }

  const hasToken = [
    "__Secure-neon-auth.session_token",
    "neon-auth.session_token",
    "__Secure-better-auth.session_token",
    "better-auth.session_token",
  ].some((name) => request.cookies.get(name)?.value);

  return hasToken || sessionDataCookie ? undefined : null;
}

async function isMissingResource(request: NextRequest, pathname: string): Promise<boolean> {
  let match: RegExpMatchArray | null;

  if ((match = pathname.match(EPISODE_RE))) {
    return (await episodeExists(match[1], match[2], match[3])) === false;
  }
  if ((match = pathname.match(TITLE_RE))) {
    return (await titleExists(match[1], match[2])) === false;
  }
  if ((match = pathname.match(PERSON_RE))) {
    return (await personExists(match[1])) === false;
  }
  if ((match = pathname.match(PROFILE_RE))) {
    return (await profileExists(decodeSegment(match[1]))) === false;
  }
  if ((match = pathname.match(LIST_RE))) {
    const access = await listAccess(decodeSegment(match[1]));
    if (!access) return false; // banco fora: a página decide
    if (!access.exists) return true;
    if (access.isPublic) return false;
    /*
     * Lista privada: a política do app é "privada ≡ inexistente" para quem não
     * é o dono (mesmo 404 da API /api/lists/items). Quando não dá para saber o
     * usuário sem rede, segue para a página (que aplica a mesma regra).
     */
    const viewer = await sessionUserId(request);
    if (viewer === undefined) return false;
    return viewer !== access.ownerId;
  }
  return false;
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
    if (isDocumentRequest(request) && (await isMissingResource(request, pathname))) {
      return NextResponse.rewrite(new URL(NOT_FOUND_REWRITE, request.url), { status: 404 });
    }
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
