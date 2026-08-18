import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detailsTMDB } from "@/lib/tmdb";

export async function POST() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data, error } = await s.from("library_items")
    .select("id,status,completed_seasons,media_id,media:media_id(tmdb_id,media_type,seasons_count)")
    .eq("user_id", user.id).in("status", ["watched", "rewatched"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const candidates = (data || []).filter((item: any) => {
    const media = Array.isArray(item.media) ? item.media[0] : item.media;
    return media?.media_type === "tv" && media.tmdb_id;
  }).slice(0, 40);
  const reopened: string[] = [];
  for (let index = 0; index < candidates.length; index += 4) {
    await Promise.all(candidates.slice(index, index + 4).map(async (item: any) => {
      const media = Array.isArray(item.media) ? item.media[0] : item.media;
      try {
        const details = await detailsTMDB("tv", media.tmdb_id) as any;
        const seasons = Number(details?.number_of_seasons || 0);
        const completed = Number(item.completed_seasons || media.seasons_count || 0);
        if (!seasons || seasons <= completed) return;
        const { error: updateError } = await s.from("library_items").update({ status: "watching", current_season: Math.max(1, completed + 1), stopped_season: null, stopped_episode: null }).eq("id", item.id).eq("user_id", user.id);
        if (!updateError) reopened.push(item.id);
        await s.from("media").update({ seasons_count: seasons, episodes_count: Number(details?.number_of_episodes || 0) || null }).eq("id", item.media_id);
      } catch { /* Uma falha da API externa não bloqueia as demais séries. */ }
    }));
  }
  return NextResponse.json({ checked: candidates.length, reopened });
}
