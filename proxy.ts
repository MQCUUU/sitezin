import { NextResponse, type NextRequest } from "next/server";
import { validateSessionData } from "@neondatabase/auth/server";

import { getAuthCookieSecret } from "@/lib/auth/cookie-secret";
import { episodeExists, listAccess, personExists, profileExists, titleExists } from "@/lib/resource-exists";
import { allowedOriginsFromEnv, checkApiMutation } from "@/lib/api-guard";
import { isPrivatePath, pathMatches } from "@/lib/private-routes";

/*
 * Rotas privadas (não renderizam sem sessão Neon Auth ativa): fonte única em
 * lib/private-routes.ts (Fase 7), compartilhada com SessionSync e robots.ts.
 */
const isPrivatePage = isPrivatePath;

/*
 * Rotas exclusivas para visitantes sem sessão.
 */
const GUEST_ONLY_ROUTES = [
  "/login",
  "/signup",
] as const;

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
const ALLOWED_ORIGINS = allowedOriginsFromEnv(process.env);

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
/*
 * Fase 7: "não deu para verificar" (provedor com 429/5xx/timeout) é diferente de
 * "sem sessão". Antes as duas respostas viravam `false`: com o provedor oscilando,
 * a página privada mandava para o login e o login (numa resposta seguinte OK)
 * devolvia para a página — laço de redirecionamento. Agora só redireciona com
 * resposta definitiva; na dúvida a página abre e as APIs (que sempre exigem
 * sessão) respondem 401 normalmente.
 */
type SessionCheck = "authenticated" | "guest" | "unknown";

async function checkSession(request: NextRequest): Promise<SessionCheck> {
  const authenticated = await isSessionAuthenticated(request);
  return authenticated === null ? "unknown" : authenticated ? "authenticated" : "guest";
}

async function isSessionAuthenticated(request: NextRequest): Promise<boolean | null> {
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

    if (res.status === 401 || res.status === 403) return false;
    if (!res.ok) return null; // 429/5xx: não sabemos
    const data = await res.json().catch(() => undefined);
    if (data === undefined) return null;
    return Boolean(data && data.session && data.user);
  } catch {
    return null; // timeout/rede: não sabemos
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

  // APIs cuidam da própria autenticação (retornando 401 JSON). Fase 6: mutações passam
  // antes por Origin/Content-Type/tamanho (lib/api-guard.ts).
  if (isApi(pathname)) {
    const lengthHeader = request.headers.get("content-length");
    const rejection = checkApiMutation({
      method: request.method,
      pathname,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
      contentType: request.headers.get("content-type"),
      contentLength: lengthHeader === null ? null : Number(lengthHeader),
      hasBody: Number(lengthHeader || 0) > 0 || request.headers.get("transfer-encoding") !== null,
      allowedOrigins: ALLOWED_ORIGINS,
    });
    if (rejection) {
      return NextResponse.json({ error: rejection.error }, { status: rejection.status, headers: { "Cache-Control": "no-store" } });
    }
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

  const session = await checkSession(request);
  const authenticated = session === "authenticated";

  /*
   * PÁGINA PRIVADA SEM SESSÃO (só com resposta definitiva — ver checkSession)
   */
  if (isPrivate && session === "guest") {
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
