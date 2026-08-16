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

export async function PATCH(
  req:
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
    const {
      data:
        current,
      error:
        currentError,
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
          is_rewatch
        `)
        .eq(
          "id",
          id
        )
        .eq(
          "user_id",
          user.id
        )
        .single();

    if (
      currentError ||
      !current
    ) {
      return NextResponse.json(
        {
          error:
            "Visualização não encontrada.",
        },
        {
          status:
            404,
        }
      );
    }

    const body =
      await req.json();

    const update:
      Record<
        string,
        any
      > = {
        updated_at:
          new Date()
            .toISOString(),
      };

    if (
      body.watched_at !==
      undefined
    ) {
      const date =
        new Date(
          String(
            body.watched_at
          )
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Data inválida.",
          },
          {
            status:
              400,
          }
        );
      }

      update.watched_at =
        date.toISOString();
    }

    if (
      body.rating !==
      undefined
    ) {
      update.rating =
        parseRating(
          body.rating
        );
    }

    if (
      body.comment !==
      undefined
    ) {
      update.comment =
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
    }

    if (
      body.is_rewatch !==
      undefined
    ) {
      update.is_rewatch =
        Boolean(
          body.is_rewatch
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
        .update(
          update
        )
        .eq(
          "id",
          id
        )
        .eq(
          "user_id",
          user.id
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
        .single();

    if (
      error ||
      !data
    ) {
      throw (
        error ||
        new Error(
          "Não foi possível atualizar."
        )
      );
    }

    /*
     * Se esta ainda é a visualização mais recente,
     * sincronizamos watched_at e a nota atual.
     */
    const {
      data:
        latest,
    } =
      await s
        .from(
          "watch_entries"
        )
        .select(
          "id, watched_at, rating, is_rewatch"
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "library_item_id",
          current.library_item_id
        )
        .order(
          "watched_at",
          {
            ascending:
              false,
          }
        )
        .limit(
          1
        )
        .maybeSingle();

    if (
      latest
    ) {
      const patch:
        Record<
          string,
          any
        > = {
          watched_at:
            latest.watched_at,

          updated_at:
            new Date()
              .toISOString(),
        };

      if (
        latest.rating !==
        null
      ) {
        patch.personal_rating =
          latest.rating;
      }

      await s
        .from(
          "library_items"
        )
        .update(
          patch
        )
        .eq(
          "id",
          current.library_item_id
        )
        .eq(
          "user_id",
          user.id
        );
    }

    /*
     * Atualiza o evento do Diário ligado
     * à visualização, se ele existir.
     */
    await s
      .from(
        "activity_events"
      )
      .update({
        occurred_at:
          data.watched_at,

        metadata: {
          watch_entry_id:
            data.id,

          rating:
            data.rating,

          comment:
            data.comment,

          is_rewatch:
            data.is_rewatch,
        },
      })
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "event_type",
        "watch_logged"
      )
      .contains(
        "metadata",
        {
          watch_entry_id:
            data.id,
        }
      );

    return NextResponse.json(
      data
    );
  } catch (
  error
) {
  if (
    error instanceof Error &&
    error.message ===
      "A nota precisa estar entre 0 e 10."
  ) {
    return entradaInvalida(
      error.message,
    );
  }

  return respostaDeErro(
    error,
    "PATCH /api/watch-history/[id]",
  );
}
}

export async function DELETE(
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

  const {
    data:
      current,
    error:
      currentError,
  } =
    await s
      .from(
        "watch_entries"
      )
      .select(
        "id, library_item_id"
      )
      .eq(
        "id",
        id
      )
      .eq(
        "user_id",
        user.id
      )
      .single();

  if (
    currentError ||
    !current
  ) {
    return NextResponse.json(
      {
        error:
          "Visualização não encontrada.",
      },
      {
        status:
          404,
      }
    );
  }

  const {
    error,
  } =
    await s
      .from(
        "watch_entries"
      )
      .delete()
      .eq(
        "id",
        id
      )
      .eq(
        "user_id",
        user.id
      );

  if (error) {
  return respostaDeErro(
    error,
    "DELETE /api/watch-history/[id]",
  );
}

  /*
   * Remove o evento correspondente do Diário.
   */
  await s
    .from(
      "activity_events"
    )
    .delete()
    .eq(
      "user_id",
      user.id
    )
    .eq(
      "event_type",
      "watch_logged"
    )
    .contains(
      "metadata",
      {
        watch_entry_id:
          id,
      }
    );

  const {
    data:
      remaining,
  } =
    await s
      .from(
        "watch_entries"
      )
      .select(
        "watched_at, rating, is_rewatch"
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "library_item_id",
        current.library_item_id
      )
      .order(
        "watched_at",
        {
          ascending:
            false,
        }
      );

  const latest =
    remaining?.[
      0
    ] ||
    null;

  const rewatchCount =
    (
      remaining ||
      []
    ).filter(
      (
        item
      ) =>
        item.is_rewatch
    ).length;

  const patch:
    Record<
      string,
      any
    > = {
      watched_at:
        latest?.watched_at ||
        null,

      rewatch_count:
        rewatchCount,

      updated_at:
        new Date()
          .toISOString(),
    };

  if (
    latest?.rating !==
    null &&
    latest?.rating !==
    undefined
  ) {
    patch.personal_rating =
      latest.rating;
  }

  await s
    .from(
      "library_items"
    )
    .update(
      patch
    )
    .eq(
      "id",
      current.library_item_id
    )
    .eq(
      "user_id",
      user.id
    );

  return NextResponse.json({
    ok:
      true,
  });
}