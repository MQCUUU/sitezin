import { NextResponse } from "next/server";
import { seasonTMDB } from "@/lib/tmdb";
import { normalizeSeasonDetails } from "@/lib/title-seasons";

export async function GET(_request: Request, context: { params: Promise<{ id: string; season: string }> }) {
  const { id, season } = await context.params;
  const seasonNumber = Number(season);
  if (!/^\d+$/.test(id) || !Number.isInteger(seasonNumber) || seasonNumber < 0) {
    return NextResponse.json({ error: "Temporada inválida." }, { status: 400 });
  }
  try {
    const raw = await seasonTMDB(id, seasonNumber);
    const normalized = normalizeSeasonDetails(raw);

    /*
     * `seasonTMDB` já lança (vira o catch abaixo) em falha HTTP/rede do
     * TMDB. Chegar aqui com `normalized === null` significa um 200 com
     * shape inesperado — falha de dados, não "temporada vazia" (que é
     * `episodes: []` dentro de um `normalized` válido).
     */
    if (!normalized) {
      return NextResponse.json({ error: "Não foi possível carregar a temporada." }, { status: 502 });
    }

    return NextResponse.json(normalized, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar a temporada." }, { status: 502 });
  }
}
