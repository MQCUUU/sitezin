import { NextRequest, NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { InvalidJsonError, readJsonWithLimit, RequestBodyTooLargeError } from "@/lib/request-json";
import { planRestore } from "@/lib/backup/plan";
import { resolveCatalogMedia } from "@/lib/lists/media";

/*
 * POST /api/account/import — restaura um backup do MyCatalog (JSON).
 *
 * V3.3 (reescrita):
 *  - valida o arquivo INTEIRO antes de escrever (lib/backup/plan.ts);
 *  - grava numa ÚNICA transação: ou entra tudo, ou nada (antes: centenas de
 *    comandos soltos — uma falha no meio deixava o restore pela metade e
 *    erros de ocultos/visualizações/atividade eram engolidos);
 *  - SQL em conjunto (5 comandos, independente do tamanho do backup);
 *  - o arquivo nunca é fonte do catálogo compartilhado: título que já existe
 *    em `media` não é tocado (antes o arquivo sobrescrevia título/sinopse/
 *    pôster de qualquer obra para TODOS os usuários) e título que falta é
 *    criado com dados do TMDB buscados pelo servidor (lib/lists/media.ts) —
 *    o que o TMDB não confirma é ignorado e contado no resumo;
 *  - tudo é escopado ao usuário da sessão (nada do arquivo é autoridade);
 *  - mesclagem: o mais recente (updated_at) vence; empate = a conta;
 *  - datas comparadas em milissegundos (precisão do JSON exportado), senão
 *    o mesmo evento "parecia" novo e duplicava.
 */

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
// Títulos fora do catálogo resolvidos por restauração (cada um = 1 chamada ao TMDB).
// Restaurar de novo continua de onde parou (é idempotente).
const MAX_CATALOG_LOOKUPS = 400;
const LOOKUP_CONCURRENCY = 6;

export async function POST(req: NextRequest) {
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;

  if (!user || !user.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const backup = await readJsonWithLimit<unknown>(req, MAX_BACKUP_BYTES);
    const result = planRestore(backup);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { plan } = result;
    const userId = user.id;
    const sql = getDb();
    const library = JSON.stringify(plan.library);
    const watches = JSON.stringify(plan.watches);
    const episodes = JSON.stringify(plan.episodes);
    const hidden = JSON.stringify(plan.hidden);
    const activity = JSON.stringify(plan.activity);

    // Catálogo ANTES da transação: só o que falta, criado a partir do TMDB (servidor).
    const keys = new Map<string, { tmdb_id: number; media_type: "movie" | "tv" }>();
    for (const row of [...plan.library, ...plan.watches, ...plan.episodes, ...plan.activity]) {
      keys.set(`${row.media_type}:${row.tmdb_id}`, { tmdb_id: row.tmdb_id, media_type: row.media_type });
    }
    const wanted = Array.from(keys.values());
    const present = wanted.length
      ? ((await sql`
          SELECT m.tmdb_id, m.media_type
          FROM public.media m
          JOIN unnest(${wanted.map((k) => k.media_type)}::text[], ${wanted.map((k) => k.tmdb_id)}::int[]) AS w(media_type, tmdb_id)
            ON w.media_type = m.media_type AND w.tmdb_id = m.tmdb_id
        `) as { tmdb_id: number; media_type: string }[])
      : [];
    const presentKeys = new Set(present.map((row) => `${row.media_type}:${row.tmdb_id}`));
    const missing = wanted.filter((k) => !presentKeys.has(`${k.media_type}:${k.tmdb_id}`));
    const toResolve = missing.slice(0, MAX_CATALOG_LOOKUPS);
    let catalogUnresolved = missing.length - toResolve.length;

    for (let index = 0; index < toResolve.length; index += LOOKUP_CONCURRENCY) {
      const slice = toResolve.slice(index, index + LOOKUP_CONCURRENCY);
      const batch = await Promise.all(slice.map((k) => resolveCatalogMedia(sql, k.media_type, k.tmdb_id)));

      batch.forEach((result, i) => {
        if (result.ok) presentKeys.add(`${slice[i].media_type}:${slice[i].tmdb_id}`);
        else catalogUnresolved++;
      });
    }

    // Itens da biblioteca do arquivo que têm obra no catálogo (os demais são ignorados).
    const libraryInCatalog = plan.library.filter((item) => presentKeys.has(`${item.media_type}:${item.tmdb_id}`)).length;

    const [libraryRows, watchRows, episodeRows, hiddenRows, activityRows] = await sql.transaction([
      // 1. Biblioteca (só títulos do catálogo): adiciona o que falta; no conflito, o mais recente vence.
      sql`
        INSERT INTO public.library_items (
          user_id, media_id, status, favorite, personal_rating, review, watched_at, watched_at_precision,
          rewatch_count, current_season, completed_seasons, stopped_season, added_at, updated_at
        )
        SELECT ${userId}, m.id, x.status, x.favorite, x.personal_rating, x.review, x.watched_at, x.watched_at_precision,
               x.rewatch_count, x.current_season, x.completed_seasons, x.stopped_season, x.added_at, x.updated_at
        FROM jsonb_to_recordset(${library}::jsonb) AS x(
          tmdb_id int, media_type text, status text, favorite boolean, personal_rating numeric, review text,
          watched_at timestamptz, watched_at_precision text, rewatch_count int, current_season int,
          completed_seasons int, stopped_season int, added_at timestamptz, updated_at timestamptz
        )
        JOIN public.media m ON m.tmdb_id = x.tmdb_id AND m.media_type = x.media_type
        ON CONFLICT (user_id, media_id) DO UPDATE SET
          status = EXCLUDED.status,
          favorite = EXCLUDED.favorite,
          personal_rating = EXCLUDED.personal_rating,
          review = EXCLUDED.review,
          watched_at = EXCLUDED.watched_at,
          watched_at_precision = EXCLUDED.watched_at_precision,
          rewatch_count = EXCLUDED.rewatch_count,
          current_season = EXCLUDED.current_season,
          completed_seasons = EXCLUDED.completed_seasons,
          stopped_season = EXCLUDED.stopped_season,
          updated_at = EXCLUDED.updated_at
        -- O JSON guarda milissegundos e o banco microssegundos: compara na mesma precisão.
        WHERE date_trunc('milliseconds', library_items.updated_at) < EXCLUDED.updated_at
        RETURNING (xmax = 0) AS inserted
      `,
      // 2. Visualizações (Diário): só as que a conta ainda não tem.
      sql`
        INSERT INTO public.watch_entries (
          user_id, library_item_id, media_id, watched_at, watched_at_precision, rating, comment, is_rewatch, created_at, updated_at
        )
        SELECT DISTINCT ON (m.id, x.watched_at, x.is_rewatch)
               ${userId}, li.id, m.id, x.watched_at, x.watched_at_precision, x.rating, x.comment, x.is_rewatch, x.created_at, x.updated_at
        FROM jsonb_to_recordset(${watches}::jsonb) AS x(
          tmdb_id int, media_type text, watched_at timestamptz, watched_at_precision text, rating numeric,
          comment text, is_rewatch boolean, created_at timestamptz, updated_at timestamptz
        )
        JOIN public.media m ON m.tmdb_id = x.tmdb_id AND m.media_type = x.media_type
        LEFT JOIN public.library_items li ON li.user_id = ${userId} AND li.media_id = m.id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.watch_entries w
          WHERE w.user_id = ${userId} AND w.media_id = m.id AND w.is_rewatch = x.is_rewatch
            AND date_trunc('milliseconds', w.watched_at) = date_trunc('milliseconds', x.watched_at)
        )
        ORDER BY m.id, x.watched_at, x.is_rewatch
        ON CONFLICT DO NOTHING
        RETURNING 1
      `,
      // 3. Progresso de episódios: só os que a conta ainda não marcou.
      sql`
        INSERT INTO public.episodes_progress (
          user_id, media_id, season_number, episode_number, watched, watched_at, watched_at_precision, comment, is_rewatch
        )
        SELECT DISTINCT ON (m.id, x.season_number, x.episode_number)
               ${userId}, m.id, x.season_number, x.episode_number, x.watched, x.watched_at, x.watched_at_precision, x.comment, x.is_rewatch
        FROM jsonb_to_recordset(${episodes}::jsonb) AS x(
          tmdb_id int, media_type text, season_number int, episode_number int, watched boolean,
          watched_at timestamptz, watched_at_precision text, comment text, is_rewatch boolean
        )
        JOIN public.media m ON m.tmdb_id = x.tmdb_id AND m.media_type = x.media_type
        ORDER BY m.id, x.season_number, x.episode_number
        ON CONFLICT (user_id, media_id, season_number, episode_number) DO NOTHING
        RETURNING 1
      `,
      // 4. "Não tenho interesse".
      sql`
        INSERT INTO public.user_hidden_titles (user_id, tmdb_id, media_type, reason, created_at)
        SELECT DISTINCT ON (x.tmdb_id, x.media_type) ${userId}, x.tmdb_id, x.media_type, x.reason, x.created_at
        FROM jsonb_to_recordset(${hidden}::jsonb) AS x(tmdb_id bigint, media_type text, reason text, created_at timestamptz)
        ORDER BY x.tmdb_id, x.media_type
        ON CONFLICT (user_id, tmdb_id, media_type) DO NOTHING
        RETURNING 1
      `,
      // 5. Atividade: sem duplicar o que já existe (mesmo título, tipo e momento).
      sql`
        INSERT INTO public.activity_events (user_id, media_id, library_item_id, event_type, metadata, occurred_at)
        SELECT DISTINCT ON (m.id, x.event_type, x.occurred_at)
               ${userId}, m.id, li.id, x.event_type, COALESCE(x.metadata, '{}'::jsonb), x.occurred_at
        FROM jsonb_to_recordset(${activity}::jsonb) AS x(tmdb_id int, media_type text, event_type text, metadata jsonb, occurred_at timestamptz)
        JOIN public.media m ON m.tmdb_id = x.tmdb_id AND m.media_type = x.media_type
        LEFT JOIN public.library_items li ON li.user_id = ${userId} AND li.media_id = m.id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.activity_events a
          WHERE a.user_id = ${userId} AND a.media_id = m.id AND a.event_type = x.event_type
            AND date_trunc('milliseconds', a.occurred_at) = date_trunc('milliseconds', x.occurred_at)
        )
        ORDER BY m.id, x.event_type, x.occurred_at
        RETURNING 1
      `,
    ]);

    const libraryResult = libraryRows as { inserted: boolean }[];
    const added = libraryResult.filter((row) => row.inserted).length;
    const updated = libraryResult.length - added;

    return NextResponse.json(
      {
        ok: true,
        restored: {
          library: added + updated,
          library_added: added,
          library_updated: updated,
          library_kept: libraryInCatalog - added - updated,
          watch_history: watchRows.length,
          episodes: episodeRows.length,
          hidden_titles: hiddenRows.length,
          activity_events: activityRows.length,
          skipped: plan.skipped,
          catalog_unresolved: catalogUnresolved,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }

    if (error instanceof InvalidJsonError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Erro ao importar backup:", error);

    return respostaDeErro(error, "POST /api/account/import");
  }
}
