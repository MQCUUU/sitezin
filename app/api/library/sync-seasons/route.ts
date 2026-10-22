import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { detailsTMDB } from "@/lib/tmdb";
import { todayIn } from "@/lib/calendar/dates";
import { buildSeriesNotices } from "@/lib/notifications/series";


export async function POST() {
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;
  if (!user || !user.id) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sql = getDb();
  const [data, preferencesRows] = await Promise.all([
    sql`
      SELECT
        li.id,
        li.status,
        li.favorite,
        li.completed_seasons,
        li.media_id,
        json_build_object(
          'tmdb_id', m.tmdb_id,
          'media_type', m.media_type,
          'title', m.title,
          'seasons_count', m.seasons_count
        ) AS media
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${user.id}
        AND m.media_type = 'tv'
        AND (li.favorite = true OR li.status IN ('watched', 'rewatched'))
      ORDER BY li.favorite DESC, li.updated_at DESC, li.id
      LIMIT 40
    `,
    sql`
      SELECT new_season_site, new_episode_site
      FROM public.notification_preferences
      WHERE user_id = ${user.id}
      LIMIT 1
    `,
  ]);

  const preferences = preferencesRows[0] || null;

  const candidates = (data || []).filter((item: any) => {
    const media = Array.isArray(item.media) ? item.media[0] : item.media;
    return media?.media_type === "tv" && media.tmdb_id && (item.favorite || ["watched", "rewatched"].includes(item.status));
  }).slice(0, 40);

  const reopened: string[] = [];
  const today = todayIn();
  const generated: string[] = [];

  for (let index = 0; index < candidates.length; index += 4) {
    await Promise.all(
      candidates.slice(index, index + 4).map(async (item: any) => {
        const media = Array.isArray(item.media) ? item.media[0] : item.media;
        try {
          const details = (await detailsTMDB("tv", media.tmdb_id)) as any;
          const seasons = Number(details?.number_of_seasons || 0);
          const knownSeasons = Number(media.seasons_count || 0);
          const completed = Number(item.completed_seasons || knownSeasons || 0);

          if (["watched", "rewatched"].includes(item.status) && seasons > completed) {
            /*
             * `stopped_episode` não existe em nenhum DDL versionado
             * (db/legacy/supabase/schema.sql nem os demais .sql do repo) — só
             * `stopped_season`. Referenciá-la aqui fazia esse UPDATE
             * inteiro lançar (coluna inexistente), engolido pelo catch
             * por-item como se fosse falha do TMDB: a reabertura de série
             * finalizada nunca executava de fato. Nenhum outro ponto do
             * código lê ou escreve `stopped_episode` (C5.2 §6 — dívida
             * documentada, sem migration: a coluna nunca teve um
             * consumer real).
             */
            await sql`
              UPDATE public.library_items
              SET status = 'watching', current_season = ${completed + 1}, stopped_season = null, updated_at = now()
              WHERE id = ${item.id} AND user_id = ${user.id}
            `;
            reopened.push(item.id);
          }

          // V3.3: regra por usuário (lib/notifications/series.ts) — não depende
          // mais de media.seasons_count, que é do catálogo compartilhado.
          const notices = buildSeriesNotices({
            tmdbId: Number(media.tmdb_id),
            title: media.title,
            favorite: Boolean(item.favorite),
            details,
            prefs: preferences,
            today,
          });

          for (const notice of notices) {
            const inserted = await sql`
              INSERT INTO public.notifications (
                user_id, event_key, type, title, message, href, release_at, release_precision, metadata, created_at
              )
              VALUES (
                ${user.id},
                ${notice.event_key},
                ${notice.type},
                ${notice.title},
                ${notice.message},
                ${notice.href},
                ${notice.release_at},
                ${notice.release_precision},
                ${JSON.stringify(notice.metadata)},
                now()
              )
              ON CONFLICT (user_id, event_key)
              DO NOTHING
              RETURNING id
            `;
            if (inserted.length > 0) {
              generated.push(inserted[0].id);
            }
          }

          if (seasons && seasons !== knownSeasons) {
            await sql`
              UPDATE public.media
              SET seasons_count = ${seasons},
                  episodes_count = ${Number(details?.number_of_episodes || 0) || null},
                  updated_at = now()
              WHERE id = ${item.media_id}
            `;
          }
        } catch {
          /* Falha isolada da fonte externa. */
        }
      })
    );
  }

  return NextResponse.json({ checked: candidates.length, reopened, generated });
}
