import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detailsTMDB } from "@/lib/tmdb";

const dateAtNoonUtc = (date?: string | null) => date ? `${date}T12:00:00.000Z` : null;

export async function POST() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const [{ data, error }, { data: preferences }] = await Promise.all([
    s.from("library_items").select("id,status,favorite,completed_seasons,media_id,media:media_id(tmdb_id,media_type,title,seasons_count)").eq("user_id", user.id).or("favorite.eq.true,status.in.(watched,rewatched)").limit(40),
    s.from("notification_preferences").select("new_season_site,new_episode_site").eq("user_id", user.id).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const candidates = (data || []).filter((item: any) => {
    const media = Array.isArray(item.media) ? item.media[0] : item.media;
    return media?.media_type === "tv" && media.tmdb_id && (item.favorite || ["watched", "rewatched"].includes(item.status));
  }).slice(0, 40);
  const reopened: string[] = [];
  const generated: string[] = [];
  for (let index = 0; index < candidates.length; index += 4) {
    await Promise.all(candidates.slice(index, index + 4).map(async (item: any) => {
      const media = Array.isArray(item.media) ? item.media[0] : item.media;
      try {
        const details = await detailsTMDB("tv", media.tmdb_id) as any;
        const seasons = Number(details?.number_of_seasons || 0);
        const knownSeasons = Number(media.seasons_count || 0);
        const completed = Number(item.completed_seasons || knownSeasons || 0);
        if (["watched", "rewatched"].includes(item.status) && seasons > completed) {
          const { error: updateError } = await s.from("library_items").update({ status: "watching", current_season: completed + 1, stopped_season: null, stopped_episode: null }).eq("id", item.id).eq("user_id", user.id);
          if (!updateError) reopened.push(item.id);
        }
        const notices: any[] = [];
        if (item.favorite && knownSeasons > 0 && seasons > knownSeasons && preferences?.new_season_site !== false) {
          const season = (details.seasons || []).filter((row: any) => Number(row.season_number) === seasons)[0];
          notices.push({ user_id: user.id, event_key: `season:${media.tmdb_id}:${seasons}`, type: "new_season", title: `Nova temporada de ${details.name || media.title}`, message: `A temporada ${seasons} foi anunciada${season?.air_date ? ` para ${season.air_date}` : ""}.`, href: `/title/tv/${media.tmdb_id}`, release_at: dateAtNoonUtc(season?.air_date), release_precision: "date", metadata: { tmdb_id: media.tmdb_id, season_number: seasons } });
        }
        const episode = details?.next_episode_to_air;
        if (item.favorite && episode?.air_date && preferences?.new_episode_site !== false) {
          notices.push({ user_id: user.id, event_key: `episode:${media.tmdb_id}:${episode.season_number}:${episode.episode_number}:${episode.air_date}`, type: "new_episode", title: `Novo episódio de ${details.name || media.title}`, message: `T${episode.season_number} E${episode.episode_number}${episode.name ? ` · ${episode.name}` : ""}`, href: `/title/tv/${media.tmdb_id}`, release_at: dateAtNoonUtc(episode.air_date), release_precision: "date", metadata: { tmdb_id: media.tmdb_id, season_number: episode.season_number, episode_number: episode.episode_number } });
        }
        if (notices.length) {
          const { data: inserted } = await s.from("notifications").upsert(notices, { onConflict: "user_id,event_key", ignoreDuplicates: true }).select("id");
          generated.push(...(inserted || []).map((row: any) => row.id));
        }
        if (seasons && seasons !== knownSeasons) await s.from("media").update({ seasons_count: seasons, episodes_count: Number(details?.number_of_episodes || 0) || null }).eq("id", item.media_id);
      } catch { /* Falha isolada da fonte externa. */ }
    }));
  }
  return NextResponse.json({ checked: candidates.length, reopened, generated });
}
