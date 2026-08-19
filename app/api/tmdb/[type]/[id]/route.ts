import {
  after,
  NextResponse,
} from "next/server";

import { detailsTMDB } from "@/lib/tmdb";
import { sanitizeTitleDetails } from "@/lib/title-details";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

type MediaType = "movie" | "tv";

type CastMember = {
  character?: string;
  name?: string;
  profile_path?: string | null;
};

type MediaDetails = {
  id: number;
  title?: string;
  name?: string;
  credits?: {
    cast?: CastMember[];
  };
  aggregate_credits?: {
    cast?: CastMember[];
  };
  [key: string]: unknown;
};

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      type: string;
      id: string;
    }>;
  },
) {
  const { type, id } = await params;

  if (
    type !== "movie" &&
    type !== "tv"
  ) {
    return NextResponse.json(
      { error: "Tipo inválido." },
      { status: 400 },
    );
  }

  const tmdbId = Number(id);

  if (
    !Number.isInteger(tmdbId) ||
    tmdbId <= 0
  ) {
    return NextResponse.json(
      { error: "ID inválido." },
      { status: 400 },
    );
  }

  try {
    const apiKey =
      process.env.TMDB_API_KEY;

    const providersPromise = apiKey
      ? fetch(
          `${TMDB_BASE}/${type}/${tmdbId}/watch/providers?api_key=${encodeURIComponent(
            apiKey,
          )}`,
          {
            headers: {
              accept: "application/json",
            },
            next: {
              revalidate: 21600,
            },
            signal:
              AbortSignal.timeout(8000),
          },
        )
      : null;

    const [
      details,
      providersResponse,
    ] = await Promise.all([
      detailsTMDB(type, tmdbId),
      providersPromise,
    ]);

    after(async () => {
      try {
        await indexMediaCharacters(
          type,
          details as MediaDetails,
        );
      } catch (error) {
        console.error(
          "[TMDB character index]",
          error,
        );
      }
    });

    let watchProviders: unknown = null;

    if (providersResponse?.ok) {
      watchProviders =
        await providersResponse.json();
    } else if (providersResponse) {
      console.error(
        "[TMDB watch providers]",
        providersResponse.status,
      );
    }

    return NextResponse.json({
      ...sanitizeTitleDetails(details),
      watch_providers: watchProviders,
    });
  } catch (error) {
    console.error(
      "[GET /api/tmdb/[type]/[id]]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível carregar os dados do título agora.",
      },
      { status: 502 },
    );
  }
}

function indexMediaCharacters(
  type: MediaType,
  details: MediaDetails,
) {
  const cast =
    type === "movie"
      ? details.credits?.cast || []
      : details.aggregate_credits?.cast ||
        [];

  if (!cast.length) {
    return Promise.resolve();
  }

  const characters = cast
    .filter(
      (member) =>
        member.character &&
        member.name,
    )
    .map((member) => ({
      character_name: member.character,
      actor_name: member.name,
      media_id: details.id,
      media_type: type,
      media_title:
        details.title || details.name,
      profile_path: member.profile_path,
    }));

  if (!characters.length) {
    return Promise.resolve();
  }

  // Ponto de extensão para a futura
  // indexação no Supabase.
  return Promise.resolve();
}
