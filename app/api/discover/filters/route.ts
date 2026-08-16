import {
  NextRequest,
  NextResponse,
} from "next/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

type Provider = {
  provider_id?: unknown;
  provider_name?: unknown;
  logo_path?: unknown;
  display_priority?: unknown;
};

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

    const rawProviders: Provider[] =
      Array.isArray(
        providersData?.results,
      )
        ? providersData.results
        : [];

    const providers = rawProviders
      .map((provider) => ({
        provider_id: Number(
          provider.provider_id,
        ),
        provider_name: String(
          provider.provider_name || "",
        ),
        logo_path:
          typeof provider.logo_path ===
          "string"
            ? provider.logo_path
            : null,
        display_priority: Number(
          provider.display_priority ?? 9999,
        ),
      }))
      .filter(
        (provider) =>
          provider.provider_id &&
          provider.provider_name,
      )
      .sort(
        (a, b) =>
          a.display_priority -
            b.display_priority ||
          a.provider_name.localeCompare(
            b.provider_name,
          ),
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