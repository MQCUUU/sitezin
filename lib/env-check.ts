/*
 * Fase 6 — configuração essencial, checada quando o servidor sobe (instrumentation.ts).
 *
 * O erro que já aconteceu (Fase 0): Auth de um ambiente com banco de outro — login
 * funcionava, mas as contas do Neon Auth não eram as do banco (FKs para
 * neon_auth.user quebravam). O Neon Auth roda no MESMO endpoint do banco
 * (ep-…), então dá para comparar sem expor nada: só o id do endpoint.
 *
 * Nunca devolve valores de variáveis — só nomes e o diagnóstico.
 */

export type EnvIssue = { level: "error" | "warn"; message: string };

const REQUIRED = ["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET", "TMDB_API_KEY"] as const;

/** Id do endpoint Neon (ep-xxxx-xxxx) do host, sem o sufixo "-pooler". */
export function neonEndpointId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const match = new URL(url).host.match(/(ep-[a-z0-9]+-[a-z0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function checkEnv(env: Record<string, string | undefined>): EnvIssue[] {
  const issues: EnvIssue[] = [];

  for (const name of REQUIRED) {
    if (!env[name]?.trim()) issues.push({ level: "error", message: `${name} não está definida.` });
  }

  const db = neonEndpointId(env.DATABASE_URL);
  const authUrl = env.NEON_AUTH_BASE_URL || env.NEON_AUTH_URL;
  const auth = neonEndpointId(authUrl);
  if (db && auth && db !== auth) {
    issues.push({
      level: "error",
      message:
        "DATABASE_URL e NEON_AUTH_BASE_URL apontam para endpoints Neon DIFERENTES (Auth de um ambiente, banco de outro). " +
        "Login pode funcionar, mas as contas não serão as do banco.",
    });
  }

  const prod = neonEndpointId(env.PROD_DATABASE_URL);
  if (db && prod && db === prod && env.VERCEL_ENV !== "production" && env.NODE_ENV !== "production") {
    issues.push({ level: "warn", message: "DATABASE_URL aponta para o banco de PRODUÇÃO num ambiente de desenvolvimento." });
  }

  return issues;
}
