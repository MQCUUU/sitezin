import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

async function context() {
  const server = await createClient();
  const { data: { user } } = await server.auth.getUser();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = url && key ? createAdmin(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return { user, admin };
}

export async function GET() {
  const { user, admin } = await context();
  if (!user || !admin) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: rows } = await admin.from("follows").select("follower_id,following_id,status,created_at")
    .or(`follower_id.eq.${user.id},following_id.eq.${user.id}`).order("created_at", { ascending: false });
  const ids = [...new Set((rows || []).map((row: any) => row.follower_id === user.id ? row.following_id : row.follower_id))];
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id,username,display_name,avatar_url,visibility").in("id", ids)
    : { data: [] as any[] };
  const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
  const enriched = (rows || []).map((row: any) => ({
    ...row,
    direction: row.follower_id === user.id ? "following" : "follower",
    profile: profileMap.get(row.follower_id === user.id ? row.following_id : row.follower_id),
  }));
  return NextResponse.json({
    following: enriched.filter((row: any) => row.direction === "following" && row.status === "accepted"),
    followers: enriched.filter((row: any) => row.direction === "follower" && row.status === "accepted"),
    incoming: enriched.filter((row: any) => row.direction === "follower" && row.status === "pending"),
    outgoing: enriched.filter((row: any) => row.direction === "following" && row.status === "pending"),
  });
}

export async function POST(request: Request) {
  const { user, admin } = await context();
  if (!user || !admin) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { username } = await request.json();
  const { data: target } = await admin.from("profiles").select("id,visibility,follow_policy")
    .ilike("username", String(username || "").trim()).maybeSingle();
  if (!target || target.id === user.id) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (target.follow_policy === "nobody") return NextResponse.json({ error: "Este usuário não está aceitando novos seguidores." }, { status: 403 });
  const automatic = target.follow_policy === "profile" && target.visibility === "public";
  const status = automatic ? "accepted" : "pending";
  const { error } = await admin.from("follows").upsert({
    follower_id: user.id, following_id: target.id, status, updated_at: new Date().toISOString(),
  }, { onConflict: "follower_id,following_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ status });
}

export async function PATCH(request: Request) {
  const { user, admin } = await context();
  if (!user || !admin) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { follower_id, action } = await request.json();
  if (!follower_id || !["accept", "reject"].includes(action)) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  if (action === "reject") {
    await admin.from("follows").delete().eq("follower_id", follower_id).eq("following_id", user.id).eq("status", "pending");
  } else {
    await admin.from("follows").update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("follower_id", follower_id).eq("following_id", user.id).eq("status", "pending");
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { user, admin } = await context();
  if (!user || !admin) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { user_id, mode } = await request.json();
  if (!user_id || !["unfollow", "remove_follower"].includes(mode)) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const query = admin.from("follows").delete();
  const { error } = mode === "unfollow"
    ? await query.eq("follower_id", user.id).eq("following_id", user_id)
    : await query.eq("follower_id", user_id).eq("following_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
