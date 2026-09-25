import { getDb } from "@/lib/db/neon";
import { auth } from "@/lib/auth/server";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { respostaDeErro } from "@/lib/api-error";

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
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (
      !user || !user.id
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

    const sql = getDb();
    const library = await sql`
      SELECT
        li.id,
        li.status,
        li.favorite,
        li.personal_rating,
        li.review,
        li.watched_at,
        li.rewatch_count,
        li.current_season,
        li.completed_seasons,
        li.stopped_season,
        li.added_at,
        li.updated_at,
        row_to_json(m.*) AS media
      FROM public.library_items li
      LEFT JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${user.id}
      ORDER BY li.added_at ASC
    `;

    if (format === "csv") {
      const headers = [
        "id",
        "tmdb_id",
        "media_type",
        "title",
        "release_year",
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
        "updated_at",
      ];

      const rows = (library || []).map((item: any) =>
        [
          csvEscape(item.id),
          csvEscape(item.media?.tmdb_id ?? ""),
          csvEscape(item.media?.media_type ?? ""),
          csvEscape(item.media?.title ?? ""),
          csvEscape(item.media?.release_year ?? ""),
          csvEscape(item.status),
          csvEscape(Boolean(item.favorite)),
          csvEscape(item.personal_rating ?? ""),
          csvEscape(item.review ?? ""),
          csvEscape(item.watched_at ?? ""),
          csvEscape(item.rewatch_count ?? 0),
          csvEscape(item.current_season ?? ""),
          csvEscape(
            Array.isArray(item.completed_seasons)
              ? item.completed_seasons.join(";")
              : ""
          ),
          csvEscape(item.stopped_season ?? ""),
          csvEscape(item.added_at),
          csvEscape(item.updated_at),
        ].join(",")
      );

      const csv = [headers.join(","), ...rows].join("\n");

      return new NextResponse("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="mycatalog-library-${new Date()
            .toISOString()
            .slice(0, 10)}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    async function optionalTable(table: string) {
      try {
        if (table === "watch_entries") {
          return await sql`SELECT * FROM public.watch_entries WHERE user_id = ${user!.id}`;
        }
        if (table === "user_hidden_titles") {
          return await sql`SELECT * FROM public.user_hidden_titles WHERE user_id = ${user!.id}`;
        }
        if (table === "activity_events") {
          return await sql`SELECT * FROM public.activity_events WHERE user_id = ${user!.id}`;
        }
        return [];
      } catch (err: any) {
        console.warn(`Backup: ${table} indisponível:`, err?.message);
        return [];
      }
    }

    const [watchHistory, hiddenTitles, activityEvents] = await Promise.all([
      optionalTable("watch_entries"),
      optionalTable("user_hidden_titles"),
      optionalTable("activity_events"),
    ]);

    const backup = {
      mycatalog_backup: true,
      version: 1,
      exported_at: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email || null,
        metadata: (user as any).user_metadata || {},
      },
      data: {
        library: library || [],
        watch_history: watchHistory,
        hidden_titles: hiddenTitles,
        activity_events: activityEvents,
      },
    };

    return NextResponse.json(backup, {
      headers: {
        "Content-Disposition": `attachment; filename="mycatalog-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/account/export");
  }
}
