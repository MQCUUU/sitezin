import {
  NextRequest,
  NextResponse,
} from "next/server";

import { respostaDeErro } from "@/lib/api-error";

import {
  createClient,
} from "@/lib/supabase/server";

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

      const {
        data:
          savedMedia,
        error:
          mediaError,
      } =
        await s
          .from(
            "media"
          )
          .upsert(
            {
              tmdb_id:
                media.tmdb_id,

              media_type:
                media.media_type,

              title:
                media.title ||
                "Sem título",

              original_title:
                media.original_title ??
                null,

              overview:
                media.overview ??
                null,

              poster_path:
                media.poster_path ??
                null,

              backdrop_path:
                media.backdrop_path ??
                null,

              release_date:
                media.release_date ??
                null,

              first_air_date:
                media.first_air_date ??
                null,

              genres:
                genres(
                  media.genres
                ),

              tmdb_rating:
                media.tmdb_rating ??
                null,

              tmdb_vote_count:
                media.tmdb_vote_count ??
                null,

              runtime:
                media.runtime ??
                null,

              seasons_count:
                media.seasons_count ??
                null,

              episodes_count:
                media.episodes_count ??
                null,

              creator_names:
                media.creator_names ||
                [],

              cast_names:
                media.cast_names ||
                [],

              raw:
                media.raw ||
                media,
            },
            {
              onConflict:
                "tmdb_id,media_type",
            }
          )
          .select(
            "id"
          )
          .single();

      if (
        mediaError ||
        !savedMedia
      ) {
        throw new Error(
          mediaError
            ?.message ||
          `Erro restaurando ${media.title}.`
        );
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

      const {
        data:
          savedLibrary,
        error:
          libraryError,
      } =
        await s
          .from(
            "library_items"
          )
          .upsert(
            payload,
            {
              onConflict:
                "user_id,media_id",
            }
          )
          .select(
            "id"
          )
          .single();

      if (
        libraryError ||
        !savedLibrary
      ) {
        throw new Error(
          libraryError
            ?.message ||
          `Erro restaurando ${media.title}.`
        );
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

      const {
        error,
      } =
        await s
          .from(
            "user_hidden_titles"
          )
          .upsert(
            {
              user_id:
                user.id,

              tmdb_id:
                item.tmdb_id,

              media_type:
                item.media_type,

              reason:
                item.reason ||
                "not_interested",

              created_at:
                item.created_at ||
                new Date()
                  .toISOString(),
            },
            {
              onConflict:
                "user_id,tmdb_id,media_type",
            }
          );

      if (
        !error
      ) {
        hiddenCount++;
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

      const {
        error,
      } =
        await s
          .from(
            "watch_entries"
          )
          .upsert(
            payload,
            {
              onConflict:
                "id",
            }
          );

      if (
        !error
      ) {
        watchCount++;
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

      const {
        error,
      } =
        await s
          .from(
            "activity_events"
          )
          .upsert(
            {
              id:
                event.id,

              user_id:
                user.id,

              media_id:
                newMediaId,

              library_item_id:
                newLibraryId,

              event_type:
                event.event_type,

              metadata:
                event.metadata ||
                {},

              occurred_at:
                event.occurred_at,
            },
            {
              onConflict:
                "id",
            }
          );

      if (
        !error
      ) {
        activityCount++;
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