import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Não autenticado" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const libraryItemId = url.searchParams.get("library_item_id");

  if (!libraryItemId) {
    return NextResponse.json(
      { error: "library_item_id não informado." },
      { status: 400 }
    );
  }

  // Primeiro verificamos se o título pertence ao usuário.
  const { data: libraryItem, error: libraryError } =
    await supabase
      .from("library_items")
      .select("id")
      .eq("id", libraryItemId)
      .eq("user_id", user.id)
      .maybeSingle();

  if (libraryError) {
    return NextResponse.json(
      { error: libraryError.message },
      { status: 500 }
    );
  }

  if (!libraryItem) {
    return NextResponse.json(
      { error: "Título não encontrado na sua biblioteca." },
      { status: 404 }
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
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Não autenticado" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const libraryItemId = String(
      body.library_item_id || ""
    );

    const categoryId = String(
      body.category_id || ""
    );

    const score =
      body.score === null ||
      body.score === undefined ||
      body.score === ""
        ? null
        : Number(body.score);

    if (!libraryItemId || !categoryId) {
      return NextResponse.json(
        {
          error:
            "library_item_id e category_id são obrigatórios.",
        },
        { status: 400 }
      );
    }

    if (
      score !== null &&
      (Number.isNaN(score) || score < 0 || score > 10)
    ) {
      return NextResponse.json(
        {
          error:
            "A nota deve estar entre 0 e 10.",
        },
        { status: 400 }
      );
    }

    // Verifica se o título pertence ao usuário.
    const { data: libraryItem } = await supabase
      .from("library_items")
      .select("id")
      .eq("id", libraryItemId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!libraryItem) {
      return NextResponse.json(
        {
          error:
            "Título não encontrado na sua biblioteca.",
        },
        { status: 404 }
      );
    }

    // Verifica se a categoria pertence ao usuário.
    const { data: category } = await supabase
      .from("review_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!category) {
      return NextResponse.json(
        {
          error:
            "Categoria não encontrada.",
        },
        { status: 404 }
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
        }
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
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Dados inválidos." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Não autenticado" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);

  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "ID da avaliação não informado." },
      { status: 400 }
    );
  }

  // Garante que a nota pertence a um título do usuário.
  const { data: score } = await supabase
    .from("review_scores")
    .select(`
      id,
      library_item:library_item_id(
        user_id
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (!score) {
    return NextResponse.json(
      { error: "Avaliação não encontrada." },
      { status: 404 }
    );
  }

  const libraryItem = Array.isArray(score.library_item)
    ? score.library_item[0]
    : score.library_item;

  if (!libraryItem || libraryItem.user_id !== user.id) {
    return NextResponse.json(
      { error: "Sem permissão." },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("review_scores")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
  });
}