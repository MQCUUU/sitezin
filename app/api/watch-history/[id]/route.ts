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
    if (body.watched_at !== undefined) {
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

    const now = new Date().toISOString();
    const updatedRows = await sql`
      UPDATE public.watch_entries
      SET
        watched_at = ${nextWatchedAt},
        rating = ${nextRating},
        comment = ${nextComment},
        is_rewatch = ${nextIsRewatch},
        updated_at = ${now}
      WHERE id = ${id} AND user_id = ${user.id}
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

    const data = updatedRows[0];

    // Sincronizar com library_items se for a visualização mais recente
    const latestRows = await sql`
      SELECT id, watched_at, rating, is_rewatch
      FROM public.watch_entries
      WHERE user_id = ${user.id}
        AND library_item_id = ${current.library_item_id}
      ORDER BY watched_at DESC
      LIMIT 1
    `;

    if (latestRows.length > 0) {
      const latest = latestRows[0];
      await sql`
        UPDATE public.library_items
        SET
          watched_at = ${latest.watched_at},
          personal_rating = COALESCE(${latest.rating}, personal_rating),
          updated_at = ${now}
        WHERE id = ${current.library_item_id} AND user_id = ${user.id}
      `;
    }

    // Atualizar evento do Diário
    try {
      const updatedMetadata = JSON.stringify({
        watch_entry_id: data.id,
        rating: data.rating,
        comment: data.comment,
        is_rewatch: data.is_rewatch,
      });

      await sql`
        UPDATE public.activity_events
        SET
          occurred_at = ${data.watched_at},
          metadata = ${updatedMetadata}::jsonb
        WHERE user_id = ${user.id}
          AND event_type = 'watch_logged'
          AND metadata->>'watch_entry_id' = ${id}
      `;
    } catch (e: any) {
      console.error("Erro ao sincronizar evento de diário:", e?.message);
    }

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

    // Deletar da watch_entries
    await sql`
      DELETE FROM public.watch_entries
      WHERE id = ${id} AND user_id = ${user.id}
    `;

    // Deletar evento correspondente do Diário
    try {
      await sql`
        DELETE FROM public.activity_events
        WHERE user_id = ${user.id}
          AND event_type = 'watch_logged'
          AND metadata->>'watch_entry_id' = ${id}
      `;
    } catch (e: any) {
      console.error("Erro ao deletar activity_event do diário:", e?.message);
    }

    /*
     * V2.1 (fechamento) — DELETE = "excluir este registro do Diário".
     *
     * Antes: recalculava `personal_rating` e `rewatch_count` da Library
     * SÓ a partir dos watch_entries restantes. Isso sobrescrevia em
     * silêncio valores definidos por outros fluxos (nota pela Library/página
     * do título, "começar reassistida" no dropdown, import, Letterboxd) —
     * ex.: nota 9 da Library virava NULL ao apagar o último registro.
     *
     * Não existe proveniência (não sabemos qual fluxo originou cada valor),
     * então a exclusão é NÃO-destrutiva: `personal_rating`, `rewatch_count`
     * e `status` da Library ficam intactos. Só a data da última visualização
     * (`watched_at`, que POST/PATCH já sincronizam com o registro mais
     * recente) acompanha o histórico — e apenas quando ainda sobra algum
     * registro; sem registros restantes, é preservada.
     * Proveniência/ciclos de rewatch: dívida de V3 (docs/V2.1-A-DATA-INTEGRITY.md).
     */
    const latestRemaining = await sql`
      SELECT watched_at
      FROM public.watch_entries
      WHERE user_id = ${user.id}
        AND library_item_id = ${current.library_item_id}
      ORDER BY watched_at DESC
      LIMIT 1
    `;

    if (latestRemaining.length > 0) {
      await sql`
        UPDATE public.library_items
        SET
          watched_at = ${latestRemaining[0].watched_at},
          updated_at = ${new Date().toISOString()}
        WHERE id = ${current.library_item_id} AND user_id = ${user.id}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/watch-history/[id]");
  }
}
