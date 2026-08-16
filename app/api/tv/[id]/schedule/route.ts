import {
  NextRequest,
  NextResponse,
} from "next/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

function dateOnly(
  value:
    string |
    null |
    undefined
) {
  if (!value) {
    return null;
  }

  return String(
    value
  ).slice(
    0,
    10
  );
}

function todayKey() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10
    );
}

export async function GET(
  _:
    NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id:
        string;
    }>;
  }
) {
  const {
    id,
  } =
    await params;

  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "TMDB_API_KEY não configurada",
      },
      {
        status:
          500,
      }
    );
  }

  const tvId =
    Number(id);

  if (
    !Number.isFinite(
      tvId
    )
  ) {
    return NextResponse.json(
      {
        error:
          "ID inválido.",
      },
      {
        status:
          400,
      }
    );
  }

  const language =
    process.env.TMDB_LANGUAGE ||
    "pt-BR";

  async function tmdb(
    path:
      string
  ) {
    const response =
      await fetch(
        `${TMDB_BASE}${path}${
          path.includes("?")
            ? "&"
            : "?"
        }api_key=${encodeURIComponent(
          apiKey!
        )}`,
        {
          next: {
            revalidate:
              21600,
          },
        }
      );

    if (
      !response.ok
    ) {
      return null;
    }

    return response.json();
  }

  const details =
    await tmdb(
      `/tv/${tvId}?language=${encodeURIComponent(
        language
      )}`
    );

  if (!details) {
    return NextResponse.json(
      {
        error:
          "Série não encontrada.",
      },
      {
        status:
          404,
      }
    );
  }

  const nextEpisode =
    details
      .next_episode_to_air ||
    null;

  const nextSeason =
    Array.isArray(
      details.seasons
    )
      ? details.seasons
          .filter(
            (
              season:
                any
            ) =>
              Number(
                season.season_number
              ) >
                0 &&
              season.air_date &&
              dateOnly(
                season.air_date
              )! >=
                todayKey()
          )
          .sort(
            (
              a:
                any,
              b:
                any
            ) =>
              String(
                a.air_date
              ).localeCompare(
                String(
                  b.air_date
                )
              )
          )[0] ||
        null
      : null;

  const seasonNumbers =
    Array.from(
      new Set(
        [
          nextEpisode
            ?.season_number,
          nextSeason
            ?.season_number,
        ]
          .map(
            Number
          )
          .filter(
            (
              value
            ) =>
              Number.isFinite(
                value
              ) &&
              value >
                0
          )
      )
    );

  const seasonData =
    await Promise.all(
      seasonNumbers.map(
        async (
          seasonNumber
        ) => {
          const data =
            await tmdb(
              `/tv/${tvId}/season/${seasonNumber}?language=${encodeURIComponent(
                language
              )}`
            );

          return {
            seasonNumber,
            data,
          };
        }
      )
    );

  const upcomingMap =
    new Map<
      string,
      any
    >();

  for (
    const {
      seasonNumber,
      data,
    }
    of seasonData
  ) {
    for (
      const episode
      of (
        Array.isArray(
          data?.episodes
        )
          ? data.episodes
          : []
      )
    ) {
      const airDate =
        dateOnly(
          episode.air_date
        );

      if (
        !airDate ||
        airDate <
          todayKey()
      ) {
        continue;
      }

      const key =
        `${seasonNumber}-${episode.episode_number}`;

      upcomingMap.set(
        key,
        {
          id:
            episode.id,

          season_number:
            seasonNumber,

          episode_number:
            Number(
              episode.episode_number
            ),

          name:
            episode.name ||
            `Episódio ${episode.episode_number}`,

          overview:
            episode.overview ||
            "",

          air_date:
            airDate,

          runtime:
            Number(
              episode.runtime ||
                0
            ) ||
            null,

          still_path:
            episode.still_path ||
            null,

          vote_average:
            Number(
              episode.vote_average ||
                0
            ) ||
            null,
        }
      );
    }
  }

  /*
   * Garante que next_episode_to_air apareça
   * mesmo se o endpoint da temporada ainda
   * não tiver retornado a lista completa.
   */
  if (
    nextEpisode
      ?.air_date
  ) {
    const key =
      `${nextEpisode.season_number}-${nextEpisode.episode_number}`;

    if (
      !upcomingMap.has(
        key
      )
    ) {
      upcomingMap.set(
        key,
        {
          id:
            nextEpisode.id,

          season_number:
            Number(
              nextEpisode.season_number
            ),

          episode_number:
            Number(
              nextEpisode.episode_number
            ),

          name:
            nextEpisode.name ||
            `Episódio ${nextEpisode.episode_number}`,

          overview:
            nextEpisode.overview ||
            "",

          air_date:
            dateOnly(
              nextEpisode.air_date
            ),

          runtime:
            Number(
              nextEpisode.runtime ||
                0
            ) ||
            null,

          still_path:
            nextEpisode.still_path ||
            null,

          vote_average:
            Number(
              nextEpisode.vote_average ||
                0
            ) ||
            null,
        }
      );
    }
  }

  const upcoming =
    Array.from(
      upcomingMap.values()
    )
      .sort(
        (
          a,
          b
        ) => {
          const dateCompare =
            String(
              a.air_date
            ).localeCompare(
              String(
                b.air_date
              )
            );

          if (
            dateCompare !==
            0
          ) {
            return dateCompare;
          }

          return (
            Number(
              a.episode_number
            ) -
            Number(
              b.episode_number
            )
          );
        }
      )
      .slice(
        0,
        14
      );

  return NextResponse.json(
    {
      id:
        details.id,

      name:
        details.name,

      status:
        details.status ||
        null,

      in_production:
        Boolean(
          details.in_production
        ),

      number_of_seasons:
        Number(
          details.number_of_seasons ||
            0
        ),

      number_of_episodes:
        Number(
          details.number_of_episodes ||
            0
        ),

      last_episode_to_air:
        details
          .last_episode_to_air ||
        null,

      next_episode_to_air:
        nextEpisode,

      next_season:
        nextSeason,

      upcoming,
    },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=3600, stale-while-revalidate=21600",
      },
    }
  );
}