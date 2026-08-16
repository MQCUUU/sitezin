import { NextResponse } from "next/server";

import {
  entradaInvalida,
  naoAutenticado,
  respostaDeErro,
} from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function naoEncontrado(mensagem: string) {
  return NextResponse.json(
    { error: mensagem },
    { status: 404 },
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  const libraryItemId =
    new URL(request.url).searchParams.get(
      "library_item_id",
    );

  if (
    !libraryItemId ||
    !UUID_PATTERN.test(libraryItemId)
  ) {
    return entradaInvalida(
      "Título da biblioteca inválido.",
    );
  }

  const {
    data: libraryItem,
    error: libraryError,
  } = await supabase
    .from("library_items")
    .select("id")
    .eq("id", libraryItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (libraryError) {
    return respostaDeErro(
      libraryError,
      "GET /api/reviews/scores library",
    );
  }

  if (!libraryItem) {
    return naoEncontrado(
      "Título não encontrado na sua biblioteca.",
    );
  }

  const { data, error } = await supabase
    .from("review_scores")
    .select(`
      id,
      library_item_id,
      category_id,
      score,
      category:category_id(
        id,
        name,
        weight,
        position
      )
    `)
    .eq("library_item_id", libraryItemId)
    .order("created_at", { ascending: true });

  if (error) {
    return respostaDeErro(
      error,
      "GET /api/reviews/scores",
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

    const libraryItemId =
      typeof body?.library_item_id === "string"
        ? body.library_item_id
        : "";

    const categoryId =
      typeof body?.category_id === "string"
        ? body.category_id
        : "";

    const score =
      body?.score === null ||
      body?.score === undefined ||
      body?.score === ""
        ? null
        : Number(body.score);

    if (!UUID_PATTERN.test(libraryItemId)) {
      return entradaInvalida(
        "Título da biblioteca inválido.",
      );
    }

    if (!UUID_PATTERN.test(categoryId)) {
      return entradaInvalida(
        "Categoria inválida.",
      );
    }

    if (
      score !== null &&
      (!Number.isFinite(score) ||
        score < 0 ||
        score > 10)
    ) {
      return entradaInvalida(
        "A nota deve estar entre 0 e 10.",
      );
    }

    const {
      data: libraryItem,
      error: libraryError,
    } = await supabase
      .from("library_items")
      .select("id")
      .eq("id", libraryItemId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (libraryError) {
      return respostaDeErro(
        libraryError,
        "POST /api/reviews/scores library",
      );
    }

    if (!libraryItem) {
      return naoEncontrado(
        "Título não encontrado na sua biblioteca.",
      );
    }

    const {
      data: category,
      error: categoryError,
    } = await supabase
      .from("review_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (categoryError) {
      return respostaDeErro(
        categoryError,
        "POST /api/reviews/scores category",
      );
    }

    if (!category) {
      return naoEncontrado(
        "Categoria não encontrada.",
      );
    }

    const { data, error } = await supabase
      .from("review_scores")
      .upsert(
        {
          library_item_id: libraryItemId,
          category_id: categoryId,
          score,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict:
            "library_item_id,category_id",
        },
      )
      .select(`
        id,
        library_item_id,
        category_id,
        score,
        category:category_id(
          id,
          name,
          weight,
          position
        )
      `)
      .single();

    if (error) {
      return respostaDeErro(
        error,
        "POST /api/reviews/scores",
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
    new URL(request.url).searchParams.get("id") ||
    "";

  if (!UUID_PATTERN.test(id)) {
    return entradaInvalida(
      "Avaliação inválida.",
    );
  }

  const {
    data: score,
    error: scoreError,
  } = await supabase
    .from("review_scores")
    .select(`
      id,
      library_item:library_item_id(
        user_id
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (scoreError) {
    return respostaDeErro(
      scoreError,
      "DELETE /api/reviews/scores lookup",
    );
  }

  if (!score) {
    return naoEncontrado(
      "Avaliação não encontrada.",
    );
  }

  const libraryItem = Array.isArray(
    score.library_item,
  )
    ? score.library_item[0]
    : score.library_item;

  if (
    !libraryItem ||
    libraryItem.user_id !== user.id
  ) {
    return NextResponse.json(
      { error: "Sem permissão." },
      { status: 403 },
    );
  }

  const {
    data: deleted,
    error,
  } = await supabase
    .from("review_scores")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return respostaDeErro(
      error,
      "DELETE /api/reviews/scores",
    );
  }

  if (!deleted) {
    return naoEncontrado(
      "Avaliação não encontrada.",
    );
  }

  return NextResponse.json({
    success: true,
  });
}