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

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id } = await params;

  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const sql = getDb();
    const currentRows = await sql`
      SELECT
        id,
        library_item_id,
        media_id,
        watched_at,
        watched_at_precision,
        rating,
        comment,
        is_rewatch
      FROM public.watch_entries
      WHERE id = ${id} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (currentRows.length === 0) {
      return NextResponse.json(
        { error: "Visualização não encontrada." },
        { status: 404 },
      );
    }

    const current = currentRows[0];
    const body = await req.json();

    let nextWatchedAt = current.watched_at;
    // V2.3 — edição de data/hora vem do datetime-local → 'datetime', salvo
    // quando o cliente declara que só tem a data.
    let nextPrecision = current.watched_at_precision ?? null;
    if (body.watched_at !== undefined) {
      nextPrecision = body.watched_at_precision === "date" ? "date" : "datetime";
      const date = new Date(String(body.watched_at));
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "Data inválida." }, { status: 400 });
      }
      nextWatchedAt = date.toISOString();
    }

    let nextRating = current.rating;
    if (body.rating !== undefined) {
      nextRating = parseRating(body.rating);
    }

    let nextComment = current.comment;
    if (body.comment !== undefined) {
      nextComment =
        typeof body.comment === "string"
          ? body.comment.trim().slice(0, 4000) || null
          : null;
    }

    let nextIsRewatch = current.is_rewatch;
    if (body.is_rewatch !== undefined) {
      nextIsRewatch = Boolean(body.is_rewatch);
    }

    /*
     * V3.1 — UMA transação: a visualização editada, a data/nota da Biblioteca
     * (só se esta for a mais recente; a nota nunca é apagada) e o espelho do
     * Diário. Tudo ou nada — antes eram escritas soltas e a do Diário
     * engolia erro.
     */
    const [updatedRows] = (await sql.transaction([
      sql`
        UPDATE public.watch_entries
        SET
          watched_at = ${nextWatchedAt},
          watched_at_precision = ${nextPrecision},
          rating = ${nextRating},
          comment = ${nextComment},
          is_rewatch = ${nextIsRewatch},
          updated_at = now()
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, library_item_id, media_id, watched_at, rating, comment, is_rewatch, created_at, updated_at
      `,
      sql`
        UPDATE public.library_items li
        SET
          watched_at = latest.watched_at,
          watched_at_precision = latest.watched_at_precision,
          personal_rating = COALESCE(latest.rating, li.personal_rating),
          updated_at = now()
        FROM (
          SELECT watched_at, watched_at_precision, rating
          FROM public.watch_entries
          WHERE user_id = ${user.id} AND library_item_id = ${current.library_item_id}
          ORDER BY watched_at DESC
          LIMIT 1
        ) latest
        WHERE li.id = ${current.library_item_id} AND li.user_id = ${user.id}
      `,
      sql`
        UPDATE public.activity_events
        SET
          occurred_at = ${nextWatchedAt},
          metadata = jsonb_build_object(
            'watch_entry_id', ${id}::text,
            'rating', ${nextRating}::numeric,
            'comment', ${nextComment}::text,
            'is_rewatch', ${nextIsRewatch}::boolean
          )
        WHERE user_id = ${user.id}
          AND event_type = 'watch_logged'
          AND metadata->>'watch_entry_id' = ${id}
      `,
    ])) as Record<string, unknown>[][];

    const data = updatedRows[0];

    return NextResponse.json(data);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A nota precisa estar entre 0 e 10."
    ) {
      return entradaInvalida(error.message);
    }
    return respostaDeErro(error, "PATCH /api/watch-history/[id]");
  }
}

export async function DELETE(
  _: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id } = await params;

  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const sql = getDb();
    const currentRows = await sql`
      SELECT id, library_item_id
      FROM public.watch_entries
      WHERE id = ${id} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (currentRows.length === 0) {
      return NextResponse.json(
        { error: "Visualização não encontrada." },
        { status: 404 },
      );
    }

    const current = currentRows[0];

    /*
     * V3.1 — UMA transação: apaga o registro e o espelho no Diário e acompanha
     * só a data da última visualização restante.
     *
     * V2.1 (fechamento) — DELETE = "excluir este registro do Diário". É
     * NÃO-destrutiva para o resto: `personal_rating`, `rewatch_count` e
     * `status` da Library ficam intactos (não há proveniência para saber
     * qual fluxo originou cada valor). Sem registros restantes, a data é
     * preservada. Ver docs/V2.1-A-DATA-INTEGRITY.md.
     */
    await sql.transaction([
      sql`
        DELETE FROM public.watch_entries
        WHERE id = ${id} AND user_id = ${user.id}
      `,
      sql`
        DELETE FROM public.activity_events
        WHERE user_id = ${user.id}
          AND event_type = 'watch_logged'
          AND metadata->>'watch_entry_id' = ${id}
      `,
      sql`
        UPDATE public.library_items li
        SET
          watched_at = latest.watched_at,
          watched_at_precision = latest.watched_at_precision,
          updated_at = now()
        FROM (
          SELECT watched_at, watched_at_precision
          FROM public.watch_entries
          WHERE user_id = ${user.id} AND library_item_id = ${current.library_item_id}
          ORDER BY watched_at DESC
          LIMIT 1
        ) latest
        WHERE li.id = ${current.library_item_id} AND li.user_id = ${user.id}
      `,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/watch-history/[id]");
  }
}
