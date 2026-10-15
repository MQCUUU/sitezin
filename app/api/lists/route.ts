import { NextRequest, NextResponse } from "next/server";

import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { LISTS_PAGE, isUuid, normalizeDescription, normalizeName, parseMediaType, parsePage, parsePositiveInt } from "@/lib/lists/validate";

/*
 * Listas V2.7 — as listas DO USUÁRIO DA SESSÃO (nunca de um user_id vindo do cliente).
 *
 * `custom_lists` é a fonte canônica (inclusive `is_public`, desde a migration
 * db/migrations/2026-10-15_v2.7-lists-media.sql). `public.lists` segue como espelho
 * de compatibilidade, escrito na MESMA transação.
 *
 * GET  ?page=N                         listas (24 por página), com capa (até 4 pôsteres) e contagem
 * GET  ?tmdb_id=&media_type=           todas as listas com `in_list` para aquele título (diálogo "Adicionar à lista")
 * POST   { name, description?, is_public? }
 * PATCH  { id, name?, description?, is_public? }
 * DELETE ?id=   apaga a lista e SÓ os itens dela (nunca Biblioteca, mídia ou histórico)
 */

const PRIVATE = { "Cache-Control": "private, no-store" };

async function sessionUser() {
  const session = await auth.getSession().catch(() => null);

  return session?.data?.user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await sessionUser();

    if (!userId) return naoAutenticado();

    const sql = getDb();
    const search = request.nextUrl.searchParams;
    const tmdbId = parsePositiveInt(search.get("tmdb_id"));
    const mediaType = parseMediaType(search.get("media_type"));
    const forTitle = Boolean(tmdbId && mediaType);
    const page = forTitle ? 1 : parsePage(search.get("page"));
    const limit = forTitle ? 200 : LISTS_PAGE;

    const [rows, totals] = (await Promise.all([
      sql`
        SELECT
          cl.id, cl.name, cl.description, cl.is_public, cl.created_at, cl.updated_at,
          (SELECT count(*)::int FROM public.custom_list_items i WHERE i.list_id = cl.id) AS item_count,
          COALESCE((
            SELECT json_agg(c.poster_path ORDER BY c.rn)
            FROM (
              SELECT m.poster_path, row_number() OVER (ORDER BY i.position, i.added_at, i.media_id) AS rn
              FROM public.custom_list_items i
              JOIN public.media m ON m.id = i.media_id
              WHERE i.list_id = cl.id AND m.poster_path IS NOT NULL
              ORDER BY i.position, i.added_at, i.media_id
              LIMIT 4
            ) c
          ), '[]'::json) AS covers,
          ${
            forTitle
              ? sql`EXISTS (
                  SELECT 1 FROM public.custom_list_items i JOIN public.media m ON m.id = i.media_id
                  WHERE i.list_id = cl.id AND m.tmdb_id = ${tmdbId} AND m.media_type = ${mediaType}
                )`
              : sql`false`
          } AS in_list
        FROM public.custom_lists cl
        WHERE cl.user_id = ${userId}
        ORDER BY cl.updated_at DESC, cl.id
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `,
      sql`SELECT count(*)::int AS total FROM public.custom_lists WHERE user_id = ${userId}`,
    ])) as [Record<string, unknown>[], { total: number }[]];

    const total = Number(totals[0]?.total || 0);

    return NextResponse.json(
      {
        custom_lists: rows.map((row) => ({ ...row, description: normalizeDescription(row.description) })),
        page,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
      { headers: PRIVATE }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/lists");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await sessionUser();

    if (!userId) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const name = normalizeName(body?.name);

    if (!name) return entradaInvalida("Dê um nome com pelo menos 2 caracteres.");

    const description = normalizeDescription(body?.description);
    const isPublic = body?.is_public === true;
    const id = crypto.randomUUID();
    const sql = getDb();

    const [created] = (await sql.transaction([
      sql`
        INSERT INTO public.custom_lists (id, user_id, name, description, is_public, created_at, updated_at)
        VALUES (${id}, ${userId}, ${name}, ${description}, ${isPublic}, now(), now())
        RETURNING id, name, description, is_public, created_at, updated_at
      `,
      sql`
        INSERT INTO public.lists (id, user_id, name, description, is_public, created_at, updated_at)
        VALUES (${id}, ${userId}, ${name}, ${description}, ${isPublic}, now(), now())
        ON CONFLICT (id) DO NOTHING
      `,
    ])) as [Record<string, unknown>[]];

    return NextResponse.json({ ...created[0], item_count: 0, covers: [] }, { status: 201, headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "POST /api/lists");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await sessionUser();

    if (!userId) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const id = body?.id;

    if (!isUuid(id)) return entradaInvalida("Lista inválida.");

    const name = body.name !== undefined ? normalizeName(body.name) : undefined;

    if (name === null) return entradaInvalida("Dê um nome com pelo menos 2 caracteres.");

    const hasDescription = body.description !== undefined;
    const description = normalizeDescription(body.description);
    const hasPublic = typeof body.is_public === "boolean";
    const isPublic = hasPublic ? body.is_public : false;
    const sql = getDb();

    const [updated] = (await sql.transaction([
      sql`
        UPDATE public.custom_lists
        SET
          name = COALESCE(${name ?? null}, name),
          description = CASE WHEN ${hasDescription} THEN ${description} ELSE description END,
          is_public = CASE WHEN ${hasPublic} THEN ${isPublic} ELSE is_public END,
          updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, name, description, is_public, created_at, updated_at
      `,
      sql`
        UPDATE public.lists l
        SET name = cl.name, description = cl.description, is_public = cl.is_public, updated_at = now()
        FROM public.custom_lists cl
        WHERE l.id = cl.id AND cl.id = ${id} AND cl.user_id = ${userId}
      `,
    ])) as [Record<string, unknown>[]];

    if (!updated.length) return NextResponse.json({ error: "Lista não encontrada." }, { status: 404, headers: PRIVATE });

    return NextResponse.json(updated[0], { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "PATCH /api/lists");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await sessionUser();

    if (!userId) return naoAutenticado();

    let id: unknown = request.nextUrl.searchParams.get("id");

    if (!id) id = (await request.json().catch(() => ({})))?.id;
    if (!isUuid(id)) return entradaInvalida("Lista inválida.");

    const sql = getDb();
    const [deleted] = (await sql.transaction([
      sql`DELETE FROM public.custom_lists WHERE id = ${id} AND user_id = ${userId} RETURNING id`,
      sql`DELETE FROM public.lists WHERE id = ${id} AND user_id = ${userId}`,
    ])) as [unknown[]];

    if (!deleted.length) return NextResponse.json({ error: "Lista não encontrada." }, { status: 404, headers: PRIVATE });

    return NextResponse.json({ success: true }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/lists");
  }
}
