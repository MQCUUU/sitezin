import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/neon";

export async function GET(request: Request) {
  const username = (new URL(request.url).searchParams.get("username") || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return NextResponse.json(
      { available: false, error: "Use de 3 a 24 letras, números ou _." },
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
