import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data, error } = await s.from("profiles")
    .select("visibility,follow_policy,followers_visibility,following_visibility,activity_visibility,diary_visibility,lists_visibility,likes_visibility").eq("id", user.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json();
  const visibility = ["public", "private"].includes(body.visibility) ? body.visibility : "private";
  const followPolicy = ["profile", "approval", "nobody"].includes(body.follow_policy) ? body.follow_policy : "profile";
  const validList = (value: unknown) => ["profile", "followers", "private"].includes(String(value));
  const { error } = await s.from("profiles").update({
    visibility,
    is_public: visibility === "public",
    follow_policy: followPolicy,
    followers_visibility: validList(body.followers_visibility) ? body.followers_visibility : "profile",
    following_visibility: validList(body.following_visibility) ? body.following_visibility : "profile",
    activity_visibility: validList(body.activity_visibility) ? body.activity_visibility : "profile",
    diary_visibility: validList(body.diary_visibility) ? body.diary_visibility : "profile",
    lists_visibility: validList(body.lists_visibility) ? body.lists_visibility : "profile",
    likes_visibility: validList(body.likes_visibility) ? body.likes_visibility : "profile",
  }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
