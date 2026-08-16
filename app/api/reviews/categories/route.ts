import { NextResponse } from "next/server";

import {
  entradaInvalida,
  naoAutenticado,
  respostaDeErro,
} from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validName(value: unknown) {
  const name =
    typeof value === "string" ? value.trim() : "";

  return name.length >= 1 && name.length <= 80
    ? name
    : null;
}

function validWeight(value: unknown) {
  const weight = Number(value ?? 0);

  return Number.isFinite(weight) &&
    weight >= 0 &&
    weight <= 100
    ? weight
    : null;
}

function validPosition(value: unknown) {
  const position = Number(value ?? 0);

  return Number.isInteger(position) &&
    position >= 0 &&
    position <= 1000
    ? position
    : null;
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  const { data, error } = await supabase
    .from("review_categories")
    .select(
      "id, name, weight, position, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  if (error) {
    return respostaDeErro(
      error,
      "GET /api/reviews/categories",
    );
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  try {
    const body = await request.json();

    const name = validName(body?.name);
    const weight = validWeight(body?.weight);
    const position = validPosition(body?.position);

    if (!name) {
      return entradaInvalida(
        "O nome deve ter entre 1 e 80 caracteres.",
      );
    }

    if (weight === null) {
      return entradaInvalida(
        "O peso deve estar entre 0 e 100.",
      );
    }

    if (position === null) {
      return entradaInvalida(
        "A posição deve ser um número inteiro entre 0 e 1000.",
      );
    }

    const { data, error } = await supabase
      .from("review_categories")
      .insert({
        user_id: user.id,
        name,
        weight,
        position,
      })
      .select(
        "id, name, weight, position, created_at, updated_at",
      )
      .single();

    if (error) {
      return respostaDeErro(
        error,
        "POST /api/reviews/categories",
      );
    }

    return NextResponse.json(data);
  } catch {
    return entradaInvalida("Dados inválidos.");
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  try {
    const body = await request.json();

    const id =
      typeof body?.id === "string" ? body.id : "";

    if (!UUID_PATTERN.test(id)) {
      return entradaInvalida("Categoria inválida.");
    }

    const updates: {
      name?: string;
      weight?: number;
      position?: number;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (body?.name !== undefined) {
      const name = validName(body.name);

      if (!name) {
        return entradaInvalida(
          "O nome deve ter entre 1 e 80 caracteres.",
        );
      }

      updates.name = name;
    }

    if (body?.weight !== undefined) {
      const weight = validWeight(body.weight);

      if (weight === null) {
        return entradaInvalida(
          "O peso deve estar entre 0 e 100.",
        );
      }

      updates.weight = weight;
    }

    if (body?.position !== undefined) {
      const position = validPosition(body.position);

      if (position === null) {
        return entradaInvalida(
          "A posição deve ser um número inteiro entre 0 e 1000.",
        );
      }

      updates.position = position;
    }

    if (Object.keys(updates).length === 1) {
      return entradaInvalida(
        "Nenhuma alteração válida foi enviada.",
      );
    }

    const { data, error } = await supabase
      .from("review_categories")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        "id, name, weight, position, created_at, updated_at",
      )
      .maybeSingle();

    if (error) {
      return respostaDeErro(
        error,
        "PATCH /api/reviews/categories",
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(data);
  } catch {
    return entradaInvalida("Dados inválidos.");
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  const id =
    new URL(request.url).searchParams.get("id") || "";

  if (!UUID_PATTERN.test(id)) {
    return entradaInvalida("Categoria inválida.");
  }

  const { data, error } = await supabase
    .from("review_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return respostaDeErro(
      error,
      "DELETE /api/reviews/categories",
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Categoria não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}