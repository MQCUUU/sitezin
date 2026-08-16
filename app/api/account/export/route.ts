import {
  NextRequest,
  NextResponse,
} from "next/server";

import { respostaDeErro } from "@/lib/api-error";

import {
  createClient,
} from "@/lib/supabase/server";

function csvEscape(
  value:
    unknown
) {
  const text =
    value ===
      null ||
    value ===
      undefined
      ? ""
      : typeof value ===
          "object"
        ? JSON.stringify(
            value
          )
        : String(
            value
          );

  return `"${text.replace(
    /"/g,
    '""'
  )}"`;
}

export async function GET(
  req:
    NextRequest
) {
  const s =
    await createClient();

  const {
    data: {
      user,
    },
  } =
    await s.auth
      .getUser();

  if (
    !user
  ) {
    return NextResponse.json(
      {
        error:
          "Não autenticado",
      },
      {
        status:
          401,
      }
    );
  }

  const format =
    new URL(
      req.url
    ).searchParams.get(
      "format"
    ) ===
    "csv"
      ? "csv"
      : "json";

  const {
    data:
      library,
    error:
      libraryError,
  } =
    await s
      .from(
        "library_items"
      )
      .select(`
        id,
        status,
        favorite,
        personal_rating,
        review,
        watched_at,
        rewatch_count,
        current_season,
        completed_seasons,
        stopped_season,
        added_at,
        updated_at,
        media:media_id(*)
      `)
      .eq(
        "user_id",
        user.id
      )
      .order(
        "added_at",
        {
          ascending:
            true,
        }
      );

  if (libraryError) {
  return respostaDeErro(
    libraryError,
    "GET /api/account/export",
  );
}

  if (
    format ===
    "csv"
  ) {
    const headers = [
      "type",
      "tmdb_id",
      "title",
      "status",
      "favorite",
      "personal_rating",
      "review",
      "watched_at",
      "rewatch_count",
      "current_season",
      "completed_seasons",
      "stopped_season",
      "added_at",
      "release_date",
      "first_air_date",
      "genres",
    ];

    const rows =
      (
        library ||
        []
      ).map(
        (
          item:
            any
        ) => [
          item.media
            ?.media_type,
          item.media
            ?.tmdb_id,
          item.media
            ?.title,
          item.status,
          item.favorite,
          item.personal_rating,
          item.review,
          item.watched_at,
          item.rewatch_count,
          item.current_season,
          item.completed_seasons,
          item.stopped_season,
          item.added_at,
          item.media
            ?.release_date,
          item.media
            ?.first_air_date,
          item.media
            ?.genres,
        ]
          .map(
            csvEscape
          )
          .join(
            ","
          )
      );

    const csv =
      [
        headers.join(
          ","
        ),
        ...rows,
      ].join(
        "\n"
      );

    return new NextResponse(
      "\uFEFF" +
      csv,
      {
        headers: {
          "Content-Type":
            "text/csv; charset=utf-8",

          "Content-Disposition":
            `attachment; filename="mycatalog-library-${new Date()
              .toISOString()
              .slice(0, 10)}.csv"`,

          "Cache-Control":
            "private, no-store",
        },
      }
    );
  }

  async function optionalTable(
    table:
      string,
    select:
      string
  ) {
    const {
      data,
      error,
    } =
      await s
        .from(
          table
        )
        .select(
          select
        )
        .eq(
          "user_id",
          user!.id
        );

    if (
      error
    ) {
      console.warn(
        `Backup: ${table} indisponível:`,
        error.message
      );

      return [];
    }

    return data ||
      [];
  }

  const [
    watchHistory,
    hiddenTitles,
    activityEvents,
  ] =
    await Promise.all([
      optionalTable(
        "watch_entries",
        "*"
      ),

      optionalTable(
        "user_hidden_titles",
        "*"
      ),

      optionalTable(
        "activity_events",
        "*"
      ),
    ]);

  const backup = {
    mycatalog_backup:
      true,

    version:
      1,

    exported_at:
      new Date()
        .toISOString(),

    account: {
      id:
        user.id,

      email:
        user.email ||
        null,

      metadata:
        user.user_metadata ||
        {},
    },

    data: {
      library:
        library ||
        [],

      watch_history:
        watchHistory,

      hidden_titles:
        hiddenTitles,

      activity_events:
        activityEvents,
    },
  };

  return NextResponse.json(
    backup,
    {
      headers: {
        "Content-Disposition":
          `attachment; filename="mycatalog-backup-${new Date()
            .toISOString()
            .slice(0, 10)}.json"`,

        "Cache-Control":
          "private, no-store",
      },
    }
  );
}