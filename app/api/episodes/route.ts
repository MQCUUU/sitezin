import { NextResponse } from "next/server";
import {
  entradaInvalida,
  naoAutenticado,
  respostaDeErro,
} from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { episodeRowsUpsertQuery, getEpisodeJournalWrite, type EpisodeUpsertRow } from "@/lib/episode-progress";
import { planSeriesUpdate, type SeriesPlan } from "@/lib/library/episode-write";
import { seasonTMDB } from "@/lib/tmdb";
import {
  getEpisodeReleaseStatus,
  inspectEpisodeWatchTarget,
  inspectEpisodeWatchTargets,
  requiresEpisodeReleaseValidation,
} from "@/lib/title-seasons";

type EpisodeBody = {
  library_id?: unknown;
  media_id?: unknown;
  season_number?: unknown;
  episode_number?: unknown;
  watched?: unknown;
  watched_at?: unknown;
  comment?: unknown;
  is_rewatch?: unknown;
  episode_numbers?: unknown;
  /** Legado: ignorados desde a V3.1 (o servidor decide pelo progresso canônico). */
  released_episode_count?: unknown;
  total_seasons?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function seasonLookupFailureResponse(error: unknown) {
  const notFound = error instanceof Error && /^TMDB 404(?:$|:)/.test(error.message);
  return NextResponse.json(
    {
      error: notFound
        ? "Temporada não encontrada."
        : "Não foi possível validar a disponibilidade deste episódio agora.",
    },
    { status: notFound ? 404 : 502 },
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = ReturnType<typeof getDb> & ((strings: TemplateStringsArray, ...values: any[]) => any);

/** Item + estrutura da série (media.raw) + status atual — uma consulta. */
function loadItem(sql: Sql, libraryId: string, userId: string) {
  return sql`
    SELECT
      li.id,
      li.media_id,
      li.status,
      m.tmdb_id,
      m.media_type,
      m.seasons_count,
      m.episodes_count,
      CASE WHEN m.media_type = 'tv' THEN m.raw->'seasons' END AS _seasons,
      CASE WHEN m.media_type = 'tv' THEN m.raw->'last_episode_to_air' END AS _last_episode,
      CASE WHEN m.media_type = 'tv' THEN m.raw->>'status' END AS _series_status
    FROM public.library_items li
    JOIN public.media m ON m.id = li.media_id
    WHERE li.id = ${libraryId} AND li.user_id = ${userId}
    LIMIT 1
  ` as unknown as Promise<Record<string, any>[]>;
}

/** Episódios regulares já registrados da série (vistos ou não) — uma consulta. */
function loadEpisodes(sql: Sql, mediaId: number, userId: string) {
  return sql`
    SELECT season_number, episode_number, watched, watched_at, watched_at_precision
    FROM public.episodes_progress
    WHERE user_id = ${userId} AND media_id = ${mediaId} AND season_number >= 1
  ` as unknown as Promise<{ season_number: number; episode_number: number; watched: boolean; watched_at: string | null; watched_at_precision: string | null }[]>;
}

/**
 * Estado derivado da série, gravado NA MESMA transação dos episódios.
 * Compare-and-set pelo status lido: se outra ação mudou o status no meio
 * (ex.: o usuário escolheu um status manualmente), a escolha dele vence e o
 * derivado não é aplicado (episódios continuam gravados — são fatos).
 * Nunca gera status_changed: o Diário conta os episódios.
 */
function seriesStateUpdate(sql: Sql, input: { libraryId: string; userId: string; previous: string; plan: SeriesPlan }) {
  return sql`
    UPDATE public.library_items
    SET
      status = ${input.plan.status},
      completed_seasons = ${input.plan.completed_seasons},
      current_season = ${input.plan.current_season},
      stopped_season = CASE WHEN ${input.plan.status} = 'dropped' THEN stopped_season ELSE NULL END
    WHERE id = ${input.libraryId} AND user_id = ${input.userId} AND status = ${input.previous}
    RETURNING id, status, completed_seasons, current_season, stopped_season, rewatch_count
  `;
}

export async function POST(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    let body: EpisodeBody;
    try {
      body = (await request.json()) as EpisodeBody;
    } catch {
      return entradaInvalida("O corpo da requisição deve ser um JSON válido.");
    }

    const libraryId = String(body.library_id ?? body.media_id ?? "").trim();
    const seasonNumber = Number(body.season_number);
    const episodeNumber = Number(body.episode_number);

    if (!UUID_PATTERN.test(libraryId)) {
      return entradaInvalida("library_id inválido.");
    }

    if (!Number.isInteger(seasonNumber) || seasonNumber < 0) {
      return entradaInvalida(
        "season_number deve ser um inteiro maior ou igual a zero.",
      );
    }

    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
      return entradaInvalida(
        "episode_number deve ser um inteiro maior ou igual a um.",
      );
    }

    if (typeof body.watched !== "boolean") {
      return entradaInvalida("watched deve ser verdadeiro ou falso.");
    }

    if (body.is_rewatch !== undefined && typeof body.is_rewatch !== "boolean") {
      return entradaInvalida("is_rewatch deve ser verdadeiro ou falso.");
    }

    const sql = getDb() as Sql;

    // 1. Item (do usuário da sessão) + estrutura da série + status atual
    const libraryRows = await loadItem(sql, libraryId, user.id);

    if (libraryRows.length === 0) {
      return NextResponse.json(
        { error: "Item não encontrado na sua biblioteca." },
        { status: 404 },
      );
    }

    const libraryItem = libraryRows[0];
    const isSeries = libraryItem.media_type === "tv" && Boolean(libraryItem.tmdb_id);
    const watchedAt = body.watched
      ? typeof body.watched_at === "string" && body.watched_at
        ? new Date(body.watched_at).toISOString()
        : new Date().toISOString()
      : null;
    // V2.3 — proveniência: sem data enviada = relógio do servidor ('datetime');
    // com data enviada, só é 'datetime' se o cliente declarar a hora.
    const watchedAtPrecision = body.watched
      ? typeof body.watched_at === "string" && body.watched_at
        ? (body as { watched_at_precision?: unknown }).watched_at_precision === "datetime"
          ? "datetime"
          : "date"
        : "datetime"
      : null;
    /*
     * `comment`/`is_rewatch` só sobrescrevem o que já existe quando o chamador
     * os envia (página de episódio). O toggle rápido não manda nenhum dos dois
     * (C5.2 §18): o CASE WHEN abaixo preserva o valor atual.
     */
    const {
      commentProvided,
      comment,
      isRewatchProvided,
      isRewatch,
    } = getEpisodeJournalWrite(body);

    // Episódios regulares já registrados (para a cascata e para o progresso resultante).
    const existing = isSeries && seasonNumber >= 1 ? await loadEpisodes(sql, Number(libraryItem.media_id), user.id) : [];

    /*
     * O cliente nunca é autoridade sobre air_date (C5.2): só uma nova
     * marcação watched=true consulta a temporada real. Desmarcar não faz fetch.
     */
    if (body.watched) {
      const existingEpisodeRows = await sql`
        SELECT watched
        FROM public.episodes_progress
        WHERE user_id = ${user.id}
          AND media_id = ${libraryItem.media_id}
          AND season_number = ${seasonNumber}
          AND episode_number = ${episodeNumber}
        LIMIT 1
      `;
      const existingEpisodeWatched = existingEpisodeRows[0]?.watched === true;
      const journalEdit = commentProvided || isRewatchProvided;

      if (requiresEpisodeReleaseValidation(body.watched, existingEpisodeWatched, journalEdit)) {
        if (!isSeries) {
          return entradaInvalida("O progresso por episódio só está disponível para séries.");
        }

        let rawSeason: unknown;
        try {
          rawSeason = await seasonTMDB(libraryItem.tmdb_id, seasonNumber);
        } catch (error) {
          return seasonLookupFailureResponse(error);
        }

        const target = inspectEpisodeWatchTarget(rawSeason, seasonNumber, episodeNumber);
        if (target.kind === "invalid-season") {
          return NextResponse.json(
            { error: "Não foi possível validar a disponibilidade deste episódio agora." },
            { status: 502 },
          );
        }
        if (target.kind === "episode-not-found") {
          return NextResponse.json(
            { error: "Episódio não encontrado nesta temporada." },
            { status: 404 },
          );
        }
        if (target.kind === "not-released") {
          return NextResponse.json(
            { error: "Este episódio não está disponível para marcar como assistido." },
            { status: 409 },
          );
        }
      }
    }

    /*
     * 2. Cascata: marcar um episódio regular marca os ANTERIORES (temporadas
     * 1..N) já exibidos e ainda não vistos. Nunca Especiais (T0), nunca
     * episódio futuro/sem data (C5.2 §9), nunca episódio que não existe no
     * TMDB. Episódio já visto mantém data e proveniência.
     */
    const cascadeRows: EpisodeUpsertRow[] = [];

    if (body.watched && seasonNumber >= 1 && isSeries) {
      const priorSeasons = await Promise.all(
        Array.from({ length: seasonNumber }, (_, index) => index + 1).map((number) =>
          seasonTMDB(libraryItem.tmdb_id, number).catch(() => null),
        ),
      );
      const alreadyWatched = new Set(existing.filter((e) => e.watched).map((e) => `${e.season_number}-${e.episode_number}`));

      priorSeasons.forEach((seasonData: any, index) => {
        const number = index + 1;
        const episodes = Array.isArray(seasonData?.episodes) ? seasonData.episodes : [];

        for (const episode of episodes) {
          const episodeNo = Number(episode.episode_number);

          if (!Number.isInteger(episodeNo) || episodeNo < 1) continue;
          if (number === seasonNumber && episodeNo >= episodeNumber) continue;
          if (alreadyWatched.has(`${number}-${episodeNo}`)) continue;
          if (getEpisodeReleaseStatus(episode.air_date) !== "released") continue;

          cascadeRows.push({ season_number: number, episode_number: episodeNo, watched_at: new Date().toISOString(), watched_at_precision: "datetime" });
        }
      });
    }

    /*
     * 3. Estado derivado da série pelo progresso CANÔNICO depois da escrita
     * (lib/library/episode-status.ts). Especiais (T0) nunca mudam o estado.
     */
    const plan =
      isSeries && seasonNumber >= 1
        ? planSeriesUpdate({
            row: libraryItem as any,
            watchedBefore: existing.filter((e) => e.watched),
            changes: [
              ...cascadeRows.map((r) => ({ season_number: r.season_number, episode_number: r.episode_number, watched: true })),
              { season_number: seasonNumber, episode_number: episodeNumber, watched: body.watched },
            ],
            action: body.watched ? "watch" : "unwatch",
          })
        : null;

    // 4. UMA transação: episódio + cascata + estado derivado (tudo ou nada).
    const queries: any[] = [
      sql`
        INSERT INTO public.episodes_progress (
          user_id, media_id, season_number, episode_number, watched, watched_at, watched_at_precision, comment, is_rewatch
        )
        VALUES (
          ${user.id}, ${libraryItem.media_id}, ${seasonNumber}, ${episodeNumber}, ${body.watched},
          ${watchedAt}, ${watchedAtPrecision}, ${comment}, ${isRewatch}
        )
        ON CONFLICT (user_id, media_id, season_number, episode_number)
        DO UPDATE SET
          watched = EXCLUDED.watched,
          watched_at = EXCLUDED.watched_at,
          watched_at_precision = EXCLUDED.watched_at_precision,
          comment = CASE WHEN ${commentProvided} THEN EXCLUDED.comment ELSE public.episodes_progress.comment END,
          is_rewatch = CASE WHEN ${isRewatchProvided} THEN EXCLUDED.is_rewatch ELSE public.episodes_progress.is_rewatch END
        RETURNING *
      `,
    ];

    if (cascadeRows.length) {
      queries.push(episodeRowsUpsertQuery(sql, { userId: user.id, mediaId: Number(libraryItem.media_id), watched: true, rows: cascadeRows }));
    }

    if (plan) {
      queries.push(seriesStateUpdate(sql, { libraryId, userId: user.id, previous: String(libraryItem.status), plan }));
    }

    const results = (await sql.transaction(queries)) as Record<string, unknown>[][];
    const data = results[0][0];
    const updatedLibrary = plan ? results[results.length - 1][0] ?? null : null;

    return NextResponse.json({ ...data, library: updatedLibrary });
  } catch (error) {
    return respostaDeErro(error, "POST /api/episodes");
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const url = new URL(request.url);
    const libraryId = url.searchParams.get("library_id") || "";
    const seasonNumber = Number(url.searchParams.get("season"));

    if (
      !UUID_PATTERN.test(libraryId) ||
      !Number.isInteger(seasonNumber) ||
      seasonNumber < 0
    ) {
      return entradaInvalida("Biblioteca ou temporada inválida.");
    }

    const sql = getDb();
    const itemRows = await sql`
      SELECT media_id
      FROM public.library_items
      WHERE id = ${libraryId} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (itemRows.length === 0) {
      return NextResponse.json(
        { error: "Item não encontrado." },
        { status: 404 },
      );
    }

    const mediaId = itemRows[0].media_id;
    const progress = await sql`
      SELECT *
      FROM public.episodes_progress
      WHERE user_id = ${user.id}
        AND media_id = ${mediaId}
        AND season_number = ${seasonNumber}
      ORDER BY episode_number ASC
    `;

    return NextResponse.json(progress || []);
  } catch (error) {
    return respostaDeErro(error, "GET /api/episodes");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const body = (await request.json()) as EpisodeBody;
    const libraryId = String(body.library_id || "");
    const seasonNumber = Number(body.season_number);
    const numbers = Array.isArray(body.episode_numbers)
      ? [
          ...new Set(
            body.episode_numbers
              .map(Number)
              .filter((n) => Number.isInteger(n) && n > 0),
          ),
        ]
      : [];

    if (
      !UUID_PATTERN.test(libraryId) ||
      !Number.isInteger(seasonNumber) ||
      seasonNumber < 0 ||
      !numbers.length ||
      typeof body.watched !== "boolean"
    ) {
      return entradaInvalida("Dados da temporada inválidos.");
    }

    const sql = getDb() as Sql;
    const itemRows = await loadItem(sql, libraryId, user.id);

    if (itemRows.length === 0) {
      return NextResponse.json(
        { error: "Item não encontrado." },
        { status: 404 },
      );
    }

    const item = itemRows[0];
    const isSeries = item.media_type === "tv" && Boolean(item.tmdb_id);

    /*
     * PUT aceita uma lista vinda do cliente. Antes de qualquer watched=true, o
     * servidor valida todos os números contra a temporada real (não lançado →
     * 409). A UI filtrar a lista não é fronteira de confiança. Desmarcar não
     * consulta o TMDB.
     */
    if (body.watched) {
      if (!isSeries) {
        return entradaInvalida("O progresso por episódio só está disponível para séries.");
      }

      let rawSeason: unknown;
      try {
        rawSeason = await seasonTMDB(item.tmdb_id, seasonNumber);
      } catch (error) {
        return seasonLookupFailureResponse(error);
      }

      const targets = inspectEpisodeWatchTargets(rawSeason, seasonNumber, numbers);
      if (targets.kind === "invalid-season") {
        return NextResponse.json(
          { error: "Não foi possível validar a disponibilidade destes episódios agora." },
          { status: 502 },
        );
      }
      if (targets.kind === "episode-not-found") {
        return NextResponse.json(
          { error: "Episódio não encontrado nesta temporada." },
          { status: 404 },
        );
      }
      if (targets.kind === "not-released") {
        return NextResponse.json(
          { error: "Um ou mais episódios não estão disponíveis para marcar como assistidos." },
          { status: 409 },
        );
      }
    }

    const now = new Date().toISOString();
    const watchedAt = body.watched ? now : null;
    const rows: EpisodeUpsertRow[] = numbers.map((episodeNumber) => ({
      season_number: seasonNumber,
      episode_number: episodeNumber,
      watched_at: watchedAt,
      watched_at_precision: body.watched ? "datetime" : null,
    }));

    // Estado derivado pelo progresso canônico (Especiais nunca mudam o estado da série regular).
    const plan =
      isSeries && seasonNumber >= 1
        ? planSeriesUpdate({
            row: item as any,
            watchedBefore: (await loadEpisodes(sql, Number(item.media_id), user.id)).filter((e) => e.watched),
            changes: numbers.map((n) => ({ season_number: seasonNumber, episode_number: n, watched: body.watched as boolean })),
            action: body.watched ? "watch" : "unwatch",
          })
        : null;

    // UMA transação: temporada inteira (uma consulta) + estado derivado.
    const queries: any[] = [episodeRowsUpsertQuery(sql, { userId: user.id, mediaId: Number(item.media_id), watched: body.watched, rows })];

    if (plan) queries.push(seriesStateUpdate(sql, { libraryId, userId: user.id, previous: String(item.status), plan }));

    const results = (await sql.transaction(queries)) as Record<string, unknown>[][];
    const progress = [...results[0]].sort((a, b) => Number(a.episode_number) - Number(b.episode_number));

    return NextResponse.json({
      progress,
      library: plan ? results[1][0] ?? null : null,
    });
  } catch (error) {
    return respostaDeErro(error, "PUT /api/episodes");
  }
}
