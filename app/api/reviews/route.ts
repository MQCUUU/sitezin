import { NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const url = new URL(req.url);
    const libraryItemId = url.searchParams.get("library_item_id");
    if (!libraryItemId || !UUID_PATTERN.test(libraryItemId)) {
      return entradaInvalida("library_item_id inválido.");
    }

    const sql = getDb();
    const itemRows = await sql`
      SELECT id FROM public.library_items
      WHERE id = ${libraryItemId} AND user_id = ${user.id}
      LIMIT 1
    `;
    if (itemRows.length === 0) {
      return NextResponse.json({ error: "Título não encontrado na sua biblioteca." }, { status: 404 });
    }

    const rows = await sql`
      SELECT
        rs.id,
        rs.library_item_id,
        rs.category_id,
        rs.score,
        json_build_object(
          'id', rc.id,
          'name', rc.name,
          'weight', rc.weight,
          'position', rc.position
        ) as category
      FROM public.review_scores rs
      LEFT JOIN public.review_categories rc ON rc.id = rs.category_id
      WHERE rs.library_item_id = ${libraryItemId}
      ORDER BY rs.created_at ASC
    `;
    return NextResponse.json(rows || []);
  } catch (error) {
    return respostaDeErro(error, "GET /api/reviews/scores");
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const body = await req.json().catch(() => ({}));
    const libraryItemId = String(body.library_item_id || "").trim();
    const categoryId = String(body.category_id || "").trim();
    const score = body.score === null || body.score === undefined || body.score === "" ? null : Number(body.score);

    if (!libraryItemId || !categoryId || !UUID_PATTERN.test(libraryItemId) || !UUID_PATTERN.test(categoryId)) {
      return entradaInvalida("library_item_id e category_id são obrigatórios.");
    }
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 10)) {
      return entradaInvalida("A nota deve estar entre 0 e 10.");
    }

    const sql = getDb();
    const itemRows = await sql`
      SELECT id FROM public.library_items
      WHERE id = ${libraryItemId} AND user_id = ${user.id}
      LIMIT 1
    `;
    if (itemRows.length === 0) {
      return NextResponse.json({ error: "Título não encontrado na sua biblioteca." }, { status: 404 });
    }

    const categoryRows = await sql`
      SELECT id FROM public.review_categories
      WHERE id = ${categoryId} AND user_id = ${user.id}
      LIMIT 1
    `;
    if (categoryRows.length === 0) {
      return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const upsertRows = await sql`
      INSERT INTO public.review_scores (library_item_id, category_id, score, updated_at)
      VALUES (${libraryItemId}, ${categoryId}, ${score}, ${now})
      ON CONFLICT (library_item_id, category_id)
      DO UPDATE SET score = EXCLUDED.score, updated_at = EXCLUDED.updated_at
      RETURNING id, library_item_id, category_id, score
    `;

    const inserted = upsertRows[0];
    const categoryDetail = await sql`
      SELECT
        rs.id,
        rs.library_item_id,
        rs.category_id,
        rs.score,
        json_build_object(
          'id', rc.id,
          'name', rc.name,
          'weight', rc.weight,
          'position', rc.position
        ) as category
      FROM public.review_scores rs
      LEFT JOIN public.review_categories rc ON rc.id = rs.category_id
      WHERE rs.id = ${inserted.id}
      LIMIT 1
    `;
    return NextResponse.json(categoryDetail[0] || inserted);
  } catch (error) {
    return respostaDeErro(error, "POST /api/reviews/scores");
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id || !UUID_PATTERN.test(id)) return entradaInvalida("ID da avaliação inválido.");

    const sql = getDb();
    const scoreRows = await sql`
      SELECT rs.id
      FROM public.review_scores rs
      JOIN public.library_items li ON li.id = rs.library_item_id
      WHERE rs.id = ${id} AND li.user_id = ${user.id}
      LIMIT 1
    `;
    if (scoreRows.length === 0) {
      return NextResponse.json({ error: "Avaliação não encontrada ou sem permissão." }, { status: 404 });
    }

    await sql`DELETE FROM public.review_scores WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/reviews/scores");
  }
}
