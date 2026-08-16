import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  entradaInvalida,
  respostaDeErro,
} from "@/lib/api-error";

import {
  createClient,
} from "@/lib/supabase/server";

function parseRating(
  value:
    unknown
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const rating =
    Number(value);

  if (
    !Number.isFinite(
      rating
    ) ||
    rating <
      0 ||
    rating >
      10
  ) {
    throw new Error(
      "A nota precisa estar entre 0 e 10."
    );
  }

  return Math.round(
    rating *
      2
  ) /
    2;
}

function parseDate(
  value:
    unknown
) {
  if (
    !value
  ) {
    return new Date()
      .toISOString();
  }

  const date =
    new Date(
      String(value)
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      "Data de visualização inválida."
    );
  }

  return date.toISOString();
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
    await s.auth.getUser();

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

  const url =
    new URL(
      req.url
    );

  const libraryId =
    (
      url.searchParams.get(
        "library_id"
      ) ||
      ""
    ).trim();

  if (
    !libraryId
  ) {
    return NextResponse.json(
      {
        error:
          "library_id é obrigatório.",
      },
      {
        status:
          400,
      }
    );
  }

  const {
    data:
      libraryItem,
    error:
      libraryError,
  } =
    await s
      .from(
        "library_items"
      )
      .select(
        "id"
      )
      .eq(
        "id",
        libraryId
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (
    libraryError ||
    !libraryItem
  ) {
    return NextResponse.json(
      {
        error:
          "Item da biblioteca não encontrado.",
      },
      {
        status:
          404,
      }
    );
  }

  const {
    data,
    error,
  } =
    await s
      .from(
        "watch_entries"
      )
      .select(`
        id,
        library_item_id,
        media_id,
        watched_at,
        rating,
        comment,
        is_rewatch,
        created_at,
        updated_at
      `)
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "library_item_id",
        libraryId
      )
      .order(
        "watched_at",
        {
          ascending:
            false,
        }
      );

  if (error) {
  return respostaDeErro(
    error,
    "GET /api/watch-history",
  );
}

  return NextResponse.json(
    data ||
    [],
    {
      headers: {
        "Cache-Control":
          "private, no-store",
      },
    }
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
    await s.auth.getUser();

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
    const body =
      await req.json();

    const libraryId =
      String(
        body.library_id ||
          ""
      ).trim();

    if (
      !libraryId
    ) {
      return NextResponse.json(
        {
          error:
            "library_id é obrigatório.",
        },
        {
          status:
            400,
        }
      );
    }

    const {
      data:
        libraryItem,
      error:
        libraryError,
    } =
      await s
        .from(
          "library_items"
        )
        .select(`
          id,
          media_id,
          status,
          rewatch_count,
          personal_rating,
          watched_at,
          media:media_id(
            media_type
          )
        `)
        .eq(
          "id",
          libraryId
        )
        .eq(
          "user_id",
          user.id
        )
        .single();

    if (
      libraryError ||
      !libraryItem
    ) {
      return NextResponse.json(
        {
          error:
            libraryError
              ?.message ||
            "Item da biblioteca não encontrado.",
        },
        {
          status:
            404,
        }
      );
    }

    const watchedAt =
      parseDate(
        body.watched_at
      );

    const rating =
      parseRating(
        body.rating
      );

    const comment =
      typeof body.comment ===
        "string"
        ? body.comment
            .trim()
            .slice(
              0,
              4000
            ) ||
          null
        : null;

    const {
      count:
        previousCount,
      error:
        countError,
    } =
      await s
        .from(
          "watch_entries"
        )
        .select(
          "id",
          {
            count:
              "exact",
            head:
              true,
          }
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "library_item_id",
          libraryId
        );

    if (
      countError
    ) {
      throw countError;
    }

    /*
     * A primeira sessão é visualização normal.
     * Da segunda em diante é reassistida.
     *
     * O cliente pode sobrescrever explicitamente
     * se necessário.
     */
    const isRewatch =
      typeof body.is_rewatch ===
        "boolean"
        ? body.is_rewatch
        : Number(
            previousCount ||
              0
          ) >
          0;

    const {
      data:
        entry,
      error:
        entryError,
    } =
      await s
        .from(
          "watch_entries"
        )
        .insert({
          user_id:
            user.id,

          library_item_id:
            libraryItem.id,

          media_id:
            libraryItem.media_id,

          watched_at:
            watchedAt,

          rating,

          comment,

          is_rewatch:
            isRewatch,
        })
        .select(`
          id,
          library_item_id,
          media_id,
          watched_at,
          rating,
          comment,
          is_rewatch,
          created_at,
          updated_at
        `)
        .single();

    if (
      entryError ||
      !entry
    ) {
      throw (
        entryError ||
        new Error(
          "Não foi possível registrar a visualização."
        )
      );
    }

    const nextRewatchCount =
      Math.max(
        Number(
          libraryItem
            .rewatch_count ||
            0
        ),
        isRewatch
          ? Number(
              previousCount ||
                0
            )
          : 0
      );

    const libraryUpdate:
      Record<
        string,
        any
      > = {
        watched_at:
          watchedAt,

        status:
          isRewatch
            ? "rewatched"
            : "watched",

        rewatch_count:
          nextRewatchCount,

        updated_at:
          new Date()
            .toISOString(),
      };

    /*
     * A nota da sessão passa a ser também
     * a nota atual do título. O histórico
     * mantém as notas antigas intactas.
     */
    if (
      rating !==
      null
    ) {
      libraryUpdate
        .personal_rating =
        rating;
    }

    const {
      data:
        updatedLibrary,
      error:
        updateError,
    } =
      await s
        .from(
          "library_items"
        )
        .update(
          libraryUpdate
        )
        .eq(
          "id",
          libraryId
        )
        .eq(
          "user_id",
          user.id
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
        .single();

    if (
      updateError
    ) {
      /*
       * A sessão já foi salva. Não apagamos
       * o histórico por uma falha secundária
       * ao sincronizar library_items.
       */
      console.error(
        "Erro ao sincronizar library_items:",
        updateError.message
      );
    }

    const {
      error:
        activityError,
    } =
      await s
        .from(
          "activity_events"
        )
        .insert({
          user_id:
            user.id,

          media_id:
            libraryItem.media_id,

          library_item_id:
            libraryItem.id,

          event_type:
            "watch_logged",

          occurred_at:
            watchedAt,

          metadata: {
            watch_entry_id:
              entry.id,

            rating,

            comment,

            is_rewatch:
              isRewatch,

            watch_number:
              Number(
                previousCount ||
                  0
              ) +
              1,
          },
        });

    if (
      activityError
    ) {
      console.error(
        "Erro ao registrar visualização no Diário:",
        activityError.message
      );
    }

    return NextResponse.json(
      {
        entry,

        library_item:
          updatedLibrary ||
          null,
      },
      {
        status:
          201,
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Erro em POST /api/watch-history:",
      error
    );

    if (
    error instanceof Error &&
    (
      error.message ===
        "A nota precisa estar entre 0 e 10." ||
      error.message ===
        "Data de visualização inválida."
    )
  ) {
    return entradaInvalida(
      error.message,
    );
  }

  return respostaDeErro(
    error,
    "POST /api/watch-history",
  );
  }
}