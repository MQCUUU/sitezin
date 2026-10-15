import {
  NextRequest,
  NextResponse,
} from "next/server";

import { relevantBrProviders, type RawProvider } from "@/lib/streaming/providers-br";

const TMDB_BASE =
  "https://api.themoviedb.org/3";


export async function GET(
  request: NextRequest,
) {
  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    console.error(
      "[GET /api/discover/filters] TMDB_API_KEY ausente",
    );

    return NextResponse.json(
      {
        error:
          "Os filtros estão temporariamente indisponíveis.",
      },
      { status: 503 },
    );
  }

  const type =
    request.nextUrl.searchParams.get(
      "type",
    ) === "tv"
      ? "tv"
      : "movie";

  const language =
    process.env.TMDB_LANGUAGE || "pt-BR";

  const auth =
    `api_key=${encodeURIComponent(apiKey)}`;

  try {
    const options = {
      next: {
        revalidate: 86400,
      },
      signal: AbortSignal.timeout(8000),
    };

    const [
      genresResponse,
      providersResponse,
    ] = await Promise.all([
      fetch(
        `${TMDB_BASE}/genre/${type}/list?language=${encodeURIComponent(
          language,
        )}&${auth}`,
        options,
      ),
      fetch(
        `${TMDB_BASE}/watch/providers/${type}?language=${encodeURIComponent(
          language,
        )}&watch_region=BR&${auth}`,
        options,
      ),
    ]);

    if (
      !genresResponse.ok ||
      !providersResponse.ok
    ) {
      throw new Error(
        `TMDB respondeu ${genresResponse.status}/${providersResponse.status}`,
      );
    }

    const [
      genresData,
      providersData,
    ] = await Promise.all([
      genresResponse.json(),
      providersResponse.json(),
    ]);

    const genres = Array.isArray(
      genresData?.genres,
    )
      ? genresData.genres
      : [];

    const rawProviders: RawProvider[] =
      Array.isArray(
        providersData?.results,
      )
        ? providersData.results
        : [];
    // V2.9 — mesma regra de "Para você": relevantes no Brasil, sem variantes, até 40
    const providers = relevantBrProviders(
      rawProviders,
      request.nextUrl.searchParams.get("keep"),
    );
    return NextResponse.json(
      {
        genres,
        providers,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400",
        },
      },
    );
  } catch (error) {
    console.error(
      "[GET /api/discover/filters]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível carregar os filtros agora.",
      },
      { status: 502 },
    );
  }
}