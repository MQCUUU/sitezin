import { NextResponse } from "next/server";
import { getRouteSession } from "@/lib/auth/route-session";
import { takeToken } from "@/lib/rate-limit";

/* Peças comuns das rotas /api/reviews/[id]/… (curtidas e comentários). */

export const PRIVATE = { "Cache-Control": "private, no-store" } as const;

export function reviewNotFound() {
  return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404, headers: PRIVATE });
}

/** Sessão de quem pede; sem sessão (ou sessão indisponível) é visitante. */
export async function viewerOf(): Promise<{ id: string | null; unavailable: boolean }> {
  const session = await getRouteSession();
  const id = session?.data?.user?.id ?? null;
  return { id: id ? String(id) : null, unavailable: session.unavailable };
}

export function rateLimited(key: string, limit: number, windowMs: number) {
  const decision = takeToken(key, limit, windowMs);
  if (decision.allowed) return null;
  return NextResponse.json(
    { error: "Muitas ações seguidas. Tente de novo em instantes." },
    { status: 429, headers: { ...PRIVATE, "Retry-After": String(decision.retryAfterSeconds) } }
  );
}

type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

export async function actorName(sql: Sql, userId: string) {
  const rows = await sql`SELECT username, display_name FROM public.profiles WHERE id = ${userId}::uuid`;
  const r = rows[0];
  return r?.display_name?.trim() || (r?.username ? `@${r.username}` : "Alguém");
}
