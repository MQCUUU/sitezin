import { NextResponse } from "next/server";

/*
 * Fase 6 (P3-08) — limite de requisições em memória, por instância do servidor.
 *
 * Para endpoints PÚBLICOS caros (busca, sugestões, checagem de @, perfil público):
 * sem sessão não há user_id, e a tabela api_rate_limits é por usuário (uuid, FK
 * para a conta). Aqui a chave é o IP. É uma primeira camada aproximada — cada
 * instância conta separado —, suficiente para barrar um script martelando um
 * endpoint; os limites são folgados para várias pessoas atrás do mesmo IP.
 *
 * Também é o fallback do limite do assistente quando o armazenamento no banco
 * falha (antes: sem limite nenhum nesse caso).
 */

import { clientIp, takeToken } from "./rate-limit-core";

export { clientIp, resetRateLimits, takeToken } from "./rate-limit-core";
export type { RateDecision } from "./rate-limit-core";

export const PUBLIC_LIMITS = {
  suggest: { limit: 120, windowMs: 60_000 },
  search: { limit: 60, windowMs: 60_000 },
  users: { limit: 60, windowMs: 60_000 },
  username: { limit: 30, windowMs: 60_000 },
  publicProfile: { limit: 90, windowMs: 60_000 },
} as const;

/** 429 pronto (mesmo formato de erro das outras rotas) ou null se pode seguir. */
export function limitPublicRequest(request: Request, bucket: keyof typeof PUBLIC_LIMITS): NextResponse | null {
  const { limit, windowMs } = PUBLIC_LIMITS[bucket];
  const decision = takeToken(`${bucket}:${clientIp(request)}`, limit, windowMs);
  if (decision.allowed) return null;
  return NextResponse.json(
    { error: "Muitas solicitações em pouco tempo. Aguarde um momento e tente novamente." },
    { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds), "Cache-Control": "no-store" } }
  );
}
