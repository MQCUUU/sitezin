import { NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length >= 1 && name.length <= 80 ? name : null;
}

function validWeight(value: unknown) {
  const weight = Number(value ?? 0);
  return Number.isFinite(weight) && weight >= 0 && weight <= 100
    ? weight
    : null;
}

function validPosition(value: unknown) {
  const position = Number(value ?? 0);
  return Number.isInteger(position) && position >= 0 && position <= 1000
    ? position
    : null;
}

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const sql = getDb();
    const rows = await sql`
      SELECT id, name, weight, position, created_at, updated_at
      FROM public.review_categories
      WHERE user_id = ${user.id}
      ORDER BY position ASC
    `;
    return NextResponse.json(rows || []);
  } catch (error) {
    return respostaDeErro(error, "GET /api/reviews/categories");
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const name = validName(body?.name);
    const weight = validWeight(body?.weight);
    const position = validPosition(body?.position);

    if (!name) return entradaInvalida("O nome deve ter entre 1 e 80 caracteres.");
    if (weight === null) return entradaInvalida("O peso deve estar entre 0 e 100.");
    if (position === null) return entradaInvalida("A posição deve ser um número inteiro entre 0 e 1000.");

    const sql = getDb();
    const rows = await sql`
      INSERT INTO public.review_categories (user_id, name, weight, position)
      VALUES (${user.id}, ${name}, ${weight}, ${position})
      RETURNING id, name, weight, position, created_at, updated_at
    `;
    return NextResponse.json(rows[0]);
  } catch (error) {
    return respostaDeErro(error, "POST /api/reviews/categories");
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : "";
    if (!UUID_PATTERN.test(id)) return entradaInvalida("Categoria inválida.");

    const sql = getDb();
    const existing = await sql`
      SELECT id, name, weight, position
      FROM public.review_categories
      WHERE id = ${id} AND user_id = ${user.id}
      LIMIT 1
    `;
    if (existing.length === 0) {
      return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    }

    const current = existing[0];
    let nextName = current.name;
    let nextWeight = current.weight;
    let nextPos = current.position;
    let hasChange = false;

    if (body?.name !== undefined) {
      const parsedName = validName(body.name);
      if (!parsedName) return entradaInvalida("O nome deve ter entre 1 e 80 caracteres.");
      nextName = parsedName;
      hasChange = true;
    }
    if (body?.weight !== undefined) {
      const parsedWeight = validWeight(body.weight);
      if (parsedWeight === null) return entradaInvalida("O peso deve estar entre 0 e 100.");
      nextWeight = parsedWeight;
      hasChange = true;
    }
    if (body?.position !== undefined) {
      const parsedPos = validPosition(body.position);
      if (parsedPos === null) return entradaInvalida("A posição deve ser um número inteiro entre 0 e 1000.");
      nextPos = parsedPos;
      hasChange = true;
    }
    if (!hasChange) return entradaInvalida("Nenhuma alteração válida foi enviada.");

    const now = new Date().toISOString();
    const updated = await sql`
      UPDATE public.review_categories
      SET name = ${nextName}, weight = ${nextWeight}, position = ${nextPos}, updated_at = ${now}
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id, name, weight, position, created_at, updated_at
    `;
    return NextResponse.json(updated[0]);
  } catch (error) {
    return respostaDeErro(error, "PATCH /api/reviews/categories");
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const id = new URL(request.url).searchParams.get("id") || "";
    if (!UUID_PATTERN.test(id)) return entradaInvalida("Categoria inválida.");

    const sql = getDb();
    const deleted = await sql`
      DELETE FROM public.review_categories
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id
    `;
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/reviews/categories");
  }
}
