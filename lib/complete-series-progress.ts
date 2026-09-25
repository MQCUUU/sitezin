import { seasonTMDB } from "@/lib/tmdb";
import { getDb } from "@/lib/db/neon";

type ProgressClient = {
  from?: (table: string) => any;
};

export async function completeSeriesProgress({
  supabase,
  userId,
  mediaId,
  tmdbId,
  seasonsCount,
}: {
  supabase?: ProgressClient;
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

  const sql = getDb();
  for (const row of rows) {
    await sql`
      INSERT INTO public.episodes_progress (
        user_id, media_id, season_number, episode_number, watched, watched_at
      )
      VALUES (
        ${row.user_id}, ${row.media_id}, ${row.season_number}, ${row.episode_number}, true, ${row.watched_at}
      )
      ON CONFLICT (user_id, media_id, season_number, episode_number)
      DO UPDATE SET watched = true, watched_at = EXCLUDED.watched_at
    `;
  }
}

export async function resetSeriesProgress({
  supabase,
  userId,
  mediaId,
}: {
  supabase?: ProgressClient;
  userId: string;
  mediaId: number;
}) {
  const sql = getDb();
  await sql`
    UPDATE public.episodes_progress
    SET watched = false, watched_at = null
    WHERE user_id = ${userId} AND media_id = ${mediaId}
  `;
}

export async function restoreSeriesProgress({
  supabase,
  userId,
  mediaId,
}: {
  supabase?: ProgressClient;
  userId: string;
  mediaId: number;
}) {
  const sql = getDb();
  await sql`
    UPDATE public.episodes_progress
    SET watched = true, watched_at = now()
    WHERE user_id = ${userId} AND media_id = ${mediaId}
  `;
}
