import { NextResponse } from "next/server";
import { seasonTMDB } from "@/lib/tmdb";

export async function GET(_request: Request, context: { params: Promise<{ id: string; season: string }> }) {
  const { id, season } = await context.params;
  const seasonNumber = Number(season);
  if (!/^\d+$/.test(id) || !Number.isInteger(seasonNumber) || seasonNumber < 0) {
    return NextResponse.json({ error: "Temporada inválida." }, { status: 400 });
  }
  try {
    return NextResponse.json(await seasonTMDB(id, seasonNumber), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar a temporada." }, { status: 502 });
  }
}
