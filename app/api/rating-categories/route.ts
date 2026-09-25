import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const sql = getDb();
    const rows = await sql`
      SELECT id, user_id, name, weight, position, active
      FROM public.rating_categories
      WHERE user_id = ${user.id}
      ORDER BY position ASC
    `;

    return NextResponse.json(rows || []);
  } catch (error) {
    return respostaDeErro(error, "GET /api/rating-categories");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || "").trim();

    if (!name) {
      return entradaInvalida("Nome da categoria é obrigatório.");
    }

    const sql = getDb();

    // Determinar position
    const countRes = await sql`
      SELECT count(*)::int as count
      FROM public.rating_categories
      WHERE user_id = ${user.id}
    `;
    const nextPos = Number(body.position ?? countRes[0]?.count ?? 0);
    const weight = Number(body.weight ?? 0);

    const rows = await sql`
      INSERT INTO public.rating_categories (
        user_id,
        name,
        weight,
        position
      )
      VALUES (
        ${user.id},
        ${name},
        ${weight},
        ${nextPos}
      )
      RETURNING id, user_id, name, weight, position, active
    `;

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Já existe uma categoria com este nome." },
        { status: 409 },
      );
    }
    return respostaDeErro(error, "POST /api/rating-categories");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "").trim();

    if (!id) {
      return entradaInvalida("ID da categoria é obrigatório.");
    }

    const sql = getDb();
    const existing = await sql`
      SELECT id, user_id, name, weight, position
      FROM public.rating_categories
      WHERE id = ${id} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 },
      );
    }

    const current = existing[0];
    const newName = body.name !== undefined ? String(body.name).trim() : current.name;
    const newWeight = body.weight !== undefined ? Number(body.weight) : current.weight;
    const newPos = body.position !== undefined ? Number(body.position) : current.position;

    const updated = await sql`
      UPDATE public.rating_categories
      SET
        name = ${newName},
        weight = ${newWeight},
        position = ${newPos}
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id, user_id, name, weight, position, active
    `;

    return NextResponse.json(updated[0]);
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Já existe uma categoria com este nome." },
        { status: 409 },
      );
    }
    return respostaDeErro(error, "PATCH /api/rating-categories");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return entradaInvalida("ID da categoria é obrigatório.");
    }

    const sql = getDb();
    await sql`
      DELETE FROM public.rating_categories
      WHERE id = ${id} AND user_id = ${user.id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/rating-categories");
  }
}
