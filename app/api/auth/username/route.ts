import { limitPublicRequest } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/neon";
import { isReservedUsername, isValidUsername, normalizeUsername, USERNAME_RESERVED_MESSAGE, USERNAME_RULE_MESSAGE } from "@/lib/username";

export async function GET(request: Request) {
  // Fase 6 (P3-08): endpoint público e caro — limite por IP (lib/rate-limit.ts).
  const limited = limitPublicRequest(request, "username");
  if (limited) return limited;

  const username = normalizeUsername(new URL(request.url).searchParams.get("username") || "");
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { available: false, error: USERNAME_RULE_MESSAGE },
      { status: 400, headers: { "X-Username-Backend": "neon-direct-v1" } }
    );
  }

  if (isReservedUsername(username)) {
    return NextResponse.json(
      { available: false, error: USERNAME_RESERVED_MESSAGE },
      { status: 400, headers: { "X-Username-Backend": "neon-direct-v1" } }
    );
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT 1
      FROM public.profiles
      WHERE lower(username) = ${username}
      LIMIT 1
    `;
    return NextResponse.json(
      { available: rows.length === 0 },
      { headers: { "Cache-Control": "no-store", "X-Username-Backend": "neon-direct-v1" } }
    );
  } catch (error: any) {
    console.error("[username-check] Erro:", error?.message);
    return NextResponse.json(
      { available: false, error: "Erro ao consultar disponibilidade." },
      { status: 500, headers: { "X-Username-Backend": "neon-direct-v1" } }
    );
  }
}
