import { NextResponse } from "next/server";
import { respostaDeErro } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const s = await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Não autenticado",
      },
      {
        status: 401,
      }
    );
  }

  try {
    const body = await req.json();

    /*
     * ==========================================
     * BUSCAR ITEM ATUAL
     * ==========================================
     */

    const {
      data: currentItem,
      error: currentError,
    } = await s
      .from("library_items")
      .select(`
        id,
        user_id,
        media_id,
        status,
        rewatch_count,
        current_season,
        completed_seasons,
        stopped_season
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (currentError) {
  return respostaDeErro(
    currentError,
    "PATCH /api/library/[id] current",
  );
}

if (!currentItem) {
  return NextResponse.json(
    {
      error: "Item não encontrado.",
    },
    {
      status: 404,
    },
  );
}

    /*
     * ==========================================
     * STATUS
     * ==========================================
     */

    const oldStatus =
      currentItem.status;

    const newStatus =
      body.status !== undefined
        ? body.status
        : oldStatus;

    /*
     * ==========================================
     * REASSISTIDAS
     * ==========================================
     *
     * Aumenta ao iniciar uma reassistida ou ao marcá-la como
     * concluída diretamente, sem passar por "rewatching".
     *
     * watched -> rewatching = +1
     * rewatched -> rewatching = +1
     * rewatching -> rewatching = +0
     * watching -> rewatched = +1
     * rewatching -> rewatched = +0 (já contou ao iniciar)
     */

    let rewatchCount = Number(
      currentItem.rewatch_count || 0
    );

    const isStartingRewatch =
      newStatus === "rewatching" &&
      oldStatus !== "rewatching";

    const isDirectlyCompletingRewatch =
      newStatus === "rewatched" &&
      oldStatus !== "rewatching" &&
      oldStatus !== "rewatched";

    if (
      isStartingRewatch ||
      isDirectlyCompletingRewatch
    ) {
      rewatchCount += 1;
    }

    /*
     * ==========================================
     * PROGRESSO DE TEMPORADAS
     * ==========================================
     */

    const oldCompletedSeasons =
      Number(
        currentItem.completed_seasons || 0
      );

    let newCompletedSeasons =
      body.completed_seasons !== undefined
        ? Number(
            body.completed_seasons
          )
        : oldCompletedSeasons;

    /*
     * Nunca deixa ficar negativo.
     */

    newCompletedSeasons =
      Math.max(
        0,
        newCompletedSeasons
      );

    const oldCurrentSeason =
      currentItem.current_season !==
        null &&
      currentItem.current_season !==
        undefined
        ? Number(
            currentItem.current_season
          )
        : null;

    let newCurrentSeason =
      body.current_season !== undefined
        ? body.current_season === null
          ? null
          : Number(
              body.current_season
            )
        : oldCurrentSeason;

    /*
     * Temporada atual mínima = 1.
     */

    if (
      newCurrentSeason !== null
    ) {
      newCurrentSeason =
        Math.max(
          1,
          newCurrentSeason
        );
    }

    /*
     * ==========================================
     * ONDE PAROU
     * ==========================================
     */

    let stoppedSeason =
      currentItem.stopped_season;

    /*
     * Se o front mandar explicitamente,
     * respeitamos o valor.
     */

    if (
      body.stopped_season !== undefined
    ) {
      stoppedSeason =
        body.stopped_season;
    }

    /*
     * Quando abandona:
     *
     * guarda a temporada atual.
     */

    if (
      newStatus === "dropped" &&
      oldStatus !== "dropped"
    ) {
      stoppedSeason =
        newCurrentSeason ||
        oldCurrentSeason ||
        1;
    }

    /*
     * Se continuar assistindo novamente,
     * limpa o "parou na temporada".
     */

    if (
      body.status !== undefined &&
      newStatus !== "dropped"
    ) {
      stoppedSeason = null;
    }

    /*
     * ==========================================
     * DADOS PARA ATUALIZAÇÃO
     * ==========================================
     */

    const updateData: Record<
      string,
      any
    > = {
      ...body,

      rewatch_count:
        rewatchCount,

      updated_at:
        new Date().toISOString(),
    };

    /*
     * Só atualizamos temporada se
     * ela realmente veio na requisição.
     */

    if (
      body.current_season !== undefined
    ) {
      updateData.current_season =
        newCurrentSeason;
    }

    if (
      body.completed_seasons !==
      undefined
    ) {
      updateData.completed_seasons =
        newCompletedSeasons;
    }

    /*
     * stopped_season pode mudar
     * automaticamente quando muda status.
     */

    if (
      body.status !== undefined ||
      body.stopped_season !== undefined
    ) {
      updateData.stopped_season =
        stoppedSeason;
    }

    /*
     * ==========================================
     * ATUALIZAR ITEM
     * ==========================================
     */

    const {
      data,
      error,
    } = await s
      .from("library_items")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
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

    if (error) {
  return respostaDeErro(
    error,
    "PATCH /api/library/[id]",
  );
}

    /*
     * ==========================================
     * CORRIGIR O DIÁRIO AO DIMINUIR PROGRESSO
     * ==========================================
     *
     * Exemplo:
     *
     * antes: 6 temporadas concluídas
     * agora: 5 temporadas concluídas
     *
     * Nesse caso, apagamos do histórico
     * qualquer evento "season_completed"
     * acima da temporada 5.
     */

    if (
      body.completed_seasons !== undefined &&
      newCompletedSeasons < oldCompletedSeasons
    ) {
      const {
        data: seasonHistory,
        error: seasonHistoryError,
      } = await s
        .from("activity_events")
        .select("id, metadata")
        .eq("user_id", user.id)
        .eq(
          "library_item_id",
          currentItem.id
        )
        .eq(
          "event_type",
          "season_completed"
        );

      if (seasonHistoryError) {
        console.error(
          "Erro ao buscar histórico de temporadas:",
          seasonHistoryError.message
        );
      } else {
        const idsToDelete =
          (seasonHistory || [])
            .filter((event: any) => {
              const season = Number(
                event?.metadata?.season || 0
              );

              return (
                season >
                newCompletedSeasons
              );
            })
            .map(
              (event: any) =>
                event.id
            );

        if (
          idsToDelete.length > 0
        ) {
          const {
            error: deleteHistoryError,
          } = await s
            .from("activity_events")
            .delete()
            .in(
              "id",
              idsToDelete
            )
            .eq(
              "user_id",
              user.id
            );

          if (
            deleteHistoryError
          ) {
            console.error(
              "Erro ao corrigir Diário:",
              deleteHistoryError.message
            );
          }
        }
      }

      /*
       * Se existia um registro de
       * "série concluída", ele deixa de
       * ser válido quando o progresso
       * volta para menos temporadas.
       */

      const {
        error: deleteSeriesCompletedError,
      } = await s
        .from("activity_events")
        .delete()
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "library_item_id",
          currentItem.id
        )
        .eq(
          "event_type",
          "series_completed"
        );

      if (
        deleteSeriesCompletedError
      ) {
        console.error(
          "Erro ao corrigir conclusão da série no Diário:",
          deleteSeriesCompletedError.message
        );
      }
    }

    /*
     * ==========================================
     * DIÁRIO / HISTÓRICO
     * ==========================================
     */

    const activityEvents: any[] =
      [];

    /*
     * ==========================================
     * STATUS ALTERADO
     * ==========================================
     */

    if (
      body.status !== undefined &&
      newStatus !== oldStatus
    ) {
      activityEvents.push({
        user_id:
          user.id,

        media_id:
          currentItem.media_id,

        library_item_id:
          currentItem.id,

        event_type:
          "status_changed",

        metadata: {
          from:
            oldStatus,

          to:
            newStatus,

          current_season:
            newCurrentSeason,

          stopped_season:
            stoppedSeason,
        },
      });
    }

    /*
     * ==========================================
     * COMEÇOU A REASSISTIR
     * ==========================================
     */

    if (isStartingRewatch) {
      activityEvents.push({
        user_id:
          user.id,

        media_id:
          currentItem.media_id,

        library_item_id:
          currentItem.id,

        event_type:
          "rewatch_started",

        metadata: {
          rewatch_count:
            rewatchCount,
        },
      });
    }

    /*
     * ==========================================
     * TEMPORADAS CONCLUÍDAS
     * ==========================================
     *
     * Se passou:
     *
     * 2 -> 3
     *
     * cria:
     *
     * temporada 3 concluída.
     *
     * Se passou:
     *
     * 2 -> 5
     *
     * cria:
     *
     * temporada 3
     * temporada 4
     * temporada 5
     */

    if (
      body.completed_seasons !==
        undefined &&
      newCompletedSeasons >
        oldCompletedSeasons
    ) {
      for (
        let season =
          oldCompletedSeasons + 1;
        season <=
        newCompletedSeasons;
        season++
      ) {
        activityEvents.push({
          user_id:
            user.id,

          media_id:
            currentItem.media_id,

          library_item_id:
            currentItem.id,

          event_type:
            "season_completed",

          metadata: {
            season,
          },
        });
      }
    }

    /*
     * ==========================================
     * SÉRIE CONCLUÍDA
     * ==========================================
     *
     * Consideramos conclusão quando
     * muda para "watched".
     */

    const isCompleted =
      newStatus === "watched" &&
      oldStatus !== "watched";

    if (isCompleted) {
      activityEvents.push({
        user_id:
          user.id,

        media_id:
          currentItem.media_id,

        library_item_id:
          currentItem.id,

        event_type:
          "series_completed",

        metadata: {
          completed_seasons:
            newCompletedSeasons,

          current_season:
            newCurrentSeason,
        },
      });
    }

    /*
     * ==========================================
     * ABANDONOU
     * ==========================================
     *
     * A tabela não precisa de um tipo
     * "dropped" separado.
     *
     * O status_changed já registra isso,
     * incluindo a temporada onde parou.
     */

    /*
     * ==========================================
     * SALVAR ATIVIDADES
     * ==========================================
     */

    if (
      activityEvents.length > 0
    ) {
      const {
        error: activityError,
      } = await s
        .from(
          "activity_events"
        )
        .insert(
          activityEvents
        );

      /*
       * Se o histórico falhar,
       * não desfazemos a atualização
       * da biblioteca.
       */

      if (activityError) {
        console.error(
          "Erro ao registrar atividade:",
          activityError.message
        );
      }
    }

    /*
     * ==========================================
     * RETORNO
     * ==========================================
     */

    return NextResponse.json(
      data
    );
  } catch (error) {
    console.error(
      "Erro ao atualizar biblioteca:",
      error
    );

    return respostaDeErro(
  error,
  "PATCH /api/library/[id]",
);
  }
}

/*
 * ==========================================
 * REMOVER DA BIBLIOTECA
 * ==========================================
 */

export async function DELETE(
  _: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const {
    id,
  } = await params;

  const s =
    await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Não autenticado",
      },
      {
        status: 401,
      }
    );
  }

  const {
    error,
  } = await s
    .from("library_items")
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
    "DELETE /api/library/[id]",
  );
}

  return NextResponse.json({
    ok: true,
  });
}
