/*
 * Fase 6 (P3-09) — proteção das MUTAÇÕES em /api, aplicada no proxy antes da rota.
 *
 * CSRF: a sessão vai em cookie (SameSite=Lax, que já barra o grosso). Aqui uma
 * segunda camada simples, sem token:
 *  - Origin presente → precisa ser o próprio host (ou uma origem liberada em
 *    APP_ALLOWED_ORIGINS / a URL pública do site). Outra origem → 403.
 *  - Sem Origin → `Sec-Fetch-Site: cross-site` → 403. Sem nenhum dos dois é
 *    cliente que não é navegador (curl, testes, servidor): não carrega cookie
 *    de outra aba, então não há CSRF a barrar.
 * Content-Type: corpo presente precisa ser JSON (ou multipart, para upload) —
 *  antes `text/plain` era aceito, o tipo de corpo que um formulário de outro site
 *  consegue mandar sem preflight. Corpo grande demais → 413 antes de ler.
 *
 * Fora daqui: GET/HEAD/OPTIONS e /api/auth/* (o Neon Auth/Better Auth tem a
 * própria checagem de origem).
 */

export type ApiGuardInput = {
  method: string;
  pathname: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  contentType: string | null;
  contentLength: number | null;
  hasBody: boolean;
  allowedOrigins: string[];
};

export type ApiGuardRejection = { status: 403 | 413 | 415; error: string };

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MB = 1024 * 1024;

/** Limite de corpo por rota (o resto: 1 MB, folgado para qualquer JSON do app). */
export function bodyLimitFor(pathname: string): number {
  if (pathname === "/api/account/import") return 12 * MB; // backup até 10 MB
  if (pathname === "/api/profile/avatar") return 6 * MB; // imagem até 5 MB
  return 1 * MB;
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

export function checkApiMutation(input: ApiGuardInput): ApiGuardRejection | null {
  const method = input.method.toUpperCase();
  if (!MUTATIONS.has(method)) return null;
  if (!input.pathname.startsWith("/api/") || input.pathname.startsWith("/api/auth/")) return null;

  if (input.origin) {
    const fromHost = originHost(input.origin);
    const sameHost = Boolean(fromHost && input.host && fromHost === input.host.toLowerCase());
    const allowed = input.allowedOrigins.some((value) => originHost(value) === fromHost);
    // "null" (iframe sandbox, file://) nunca é uma origem do app.
    if (!sameHost && !allowed) return { status: 403, error: "Origem não permitida." };
  } else if ((input.secFetchSite || "").toLowerCase() === "cross-site") {
    return { status: 403, error: "Origem não permitida." };
  }

  if (input.contentLength !== null && input.contentLength > bodyLimitFor(input.pathname)) {
    return { status: 413, error: "O conteúdo enviado é grande demais." };
  }

  if (input.hasBody) {
    const type = (input.contentType || "").toLowerCase();
    const ok = type.startsWith("application/json") || type.startsWith("multipart/form-data");
    if (!ok) return { status: 415, error: "Envie os dados como JSON (Content-Type: application/json)." };
  }

  return null;
}

/** Origens extras liberadas (previews, domínio próprio): APP_ALLOWED_ORIGINS separado por vírgula + URL pública. */
export function allowedOriginsFromEnv(env: Record<string, string | undefined>): string[] {
  const list = (env.APP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (env.NEXT_PUBLIC_SITE_URL) list.push(env.NEXT_PUBLIC_SITE_URL.trim());
  return list;
}
