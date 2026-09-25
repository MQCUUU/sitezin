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
    const standardTags = await sql`
      SELECT id, name, description, color, created_at, updated_at
      FROM public.tags
      WHERE user_id = ${user.id}
      ORDER BY name ASC
    `;

    const personalTags = await sql`
      SELECT id, name
      FROM public.personal_tags
      WHERE user_id = ${user.id}
      ORDER BY name ASC
    `;

    return NextResponse.json({
      tags: standardTags || [],
      personal_tags: personalTags || [],
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/tags");
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
    const name = String(body.name || "").trim();
    if (!name) {
      return entradaInvalida("Nome da tag é obrigatório.");
    }

    const description = String(body.description || "").trim() || null;
    const color = String(body.color || "#3b82f6").trim();

    const sql = getDb();

    // Cria em public.tags
    const rows = await sql`
      INSERT INTO public.tags (user_id, name, description, color, created_at, updated_at)
      VALUES (${user.id}, ${name}, ${description}, ${color}, now(), now())
      RETURNING id, name, description, color, created_at, updated_at
    `;
    const created = rows[0];

    // Mantém em public.personal_tags
    await sql`
      INSERT INTO public.personal_tags (id, user_id, name)
      VALUES (${created.id}, ${user.id}, ${name})
      ON CONFLICT (user_id, name) DO NOTHING
    `;

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "POST /api/tags");
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
      return entradaInvalida("ID da tag é obrigatório.");
    }

    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const description = body.description !== undefined ? (String(body.description).trim() || null) : undefined;
    const color = body.color !== undefined ? String(body.color).trim() : undefined;

    const sql = getDb();

    // Ownership check estrito: WHERE id = id AND user_id = user.id
    const updated = await sql`
      UPDATE public.tags
      SET
        name = COALESCE(${name}, name),
        description = CASE WHEN ${description !== undefined} THEN ${description} ELSE description END,
        color = COALESCE(${color}, color),
        updated_at = now()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id, name, description, color, created_at, updated_at
    `;

    if (name !== undefined) {
      await sql`
        UPDATE public.personal_tags
        SET name = ${name}
        WHERE id = ${id} AND user_id = ${user.id}
      `;
    }

    if (updated.length === 0) {
      return NextResponse.json({ error: "Tag não encontrada ou sem permissão." }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (error) {
    return respostaDeErro(error, "PATCH /api/tags");
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
      return entradaInvalida("ID da tag é obrigatório.");
    }

    const sql = getDb();

    // Ownership check estrito
    const delTags = await sql`
      DELETE FROM public.tags
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id
    `;
    const delPersonal = await sql`
      DELETE FROM public.personal_tags
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id
    `;

    if (delTags.length === 0 && delPersonal.length === 0) {
      return NextResponse.json({ error: "Tag não encontrada ou sem permissão." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/tags");
  }
}
