import { NextRequest, NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { BACKUP_VERSION, csvCell } from "@/lib/backup/plan";

/*
 * GET /api/account/export?format=json|csv — cópia dos dados do usuário da
 * sessão. Nunca inclui senha/hash, token, sessão ou segredo.
 *
 * V3.3:
 *  - JSON versão 2: + progresso de episódios; visualizações/atividade levam
 *    (tmdb_id, media_type) para o restore não depender de ids internos;
 *    `account` traz só o e-mail do próprio dono (sem id interno);
 *  - CSV: ano de lançamento real (a coluna `release_year` não existe em
 *    `media` e saía sempre vazia), temporadas concluídas (é um número, não
 *    uma lista — também saía vazia) e proteção contra fórmula (CSV injection).
 */

export async function GET(req: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
    const sql = getDb();
    const stamp = new Date().toISOString().slice(0, 10);

    const library = await sql`
      SELECT
        li.id,
        li.status,
        li.favorite,
        li.personal_rating,
        li.review,
        li.watched_at,
        li.watched_at_precision,
        li.rewatch_count,
        li.current_season,
        li.completed_seasons,
        li.stopped_season,
        li.added_at,
        li.updated_at,
        (to_jsonb(m.*) - 'raw') AS media
      FROM public.library_items li
      LEFT JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${user.id}
      ORDER BY li.added_at ASC
    `;

    if (format === "csv") {
      const headers = [
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

      const rows = (library as Record<string, any>[]).map((item) => {
        const media = item.media || {};
        const release = String(media.release_date || media.first_air_date || "");

        return [
          media.tmdb_id ?? "",
          media.media_type ?? "",
          media.title ?? "",
          release ? Number(release.slice(0, 4)) : "",
          item.status,
          Boolean(item.favorite),
          item.personal_rating === null ? "" : Number(item.personal_rating),
          item.review ?? "",
          item.watched_at ?? "",
          Number(item.rewatch_count ?? 0),
          item.current_season ?? "",
          Number(item.completed_seasons ?? 0),
          item.stopped_season ?? "",
          item.added_at,
          item.updated_at,
        ]
          .map(csvCell)
          .join(",");
      });

      return new NextResponse("﻿" + [headers.join(","), ...rows].join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="mycatalog-library-${stamp}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const [watchHistory, episodesProgress, hiddenTitles, activityEvents] = await Promise.all([
      sql`
        SELECT we.id, we.library_item_id, we.media_id, m.tmdb_id, m.media_type, we.watched_at, we.watched_at_precision,
               we.rating, we.comment, we.is_rewatch, we.created_at, we.updated_at
        FROM public.watch_entries we
        JOIN public.media m ON m.id = we.media_id
        WHERE we.user_id = ${user.id}
        ORDER BY we.watched_at
      `,
      sql`
        SELECT m.tmdb_id, m.media_type, ep.season_number, ep.episode_number, ep.watched, ep.watched_at,
               ep.watched_at_precision, ep.comment, ep.is_rewatch
        FROM public.episodes_progress ep
        JOIN public.media m ON m.id = ep.media_id
        WHERE ep.user_id = ${user.id}
        ORDER BY m.tmdb_id, ep.season_number, ep.episode_number
      `,
      sql`
        SELECT tmdb_id::int AS tmdb_id, media_type, reason, created_at
        FROM public.user_hidden_titles
        WHERE user_id = ${user.id}
        ORDER BY created_at
      `,
      sql`
        SELECT ae.event_type, ae.metadata, ae.occurred_at, ae.media_id, ae.library_item_id, m.tmdb_id, m.media_type
        FROM public.activity_events ae
        LEFT JOIN public.media m ON m.id = ae.media_id
        WHERE ae.user_id = ${user.id}
        ORDER BY ae.occurred_at
      `,
    ]);

    const backup = {
      mycatalog_backup: true,
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      account: { email: user.email || null },
      data: {
        library: library || [],
        watch_history: watchHistory,
        episodes_progress: episodesProgress,
        hidden_titles: hiddenTitles,
        activity_events: activityEvents,
      },
    };

    return NextResponse.json(backup, {
      headers: {
        "Content-Disposition": `attachment; filename="mycatalog-backup-${stamp}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/account/export");
  }
}
