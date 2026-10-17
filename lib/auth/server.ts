import { createNeonAuth } from "@neondatabase/auth/next/server";

import { getAuthCookieSecret } from "@/lib/auth/cookie-secret";
import { getDb } from "@/lib/db/neon";

const baseUrl =
  process.env.NEON_AUTH_BASE_URL?.trim() ||
  process.env.NEON_AUTH_URL?.trim() ||
  "https://auth.neon.tech";

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: getAuthCookieSecret(),
    sessionDataTtl: 300,
  },
});

/*
 * V3.3 — guarda central de sessão revogada.
 *
 * O provedor guarda a sessão num cookie assinado por até `sessionDataTtl`
 * (300 s) e, nesse intervalo, `getSession()` responde só com o cookie, sem
 * consultar o servidor de auth. Medido no TEST: depois de "trocar a senha e
 * desconectar os outros aparelhos", o outro aparelho ainda LIA e GRAVAVA
 * dados pessoais por até 5 min; depois de excluir a conta, ainda recebia 200
 * (vazio) nas leituras.
 *
 * Aqui, toda rota que usa `auth.getSession()` (fonte única das APIs) só
 * recebe a sessão se ela ainda existir e estiver válida no banco do provedor
 * (`neon_auth.session`, mesmo banco do app — 1 consulta por chave primária).
 * Sessão revogada/conta excluída = sem sessão = 401. Erro na checagem =
 * sem sessão (falha fechada). O cookie e o provedor não mudam.
 */
type ProviderSession = {
  data?: { session?: { id?: string; userId?: string } | null; user?: { id?: string } | null } | null;
  error?: unknown;
};

const providerGetSession = auth.getSession;

export async function sessionStillValid(sessionId: string | undefined, userId: string): Promise<boolean> {
  const sql = getDb();
  const rows = sessionId
    ? await sql`
        SELECT 1 FROM neon_auth.session
        WHERE id = ${sessionId} AND "userId" = ${userId} AND "expiresAt" > now()
        LIMIT 1
      `
    : await sql`SELECT 1 FROM neon_auth."user" WHERE id = ${userId} LIMIT 1`;

  return rows.length > 0;
}

auth.getSession = (async (...args: Parameters<typeof providerGetSession>) => {
  const result = (await providerGetSession(...args)) as ProviderSession;
  const userId = result?.data?.user?.id;

  if (!userId) return result;

  const valid = await sessionStillValid(result.data?.session?.id, userId).catch(() => false);

  return valid ? result : { data: null, error: null };
}) as typeof providerGetSession;
