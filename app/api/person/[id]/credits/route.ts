import {
  NextRequest,
  NextResponse,
} from "next/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

type Credit = {
  id: number;
  media_type?: string;
  character?: string;
  job?: string;
  department?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  popularity?: number;
  vote_count?: number;
  vote_average?: number;
  roles?: string[];
  [key: string]: unknown;
};

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id } = await params;

  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    console.error(
      "[GET /api/person/[id]/credits] TMDB_API_KEY ausente",
    );

    return NextResponse.json(
      {
        error:
          "O serviço de pessoas está temporariamente indisponível.",
      },
      { status: 503 },
    );
  }

  const personId = Number(id);

  if (
    !Number.isInteger(personId) ||
    personId <= 0
  ) {
    return NextResponse.json(
      { error: "ID inválido." },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({
    api_key: apiKey,
    language:
      process.env.TMDB_LANGUAGE ||
      "pt-BR",
  });

  try {
    const options = {
      next: {
        revalidate: 86400,
      },
      signal: AbortSignal.timeout(8000),
    };

    const [
      personResponse,
      creditsResponse,
    ] = await Promise.all([
      fetch(
        `${TMDB_BASE}/person/${personId}?${query}`,
        options,
      ),
      fetch(
        `${TMDB_BASE}/person/${personId}/combined_credits?${query}`,
        options,
      ),
    ]);

    if (
      !personResponse.ok ||
      !creditsResponse.ok
    ) {
      console.error(
        "[TMDB person credits]",
        personResponse.status,
        creditsResponse.status,
      );

      return NextResponse.json(
        {
          error:
            "Não foi possível carregar os dados da pessoa.",
        },
        { status: 502 },
      );
    }

    const [
      person,
      credits,
    ] = await Promise.all([
      personResponse.json(),
      creditsResponse.json(),
    ]);

    const cast: Credit[] =
      Array.isArray(credits?.cast)
        ? credits.cast
        : [];

    const crew: Credit[] =
      Array.isArray(credits?.crew)
        ? credits.crew
        : [];

    const merged =
      new Map<string, Credit>();

    const allCredits: Credit[] = [
      ...cast.map((credit) => ({
        ...credit,
        credit_kind: "cast",
        role:
          credit.character || "Atuação",
      })),
      ...crew.map((credit) => ({
        ...credit,
        credit_kind: "crew",
        role:
          credit.job ||
          credit.department ||
          "Equipe",
      })),
    ];

    for (const item of allCredits) {
      if (
        item.media_type !== "movie" &&
        item.media_type !== "tv"
      ) {
        continue;
      }

      const key =
        `${item.media_type}-${item.id}`;

      const current =
        merged.get(key);

      const role =
        typeof item.role === "string"
          ? item.role
          : "";

      if (!current) {
        merged.set(key, {
          ...item,
          roles: role ? [role] : [],
        });

        continue;
      }

      merged.set(key, {
        ...current,
        character:
          current.character ||
          item.character,
        job:
          current.job || item.job,
        department:
          current.department ||
          item.department,
        roles: Array.from(
          new Set(
            [
              ...(current.roles || []),
              role,
            ].filter(Boolean),
          ),
        ),
      });
    }

    const results = Array.from(
      merged.values(),
    )
      .filter(
        (item) =>
          item.poster_path ||
          item.backdrop_path,
      )
      .sort(
        (a, b) =>
          relevance(b) - relevance(a),
      );

    return NextResponse.json(
      {
        person: {
          id: person.id,
          name: person.name,
          profile_path:
            person.profile_path,
          known_for_department:
            person.known_for_department,
          biography: person.biography,
          birthday: person.birthday,
          deathday: person.deathday,
          place_of_birth:
            person.place_of_birth,
          also_known_as: Array.isArray(
            person.also_known_as,
          )
            ? person.also_known_as
            : [],
          homepage: person.homepage,
          popularity: person.popularity,
        },
        results,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error(
      "[GET /api/person/[id]/credits]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível carregar os dados da pessoa agora.",
      },
      { status: 502 },
    );
  }
}

function relevance(item: Credit) {
  return (
    Number(item.popularity || 0) +
    Math.log10(
      Math.max(
        Number(item.vote_count || 0),
        1,
      ),
    ) *
      8 +
    Number(item.vote_average || 0) * 2
  );
}