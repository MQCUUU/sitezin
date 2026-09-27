import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const libraryItemId = request.nextUrl.searchParams.get("library_item_id");

    const sql = getDb();
    const customLists = await sql`
      SELECT
        cl.id,
        cl.name,
        cl.description,
        cl.created_at,
        COALESCE(l.is_public, false) as is_public,
        (SELECT count(*)::int FROM public.custom_list_items cli WHERE cli.list_id = cl.id) as item_count,
        ${libraryItemId ? sql`EXISTS (
          SELECT 1 FROM public.custom_list_items cli
          WHERE cli.list_id = cl.id AND cli.library_item_id = ${libraryItemId}
        )` : sql`false`} as in_list
      FROM public.custom_lists cl
      LEFT JOIN public.lists l ON l.id = cl.id
      WHERE cl.user_id = ${user.id}
      ORDER BY cl.created_at DESC
    `;

    return NextResponse.json({
      custom_lists: customLists || [],
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/lists");
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
    const name = String(body.name || "").trim().slice(0, 80);
    if (name.length < 2) {
      return entradaInvalida("Use pelo menos 2 caracteres.");
    }
    const description = String(body.description || "").trim().slice(0, 300) || null;
    const isPublic = Boolean(body.is_public);

    const sql = getDb();
    const rows = await sql`
      INSERT INTO public.custom_lists (user_id, name, description)
      VALUES (${user.id}, ${name}, ${description})
      RETURNING id, name, description, created_at
    `;
    const created = rows[0];

    // Mantém public.lists em sincronia
    await sql`
      INSERT INTO public.lists (id, user_id, name, description, is_public, created_at, updated_at)
      VALUES (${created.id}, ${user.id}, ${name}, ${description}, ${isPublic}, ${created.created_at}, now())
      ON CONFLICT (id) DO NOTHING
    `;

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "POST /api/lists");
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
    const id = String(body.id || "").trim();
    if (!id) {
      return entradaInvalida("ID da lista é obrigatório.");
    }

    const name = body.name !== undefined ? String(body.name).trim().slice(0, 80) : undefined;
    if (name !== undefined && name.length < 2) {
      return entradaInvalida("Use pelo menos 2 caracteres no nome.");
    }
    const description = body.description !== undefined ? (String(body.description).trim().slice(0, 300) || null) : undefined;
    const isPublic = body.is_public !== undefined ? Boolean(body.is_public) : undefined;

    const sql = getDb();

    // Atualiza custom_lists com validação estrita de user_id
    const updatedCustom = await sql`
      UPDATE public.custom_lists
      SET
        name = COALESCE(${name}, name),
        description = CASE WHEN ${description !== undefined} THEN ${description} ELSE description END
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id, name, description, created_at
    `;

    // Atualiza lists com validação estrita de user_id
    const updatedStandard = await sql`
      UPDATE public.lists
      SET
        name = COALESCE(${name}, name),
        description = CASE WHEN ${description !== undefined} THEN ${description} ELSE description END,
        is_public = CASE WHEN ${isPublic !== undefined} THEN ${isPublic} ELSE is_public END,
        updated_at = now()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id, name, description, is_public, created_at, updated_at
    `;

    if (updatedCustom.length === 0 && updatedStandard.length === 0) {
      return NextResponse.json({ error: "Lista não encontrada ou sem permissão." }, { status: 404 });
    }

    return NextResponse.json(updatedCustom[0] || updatedStandard[0]);
  } catch (error) {
    return respostaDeErro(error, "PATCH /api/lists");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    let id = request.nextUrl.searchParams.get("id");
    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body?.id ? String(body.id) : null;
    }

    if (!id) {
      return entradaInvalida("ID da lista é obrigatório.");
    }

    const sql = getDb();
    const delCustom = await sql`
      DELETE FROM public.custom_lists
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id
    `;
    const delStandard = await sql`
      DELETE FROM public.lists
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id
    `;

    if (delCustom.length === 0 && delStandard.length === 0) {
      return NextResponse.json({ error: "Lista não encontrada ou sem permissão." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/lists");
  }
}
