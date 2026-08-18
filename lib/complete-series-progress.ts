import { seasonTMDB } from "@/lib/tmdb";

type ProgressClient = {
  from: (table: string) => any;
};

export async function completeSeriesProgress({
  supabase,
  userId,
  mediaId,
  tmdbId,
  seasonsCount,
}: {
  supabase: ProgressClient;
  userId: string;
  mediaId: number;
  tmdbId: number;
  seasonsCount: number;
}) {
  if (!tmdbId || seasonsCount < 1) return;

  const seasons = await Promise.all(
    Array.from({ length: seasonsCount }, (_, index) => seasonTMDB(tmdbId, index + 1)),
  );
  const watchedAt = new Date().toISOString();
  const rows = seasons.flatMap((season: any, index) =>
    (Array.isArray(season?.episodes) ? season.episodes : []).map((episode: any) => ({
      user_id: userId,
      media_id: mediaId,
      season_number: index + 1,
      episode_number: Number(episode.episode_number),
      watched: true,
      watched_at: watchedAt,
    })),
  ).filter((row) => Number.isInteger(row.episode_number) && row.episode_number > 0);

  // Evita requisições grandes demais em séries com muitas temporadas.
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from("episodes_progress").upsert(rows.slice(index, index + 500), {
      onConflict: "user_id,media_id,season_number,episode_number",
    });
    if (error) throw error;
  }
}

export async function resetSeriesProgress({
  supabase,
  userId,
  mediaId,
}: {
  supabase: ProgressClient;
  userId: string;
  mediaId: number;
}) {
  const { error } = await supabase.from("episodes_progress").update({
    watched: false,
    watched_at: null,
  }).eq("user_id", userId).eq("media_id", mediaId);
  if (error) throw error;
}

export async function restoreSeriesProgress({
  supabase,
  userId,
  mediaId,
}: {
  supabase: ProgressClient;
  userId: string;
  mediaId: number;
}) {
  const { error } = await supabase.from("episodes_progress").update({
    watched: true,
    watched_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("media_id", mediaId);
  if (error) throw error;
}
