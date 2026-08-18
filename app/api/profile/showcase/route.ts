import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respostaDeErro } from "@/lib/api-error";

export async function GET() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: profile }, { data: favorites }, { count: usernameChanges }] = await Promise.all([
    s.from("profiles").select("username,bio,avatar_url,is_public,visibility,follow_policy,followers_visibility,following_visibility").eq("id", user.id).maybeSingle(),
    s.from("profile_favorites").select("media_id,media_type,position,media:media_id(*)").eq("user_id", user.id).order("position"),
    s.from("username_changes").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("changed_at", thirtyDaysAgo),
  ]);
  return NextResponse.json({ profile: profile || {}, favorites: favorites || [], username_changes: { used: Number(usernameChanges || 0), remaining: Math.max(0, 2 - Number(usernameChanges || 0)) } });
}

export async function PUT(request: Request) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const body = await request.json();
    const { data: existingProfile } = await s.from("profiles").select("username").eq("id", user.id).maybeSingle();
    const requestedUsername = String(body.username || "").trim().toLowerCase();
    let username = String(existingProfile?.username || requestedUsername).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return NextResponse.json({ error: "Use de 3 a 24 letras, números ou _." }, { status: 400 });

    let usernameChange = null;
    if (existingProfile?.username && requestedUsername !== existingProfile.username) {
      const { data: changed, error: changeError } = await s.rpc("change_my_username", { requested_username: requestedUsername });
      if (changeError) {
        const message = changeError.message.includes("username_change_limit")
          ? "Você já usou as 2 trocas de @ dos últimos 30 dias."
          : changeError.message.includes("username_taken")
            ? "Esse @ já está em uso."
            : "Não foi possível alterar seu @.";
        return NextResponse.json({ error: message }, { status: changeError.message.includes("limit") ? 429 : 409 });
      }
      usernameChange = Array.isArray(changed) ? changed[0] : changed;
      username = requestedUsername;
      await s.auth.updateUser({ data: { ...user.user_metadata, username } });
    }
    const favorites = (Array.isArray(body.favorites) ? body.favorites : []).filter((item: any) => ["movie", "tv"].includes(item.media_type));
    if (favorites.filter((item: any) => item.media_type === "movie").length > 5 || favorites.filter((item: any) => item.media_type === "tv").length > 5) return NextResponse.json({ error: "Escolha no máximo 5 filmes e 5 séries." }, { status: 400 });

    const favoriteMediaIds: number[] = [
      ...new Set<number>(favorites.map((item: any): number => Number(item.media_id))),
    ];
    if (favoriteMediaIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return NextResponse.json({ error: "Um dos títulos escolhidos é inválido." }, { status: 400 });
    }

    if (favoriteMediaIds.length > 0) {
      const { data: eligible, error: eligibleError } = await s
        .from("library_items")
        .select("media_id, status, media:media_id(media_type)")
        .eq("user_id", user.id)
        .in("media_id", favoriteMediaIds)
        .in("status", ["watched", "rewatching", "rewatched"]);
      if (eligibleError) throw eligibleError;

      const eligibleById = new Map(
        (eligible || []).map((item: any) => {
          const relation = Array.isArray(item.media) ? item.media[0] : item.media;
          return [Number(item.media_id), relation?.media_type];
        }),
      );
      const hasInvalidFavorite = favorites.some(
        (item: any) => eligibleById.get(Number(item.media_id)) !== item.media_type,
      );
      if (hasInvalidFavorite) {
        return NextResponse.json(
          { error: "Escolha apenas filmes e séries assistidos, reassistindo ou reassistidos." },
          { status: 400 },
        );
      }
    }
    const { error: profileError } = await s.from("profiles").upsert({
      id: user.id, display_name: user.user_metadata?.name || user.user_metadata?.full_name || username,
      username, bio: String(body.bio || "").trim().slice(0, 280) || null,
      avatar_url: /^https?:\/\//i.test(String(body.avatar_url || "")) ? String(body.avatar_url).trim().slice(0, 1000) : user.user_metadata?.avatar_url || null,
      visibility: body.visibility === "public" ? "public" : "private",
      is_public: body.visibility === "public",
    }, { onConflict: "id" });
    if (profileError) throw profileError;
    await s.from("profile_favorites").delete().eq("user_id", user.id);
    if (favorites.length) {
      const { error } = await s.from("profile_favorites").insert(favorites.map((item: any) => ({ user_id: user.id, media_id: Number(item.media_id), media_type: item.media_type, position: Number(item.position) })));
      if (error) throw error;
    }
    return NextResponse.json({ success: true, username, username_change: usernameChange });
  } catch (error: any) {
    if (error?.code === "23505") return NextResponse.json({ error: "Esse nome de usuário já está em uso." }, { status: 409 });
    return respostaDeErro(error, "PUT /api/profile/showcase");
  }
}
