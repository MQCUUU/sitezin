import { getDb } from "@/lib/db/neon";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { respostaDeErro } from "@/lib/api-error";

import { auth } from "@/lib/auth/server";

import {
  InvalidJsonError,
  readJsonWithLimit,
  RequestBodyTooLargeError
} from "@/lib/request-json";

const MAX_BACKUP_BYTES =
  10 * 1024 * 1024;

function genres(
  value:
    any
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value
    .map(
      (
        item
      ) =>
        typeof item ===
          "string"
          ? item
          : item?.name
            ? {
                id:
                  item.id ??
                  null,

                name:
                  item.name,
              }
            : null
    )
    .filter(
      Boolean
    );
}

export async function POST(
  req:
    NextRequest
) {
  const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const sql = getDb();

  try {
    const backup =
  await readJsonWithLimit<any>(
    req,
    MAX_BACKUP_BYTES
  );

    if (
      !backup
        ?.mycatalog_backup ||
      Number(
        backup.version
      ) !==
        1 ||
      !backup.data
    ) {
      return NextResponse.json(
        {
          error:
            "Este arquivo não é um backup válido do MyCatalog.",
        },
        {
          status:
            400,
        }
      );
    }

    const library =
      Array.isArray(
        backup.data
          .library
      )
        ? backup.data
            .library
        : [];

    const oldMediaToNew =
      new Map<
        string,
        string
      >();

    const oldLibraryToNew =
      new Map<
        string,
        string
      >();

    let libraryCount =
      0;

    for (
      const item
      of library
    ) {
      const media =
        item?.media;

      if (
        !media
          ?.tmdb_id ||
        !media
          ?.media_type
      ) {
        continue;
      }


      const savedMediaRows = await sql`
        INSERT INTO public.media (
          tmdb_id, media_type, title, original_title, overview, poster_path, backdrop_path,
          release_date, first_air_date, genres, tmdb_rating, tmdb_vote_count, runtime,
          seasons_count, episodes_count, creator_names, cast_names, raw, updated_at
        )
        VALUES (
          ${media.tmdb_id}, ${media.media_type}, ${media.title || "Sem título"},
          ${media.original_title ?? null}, ${media.overview ?? null}, ${media.poster_path ?? null},
          ${media.backdrop_path ?? null}, ${media.release_date ?? null}, ${media.first_air_date ?? null},
          ${genres(media.genres)}, ${media.tmdb_rating ?? null}, ${media.tmdb_vote_count ?? null},
          ${media.runtime ?? null}, ${media.seasons_count ?? null}, ${media.episodes_count ?? null},
          ${media.creator_names || []}, ${media.cast_names || []}, ${JSON.stringify(media.raw || media)}, now()
        )
        ON CONFLICT (tmdb_id, media_type)
        DO UPDATE SET
          title = EXCLUDED.title,
          original_title = COALESCE(EXCLUDED.original_title, media.original_title),
          overview = COALESCE(EXCLUDED.overview, media.overview),
          poster_path = COALESCE(EXCLUDED.poster_path, media.poster_path),
          backdrop_path = COALESCE(EXCLUDED.backdrop_path, media.backdrop_path),
          genres = COALESCE(EXCLUDED.genres, media.genres),
          updated_at = now()
        RETURNING id
      `;

      const savedMedia = savedMediaRows[0];
      if (!savedMedia) {
        throw new Error(`Erro restaurando ${media.title}.`);
      }

      if (
        media.id
      ) {
        oldMediaToNew.set(
          String(
            media.id
          ),
          String(
            savedMedia.id
          )
        );
      }

      const payload:
        Record<
          string,
          any
        > = {
          user_id:
            user.id,

          media_id:
            savedMedia.id,

          status:
            item.status ||
            "want",

          favorite:
            Boolean(
              item.favorite
            ),

          personal_rating:
            item.personal_rating ??
            null,

          review:
            item.review ??
            null,

          watched_at:
            item.watched_at ??
            null,

          rewatch_count:
            Number(
              item.rewatch_count ||
                0
            ),

          current_season:
            item.current_season ??
            null,

          completed_seasons:
            Number(
              item.completed_seasons ||
                0
            ),

          stopped_season:
            item.stopped_season ??
            null,
        };

      if (
        item.added_at
      ) {
        payload.added_at =
          item.added_at;
      }

      if (
        item.updated_at
      ) {
        payload.updated_at =
          item.updated_at;
      }


      const savedLibraryRows = await sql`
        INSERT INTO public.library_items (
          user_id, media_id, status, favorite, personal_rating, review,
          watched_at, rewatch_count, current_season, completed_seasons, stopped_season, added_at, updated_at
        )
        VALUES (
          ${user.id}, ${savedMedia.id}, ${payload.status}, ${payload.favorite},
          ${payload.personal_rating ?? null}, ${payload.review ?? null}, ${payload.watched_at ?? null},
          ${payload.rewatch_count ?? 0}, ${payload.current_season ?? null}, ${payload.completed_seasons ?? []},
          ${payload.stopped_season ?? null}, ${payload.added_at || new Date().toISOString()}, ${payload.updated_at || new Date().toISOString()}
        )
        ON CONFLICT (user_id, media_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          favorite = EXCLUDED.favorite,
          personal_rating = EXCLUDED.personal_rating,
          review = EXCLUDED.review,
          watched_at = EXCLUDED.watched_at,
          rewatch_count = EXCLUDED.rewatch_count,
          current_season = EXCLUDED.current_season,
          completed_seasons = EXCLUDED.completed_seasons,
          stopped_season = EXCLUDED.stopped_season,
          updated_at = EXCLUDED.updated_at
        RETURNING id
      `;

      const savedLibrary = savedLibraryRows[0];
      if (!savedLibrary) {
        throw new Error(`Erro restaurando ${media.title}.`);
      }

      if (
        item.id
      ) {
        oldLibraryToNew.set(
          String(
            item.id
          ),
          String(
            savedLibrary.id
          )
        );
      }

      libraryCount++;
    }

    let hiddenCount =
      0;

    const hidden =
      Array.isArray(
        backup.data
          .hidden_titles
      )
        ? backup.data
            .hidden_titles
        : [];

    for (
      const item
      of hidden
    ) {
      if (
        !item
          ?.tmdb_id ||
        !item
          ?.media_type
      ) {
        continue;
      }

      try {

        await sql`
          INSERT INTO public.user_hidden_titles (
            user_id, tmdb_id, media_type, reason, created_at
          )
          VALUES (
            ${user.id},
            ${item.tmdb_id},
            ${item.media_type},
            ${item.reason || "not_interested"},
            ${item.created_at || new Date().toISOString()}
          )
          ON CONFLICT (user_id, tmdb_id, media_type)
          DO UPDATE SET
            reason = EXCLUDED.reason,
            created_at = EXCLUDED.created_at
        `;
        hiddenCount++;
      } catch (err: any) {
        console.error("Erro ao importar hidden title:", err?.message);
      }
    }

    let watchCount =
      0;

    const watches =
      Array.isArray(
        backup.data
          .watch_history
      )
        ? backup.data
            .watch_history
        : [];

    for (
      const entry
      of watches
    ) {
      const newLibraryId =
        oldLibraryToNew.get(
          String(
            entry
              .library_item_id ||
              ""
          )
        );

      const newMediaId =
        oldMediaToNew.get(
          String(
            entry
              .media_id ||
              ""
          )
        );

      if (
        !newLibraryId ||
        !newMediaId
      ) {
        continue;
      }

      const payload = {
        id:
          entry.id,

        user_id:
          user.id,

        library_item_id:
          newLibraryId,

        media_id:
          newMediaId,

        watched_at:
          entry.watched_at,

        rating:
          entry.rating ??
          null,

        comment:
          entry.comment ??
          null,

        is_rewatch:
          Boolean(
            entry.is_rewatch
          ),

        created_at:
          entry.created_at,

        updated_at:
          entry.updated_at,
      };

      try {

        await sql`
          INSERT INTO public.watch_entries (
            id, user_id, library_item_id, media_id, watched_at,
            rating, comment, is_rewatch, created_at, updated_at
          )
          VALUES (
            ${payload.id},
            ${user.id},
            ${payload.library_item_id},
            ${payload.media_id},
            ${payload.watched_at},
            ${payload.rating},
            ${payload.comment},
            ${payload.is_rewatch},
            ${payload.created_at || new Date().toISOString()},
            ${payload.updated_at || new Date().toISOString()}
          )
          ON CONFLICT (id)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            library_item_id = EXCLUDED.library_item_id,
            media_id = EXCLUDED.media_id,
            watched_at = EXCLUDED.watched_at,
            rating = EXCLUDED.rating,
            comment = EXCLUDED.comment,
            is_rewatch = EXCLUDED.is_rewatch,
            updated_at = EXCLUDED.updated_at
        `;
        watchCount++;
      } catch (err: any) {
        console.error("Erro ao importar watch entry:", err?.message);
      }
    }

    let activityCount =
      0;

    const activities =
      Array.isArray(
        backup.data
          .activity_events
      )
        ? backup.data
            .activity_events
        : [];

    for (
      const event
      of activities
    ) {
      const newMediaId =
        oldMediaToNew.get(
          String(
            event.media_id ||
              ""
          )
        );

      if (
        !newMediaId
      ) {
        continue;
      }

      const newLibraryId =
        event.library_item_id
          ? oldLibraryToNew.get(
              String(
                event.library_item_id
              )
            ) ||
            null
          : null;

            try {

        await sql`
          INSERT INTO public.activity_events (
            id, user_id, media_id, library_item_id, event_type, metadata, occurred_at, created_at
          )
          VALUES (
            ${event.id || crypto.randomUUID()},
            ${user.id},
            ${newMediaId},
            ${newLibraryId},
            ${event.event_type},
            ${JSON.stringify(event.metadata || {})},
            ${event.occurred_at || new Date().toISOString()},
            ${new Date().toISOString()}
          )
          ON CONFLICT (id)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            media_id = EXCLUDED.media_id,
            library_item_id = EXCLUDED.library_item_id,
            event_type = EXCLUDED.event_type,
            metadata = EXCLUDED.metadata,
            occurred_at = EXCLUDED.occurred_at
        `;
        activityCount++;
      } catch (err: any) {
        console.error("Erro ao importar activity event:", err?.message);
      }
    }

    return NextResponse.json({
      ok:
        true,

      restored: {
        library:
          libraryCount,

        watch_history:
          watchCount,

        hidden_titles:
          hiddenCount,

        activity_events:
          activityCount,
      },
    });
  } catch (
    error
  ) {
    if (
  error instanceof
    RequestBodyTooLargeError
) {
  return NextResponse.json(
    {
      error: error.message
    },
    {
      status: 413
    }
  );
}

if (
  error instanceof
    InvalidJsonError
) {
  return NextResponse.json(
    {
      error: error.message
    },
    {
      status: 400
    }
  );
}

    console.error(
      "Erro ao importar backup:",
      error
    );

    return respostaDeErro(
  error,
  "POST /api/account/import",
);
  }
}