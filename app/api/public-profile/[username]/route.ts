import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Perfil indisponível." }, { status: 503 });
  const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await s.from("profiles").select("id,display_name,username,bio,avatar_url,is_public,visibility,follow_policy,followers_visibility,following_visibility,activity_visibility,diary_visibility,lists_visibility,likes_visibility,created_at").ilike("username", username).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  const server = await createServerClient();
  const { data: { user: viewer } } = await server.auth.getUser();
  let canView = profile.visibility === "public" || profile.is_public || viewer?.id === profile.id;

  const { data: viewerFollow } = viewer && viewer.id !== profile.id
    ? await s.from("follows").select("status").eq("follower_id", viewer.id).eq("following_id", profile.id).maybeSingle()
    : { data: null };
  if (!canView) canView = viewerFollow?.status === "accepted";

  if (!canView) {
    const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
      s.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile.id).eq("status", "accepted"),
      s.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile.id).eq("status", "accepted"),
    ]);
    return NextResponse.json({ profile, locked: true, favorites: [], activity: [], recent_reviews: [], liked_titles: [], lists: [], diary: [], social: { followers_count: followersCount || 0, following_count: followingCount || 0, relationship: viewerFollow?.status || "none", can_follow: profile.follow_policy !== "nobody", followers: null, following: null, viewer_following_ids: [] } }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  }
  const [{ data: favorites }, { data: library }, { data: followers }, { data: following }, { data: lists }, { data: diary }] = await Promise.all([
    s.from("profile_favorites").select("media_type,position,media:media_id(*)").eq("user_id", profile.id).order("position"),
    s.from("library_items").select("id,status,personal_rating,review,favorite,watched_at,added_at,updated_at,media:media_id(tmdb_id,media_type,title,poster_path)").eq("user_id", profile.id),
    s.from("follows").select("follower_id,profile:follower_id(id,username,display_name,avatar_url)").eq("following_id", profile.id).eq("status", "accepted"),
    s.from("follows").select("following_id,profile:following_id(id,username,display_name,avatar_url)").eq("follower_id", profile.id).eq("status", "accepted"),
    s.from("custom_lists").select("id,name,description,created_at,items:custom_list_items(count)").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(20),
    s.from("watch_entries").select("id,watched_at,rating,comment,is_rewatch,library:library_item_id(media:media_id(tmdb_id,media_type,title,poster_path))").eq("user_id", profile.id).order("watched_at", { ascending: false }).limit(12),
  ]);
  const rows = library || [];
  const stats = {
    total: rows.length,
    watched: rows.filter((item: any) => ["watched", "rewatching", "rewatched"].includes(item.status)).length,
    movies: rows.filter((item: any) => (Array.isArray(item.media) ? item.media[0] : item.media)?.media_type === "movie").length,
    series: rows.filter((item: any) => (Array.isArray(item.media) ? item.media[0] : item.media)?.media_type === "tv").length,
  };
  const isOwner = viewer?.id === profile.id;
  const isFollower = viewerFollow?.status === "accepted";
  const [viewerFollowingResult, followersCountResult, followingCountResult] = await Promise.all([
    viewer
      ? s.from("follows").select("following_id").eq("follower_id", viewer.id).eq("status", "accepted")
      : Promise.resolve({ data: [] as { following_id: string }[] }),
    s.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile.id).eq("status", "accepted"),
    s.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile.id).eq("status", "accepted"),
  ]);
  const viewerFollowing = viewerFollowingResult.data || [];
  const sectionVisible = (setting: string) => isOwner || setting === "profile" || (setting === "followers" && isFollower);
  const activityVisible = sectionVisible(profile.activity_visibility);
  const diaryVisible = sectionVisible(profile.diary_visibility);
  const listsVisible = sectionVisible(profile.lists_visibility);
  const likesVisible = sectionVisible(profile.likes_visibility);
  return NextResponse.json(
    {
      profile, favorites: favorites || [], stats,
      activity: activityVisible ? rows.slice().sort((a: any, b: any) => new Date(b.updated_at || b.added_at).getTime() - new Date(a.updated_at || a.added_at).getTime()).slice(0, 12) : [],
      recent_reviews: activityVisible ? rows.filter((item: any) => item.review || item.personal_rating != null).sort((a: any, b: any) => new Date(b.updated_at || b.added_at).getTime() - new Date(a.updated_at || a.added_at).getTime()).slice(0, 8) : [],
      liked_titles: likesVisible ? rows.filter((item: any) => item.favorite).slice(0, 20) : [],
      lists: listsVisible ? lists || [] : [], diary: diaryVisible ? diary || [] : [],
      section_visibility: { activity: activityVisible, diary: diaryVisible, lists: listsVisible, likes: likesVisible },
      social: {
        // Os contadores vêm de consultas COUNT independentes. Assim, configurações
        // de privacidade e joins de perfil nunca alteram os totais exibidos.
        followers_count: followersCountResult.count || 0,
        following_count: followingCountResult.count || 0,
        relationship: isOwner ? "self" : viewerFollow?.status || "none",
        can_follow: !isOwner && profile.follow_policy !== "nobody",
        followers: sectionVisible(profile.followers_visibility) ? followers || [] : null,
        following: sectionVisible(profile.following_visibility) ? following || [] : null,
        viewer_following_ids: (viewerFollowing || []).map((row: any) => row.following_id),
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Vary": "Cookie",
      },
    },
  );
}
