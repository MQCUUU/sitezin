import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

function parseRating(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    throw new Error("A nota precisa estar entre 0 e 10.");
  }
  return Math.round(rating * 2) / 2;
}

function parseDate(value: unknown) {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error("Data de visualização inválida.");
  }
  return date.toISOString();
}

/**
 * V2.3 — proveniência do horário. Este endpoint recebe data E hora escolhidas
 * pelo usuário (campo datetime-local) ou usa o relógio do servidor → 'datetime'.
 * Quem só tem a data envia `watched_at_precision: "date"`.
 */
function parsePrecision(value: unknown): "date" | "datetime" {
  return value === "date" ? "date" : "datetime";
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const libraryId = (url.searchParams.get("library_id") || "").trim();
    if (!libraryId) {
      return NextResponse.json(
        { error: "library_id é obrigatório." },
        { status: 400 },
      );
    }

    const sql = getDb();
    const itemRows = await sql`
      SELECT id
      FROM public.library_items
      WHERE id = ${libraryId} AND user_id = ${user.id}
      LIMIT 1
    `;
    if (itemRows.length === 0) {
      return NextResponse.json(
        { error: "Item da biblioteca não encontrado." },
        { status: 404 },
      );
    }

    const data = await sql`
      SELECT
        id,
        library_item_id,
        media_id,
        watched_at,
        rating,
        comment,
        is_rewatch,
        created_at,
        updated_at
      FROM public.watch_entries
      WHERE user_id = ${user.id}
        AND library_item_id = ${libraryId}
      ORDER BY watched_at DESC
    `;

    return NextResponse.json(data || [], {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/watch-history");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    if (!libraryId) {
      return NextResponse.json(
        { error: "library_id é obrigatório." },
        { status: 400 },
      );
    }

    const sql = getDb();
    const itemRows = await sql`
      SELECT
        id,
        media_id,
        status,
        rewatch_count,
        personal_rating,
        watched_at
      FROM public.library_items
      WHERE id = ${libraryId} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (itemRows.length === 0) {
      return NextResponse.json(
        { error: "Item da biblioteca não encontrado." },
        { status: 404 },
      );
    }

    const libraryItem = itemRows[0];
    const watchedAt = parseDate(body.watched_at);
    const precision = body.watched_at ? parsePrecision(body.watched_at_precision) : "datetime";
    const rating = parseRating(body.rating);
    const comment =
      typeof body.comment === "string"
        ? body.comment.trim().slice(0, 4000) || null
        : null;

    // Histórico é do TÍTULO (media_id), não do item: visualizações anteriores a
    // uma remoção/readição continuam contando para "reassistida".
    const countRes = await sql`
      SELECT count(*)::int as count
      FROM public.watch_entries
      WHERE user_id = ${user.id} AND media_id = ${libraryItem.media_id}
    `;
    const previousCount = Number(countRes[0]?.count || 0);

    const isRewatch =
      typeof body.is_rewatch === "boolean"
        ? body.is_rewatch
        : previousCount > 0;

    const entryRows = await sql`
      INSERT INTO public.watch_entries (
        user_id,
        library_item_id,
        media_id,
        watched_at,
        watched_at_precision,
        rating,
        comment,
        is_rewatch
      )
      VALUES (
        ${user.id},
        ${libraryItem.id},
        ${libraryItem.media_id},
        ${watchedAt},
        ${precision},
        ${rating},
        ${comment},
        ${isRewatch}
      )
      RETURNING
        id,
        library_item_id,
        media_id,
        watched_at,
        rating,
        comment,
        is_rewatch,
        created_at,
        updated_at
    `;

    const entry = entryRows[0];
    const nextRewatchCount = Math.max(
      Number(libraryItem.rewatch_count || 0),
      isRewatch ? previousCount : 0,
    );

    const nextStatus = isRewatch ? "rewatched" : "watched";
    const nextRating = rating !== null ? rating : libraryItem.personal_rating;

    const updatedLibraryRows = await sql`
      UPDATE public.library_items
      SET
        watched_at = ${watchedAt},
        watched_at_precision = ${precision},
        status = ${nextStatus},
        rewatch_count = ${nextRewatchCount},
        personal_rating = ${nextRating},
        updated_at = ${new Date().toISOString()}
      WHERE id = ${libraryId} AND user_id = ${user.id}
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
        updated_at
    `;

    const updatedLibrary = updatedLibraryRows[0] || null;

    try {
      const metadata = JSON.stringify({
        watch_entry_id: entry.id,
        rating,
        comment,
        is_rewatch: isRewatch,
        watch_number: previousCount + 1,
      });

      await sql`
        INSERT INTO public.activity_events (
          user_id,
          media_id,
          library_item_id,
          event_type,
          occurred_at,
          metadata
        )
        VALUES (
          ${user.id},
          ${libraryItem.media_id},
          ${libraryItem.id},
          'watch_logged',
          ${watchedAt},
          ${metadata}::jsonb
        )
      `;
    } catch (activityError: any) {
      console.error(
        "Erro ao registrar visualização no Diário:",
        activityError?.message,
      );
    }

    return NextResponse.json(
      {
        entry,
        library_item: updatedLibrary,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "A nota precisa estar entre 0 e 10." ||
        error.message === "Data de visualização inválida.")
    ) {
      return entradaInvalida(error.message);
    }
    return respostaDeErro(error, "POST /api/watch-history");
  }
}
