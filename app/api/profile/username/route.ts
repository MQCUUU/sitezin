import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ authenticated: false });
  const { data, error } = await s.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ authenticated: true, username: data?.username || null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json();
  const username = String(body.username || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return NextResponse.json({ error: "Use de 3 a 24 letras, números ou _." }, { status: 400 });

  const { data: current } = await s.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if (current?.username) return NextResponse.json({ username: current.username });

  const { error } = await s.from("profiles").upsert({
    id: user.id,
    username,
    display_name: user.user_metadata?.display_name || user.user_metadata?.name || username,
    avatar_url: user.user_metadata?.avatar_url || null,
    visibility: "private",
    is_public: false,
  }, { onConflict: "id" });
  if (error?.code === "23505") return NextResponse.json({ error: "Esse @ já está em uso." }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await s.auth.updateUser({ data: { ...user.user_metadata, username } });
  return NextResponse.json({ username });
}
