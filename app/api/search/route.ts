import { limitPublicRequest } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

import { searchTMDB } from "@/lib/tmdb";

export async function GET(request: Request) {
  // Fase 6 (P3-08): endpoint público e caro — limite por IP (lib/rate-limit.ts).
  const limited = limitPublicRequest(request, "search");
  if (limited) return limited;

  const query =
    new URL(request.url).searchParams
      .get("q")
      ?.trim() || "";

  if (query.length < 2) {
    return NextResponse.json({
      results: [],
    });
  }

  if (query.length > 100) {
    return NextResponse.json(
      {
        error:
          "A busca deve ter no máximo 100 caracteres.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await searchTMDB(query);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error(
      "[GET /api/search]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível realizar a busca agora.",
      },
      { status: 502 },
    );
  }
}
