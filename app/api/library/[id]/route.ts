import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { respostaDeErro } from "@/lib/api-error";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const userId = user.id;
    const sql = getDb();

    /*
     * 1. Buscar item atual
     */
    const currentRows = await sql`
      SELECT
        li.id,
        li.user_id,
        li.media_id,
        li.status,
        li.favorite,
        li.personal_rating,
        li.review,
        li.rewatch_count,
        li.current_season,
        li.completed_seasons,
        li.stopped_season,
        to_jsonb(m.*) - 'raw' as media
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.id = ${id} AND li.user_id = ${userId}
      LIMIT 1;
    `;

    if (currentRows.length === 0) {
      return NextResponse.json(
        { error: "Item não encontrado." },
        { status: 404 }
      );
    }

    const currentItem = currentRows[0];
    const media = currentItem.media;
    const body = await req.json().catch(() => ({}));

    /*
     * 2. Status e reassistidas
     */
    const oldStatus = currentItem.status;
    const newStatus = body.status !== undefined ? body.status : oldStatus;

    let rewatchCount = Number(currentItem.rewatch_count || 0);
    const isStartingRewatch =
      newStatus === "rewatching" && oldStatus !== "rewatching";
    const isDirectlyCompletingRewatch =
      newStatus === "rewatched" &&
      oldStatus !== "rewatching" &&
      oldStatus !== "rewatched";

    if (isStartingRewatch || isDirectlyCompletingRewatch) {
      rewatchCount += 1;
    }

    /*
     * 3. Temporadas e progresso
     */
    const oldCompletedSeasons = Number(currentItem.completed_seasons || 0);
    let newCompletedSeasons =
      body.completed_seasons !== undefined
        ? Number(body.completed_seasons)
        : oldCompletedSeasons;
    newCompletedSeasons = Math.max(0, newCompletedSeasons);

    const oldCurrentSeason =
      currentItem.current_season !== null &&
      currentItem.current_season !== undefined
        ? Number(currentItem.current_season)
        : null;

    let newCurrentSeason =
      body.current_season !== undefined
        ? body.current_season === null
          ? null
          : Number(body.current_season)
        : oldCurrentSeason;

    if (newCurrentSeason !== null) {
      newCurrentSeason = Math.max(1, newCurrentSeason);
    }

    let stoppedSeason = currentItem.stopped_season;
    if (body.stopped_season !== undefined) {
      stoppedSeason = body.stopped_season;
    }
    if (newStatus === "dropped" && oldStatus !== "dropped") {
      stoppedSeason = newCurrentSeason || oldCurrentSeason || 1;
    }
    if (body.status !== undefined && newStatus !== "dropped") {
      stoppedSeason = null;
    }

    if (isStartingRewatch && media?.media_type === "tv") {
      newCompletedSeasons = 0;
      newCurrentSeason = 1;
      stoppedSeason = null;
    }

    if (newStatus === "rewatched" && media?.media_type === "tv") {
      const totalSeasons = Number(media.seasons_count || 0);
      newCompletedSeasons = totalSeasons;
      newCurrentSeason = totalSeasons || 1;
      stoppedSeason = null;
    }

    const newFavorite =
      body.favorite !== undefined ? Boolean(body.favorite) : currentItem.favorite;
    const newPersonalRating =
      body.personal_rating !== undefined
        ? body.personal_rating
        : currentItem.personal_rating;
    const newReview =
      body.review !== undefined ? body.review : currentItem.review;

    /*
     * 4. Executar UPDATE no Neon PostgreSQL
     */
    const updatedRows = await sql`
      UPDATE public.library_items
      SET
        status = ${newStatus},
        favorite = ${newFavorite},
        personal_rating = ${newPersonalRating},
        review = ${newReview},
        rewatch_count = ${rewatchCount},
        current_season = ${newCurrentSeason},
        completed_seasons = ${newCompletedSeasons},
        stopped_season = ${stoppedSeason},
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING
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
        updated_at;
    `;

    if (updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Item não encontrado ao atualizar." },
        { status: 404 }
      );
    }

    const updatedItem = updatedRows[0];
    updatedItem.media = media;

    /*
     * 5. Registrar eventos de atividade (não-bloqueante)
     */
    try {
      if (body.status !== undefined && newStatus !== oldStatus) {
        await sql`
          INSERT INTO public.activity_events (
            user_id,
            media_id,
            library_item_id,
            event_type,
            metadata
          )
          VALUES (
            ${userId},
            ${currentItem.media_id},
            ${currentItem.id},
            'status_changed',
            ${{
              from: oldStatus,
              to: newStatus,
              current_season: newCurrentSeason,
              stopped_season: stoppedSeason,
            }}
          );
        `;
      }
      if (isStartingRewatch) {
        await sql`
          INSERT INTO public.activity_events (
            user_id,
            media_id,
            library_item_id,
            event_type,
            metadata
          )
          VALUES (
            ${userId},
            ${currentItem.media_id},
            ${currentItem.id},
            'rewatch_started',
            ${{ rewatch_count: rewatchCount }}
          );
        `;
      }
    } catch (actErr: any) {
      console.warn("[activity_events] Registro de histórico não completado:", actErr?.message);
    }

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error("Erro em PATCH /api/library/[id]:", error);
    return respostaDeErro(error, "PATCH /api/library/[id]");
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const sql = getDb();
    await sql`
      DELETE FROM public.library_items
      WHERE id = ${id} AND user_id = ${user.id};
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro em DELETE /api/library/[id]:", error);
    return respostaDeErro(error, "DELETE /api/library/[id]");
  }
}
