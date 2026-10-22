/*
 * Fase 6 — núcleo puro do limite em memória (sem dependência do Next, para testar em Node).
 * Ver lib/rate-limit.ts para o uso nas rotas.
 */
type Bucket = { count: number; resetAt: number };

const MAX_KEYS = 5000;
const store = new Map<string, Bucket>();

export type RateDecision = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): RateDecision {
  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (store.size >= MAX_KEYS) {
      for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
      if (store.size >= MAX_KEYS) store.delete(store.keys().next().value as string);
    }
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }
  bucket.count += 1;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Só para testes. */
export function resetRateLimits() {
  store.clear();
}

/** IP do cliente: na Vercel, x-forwarded-for é preenchido pela plataforma (o 1º é o cliente). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "desconhecido";
  return request.headers.get("x-real-ip")?.trim() || "desconhecido";
}

