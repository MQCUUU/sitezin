import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { removeLibraryItem } from "@/lib/library/remove";
import { respostaDeErro } from "@/lib/api-error";
import { applyStatusTransition, statusTransition } from "@/lib/library/status-event";

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

    // Contador de reassistidas: incrementado na própria linha pela transição (rewatchEffect).
    const isStartingRewatch =
      newStatus === "rewatching" && oldStatus !== "rewatching";

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
     * V3.0 — transição de status = UM comando atômico (lib/library/status-event.ts):
     * compare-and-set do status + temporadas + contador de reassistidas
     * (incremento na linha) + `status_changed`/`rewatch_started`. Tudo ou nada;
     * requisições concorrentes/retries não repetem nada. Mesma primitive do
     * POST /api/library.
     */
    const transition = statusTransition(oldStatus, body.status);

    if (transition) {
      await applyStatusTransition(sql, {
        userId,
        libraryItemId: id,
        transition,
        derived: { current_season: newCurrentSeason, completed_seasons: newCompletedSeasons, stopped_season: stoppedSeason },
      });
    }

    /*
     * 4. Executar UPDATE no Neon PostgreSQL — campos pessoais.
     * Status e contador de reassistidas só mudam pela transição acima (nunca a
     * partir desta leitura, que pode estar desatualizada). Temporadas: só
     * quando o pedido as envia explicitamente e não há transição.
     */
    const explicitSeasons = !transition;
    const updatedRows = await sql`
      UPDATE public.library_items
      SET
        favorite = ${newFavorite},
        personal_rating = ${newPersonalRating},
        review = ${newReview},
        current_season = CASE WHEN ${explicitSeasons && body.current_season !== undefined}::boolean THEN ${newCurrentSeason}::int ELSE current_season END,
        completed_seasons = CASE WHEN ${explicitSeasons && body.completed_seasons !== undefined}::boolean THEN ${newCompletedSeasons}::int ELSE completed_seasons END,
        stopped_season = CASE WHEN ${explicitSeasons && body.stopped_season !== undefined}::boolean THEN ${stoppedSeason}::int ELSE stopped_season END,
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

    // Eventos de status/reassistida: gravados atomicamente pela transição (passo acima).
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

    // Remove o estado da Biblioteca; o histórico (Diário, Insights) fica — ver lib/library/remove.ts.
    await removeLibraryItem(getDb(), user.id, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro em DELETE /api/library/[id]:", error);
    return respostaDeErro(error, "DELETE /api/library/[id]");
  }
}
