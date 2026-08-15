import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  const { data, error } = await supabase
    .from("review_categories")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true });

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

    const name = String(body.name || "").trim();
    const weight = Number(body.weight ?? 0);
    const position = Number(body.position ?? 0);

    if (!name) {
      return NextResponse.json(
        { error: "O nome da categoria é obrigatório." },
        { status: 400 }
      );
    }

    if (weight < 0 || weight > 100) {
      return NextResponse.json(
        { error: "O peso deve estar entre 0 e 100." },
        { status: 400 }
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
      .select()
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

export async function PATCH(req: Request) {
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

    const id = String(body.id || "");

    if (!id) {
      return NextResponse.json(
        { error: "ID da categoria não informado." },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updates.name = String(body.name).trim();
    }

    if (body.weight !== undefined) {
      const weight = Number(body.weight);

      if (weight < 0 || weight > 100) {
        return NextResponse.json(
          { error: "O peso deve estar entre 0 e 100." },
          { status: 400 }
        );
      }

      updates.weight = weight;
    }

    if (body.position !== undefined) {
      updates.position = Number(body.position);
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("review_categories")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
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
      { error: "ID da categoria não informado." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("review_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

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