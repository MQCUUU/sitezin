import { NextResponse } from "next/server";
import {
  entradaInvalida,
  naoAutenticado,
  respostaDeErro,
} from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { seasonTMDB } from "@/lib/tmdb";

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
  released_episode_count?: unknown;
  total_seasons?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    const sql = getDb();

    // 1. Obter library_item garantindo que pertence ao usuário autenticado
    const libraryRows = await sql`
      SELECT
        li.id,
        li.media_id,
        m.tmdb_id,
        m.media_type,
        m.seasons_count
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.id = ${libraryId} AND li.user_id = ${user.id}
      LIMIT 1
    `;

    if (libraryRows.length === 0) {
      return NextResponse.json(
        { error: "Item não encontrado na sua biblioteca." },
        { status: 404 },
      );
    }

    const libraryItem = libraryRows[0];
    const watchedAt = body.watched
      ? typeof body.watched_at === "string" && body.watched_at
        ? new Date(body.watched_at).toISOString()
        : new Date().toISOString()
      : null;
    const comment =
      typeof body.comment === "string"
        ? body.comment.trim().slice(0, 4000) || null
        : null;
    const isRewatch = Boolean(body.is_rewatch);

    // 2. Upsert do episódio atual
    const progressRows = await sql`
      INSERT INTO public.episodes_progress (
        user_id,
        media_id,
        season_number,
        episode_number,
        watched,
        watched_at,
        comment,
        is_rewatch
      )
      VALUES (
        ${user.id},
        ${libraryItem.media_id},
        ${seasonNumber},
        ${episodeNumber},
        ${body.watched},
        ${watchedAt},
        ${comment},
        ${isRewatch}
      )
      ON CONFLICT (user_id, media_id, season_number, episode_number)
      DO UPDATE SET
        watched = EXCLUDED.watched,
        watched_at = EXCLUDED.watched_at,
        comment = EXCLUDED.comment,
        is_rewatch = EXCLUDED.is_rewatch
      RETURNING *
    `;

    const data = progressRows[0];

    // 3. Progresso sequencial
    if (body.watched && seasonNumber >= 1) {
      if (libraryItem.media_type === "tv" && libraryItem.tmdb_id) {
        const [existingProgress, priorSeasons] = await Promise.all([
          sql`
            SELECT season_number, episode_number, watched_at
            FROM public.episodes_progress
            WHERE user_id = ${user.id}
              AND media_id = ${libraryItem.media_id}
              AND season_number <= ${seasonNumber}
          `,
          Promise.all(
            Array.from({ length: seasonNumber }, (_, index) => index + 1).map(
              (number) =>
                seasonTMDB(libraryItem.tmdb_id, number).catch(() => null),
            ),
          ),
        ]);

        const watchedDates = new Map(
          (existingProgress || []).map((item: any) => [
            `${item.season_number}-${item.episode_number}`,
            item.watched_at,
          ]),
        );

        const cascadeRows: any[] = [];
        priorSeasons.forEach((seasonData: any, index) => {
          const number = index + 1;
          const episodes = Array.isArray(seasonData?.episodes)
            ? seasonData.episodes
            : [];
          for (const episode of episodes) {
            const episodeNo = Number(episode.episode_number);
            if (number === seasonNumber && episodeNo >= episodeNumber) continue;
            cascadeRows.push({
              user_id: user.id,
              media_id: libraryItem.media_id,
              season_number: number,
              episode_number: episodeNo,
              watched: true,
              watched_at:
                watchedDates.get(`${number}-${episodeNo}`) ||
                new Date().toISOString(),
            });
          }
        });

        for (const row of cascadeRows) {
          await sql`
            INSERT INTO public.episodes_progress (
              user_id,
              media_id,
              season_number,
              episode_number,
              watched,
              watched_at
            )
            VALUES (
              ${row.user_id},
              ${row.media_id},
              ${row.season_number},
              ${row.episode_number},
              ${row.watched},
              ${row.watched_at}
            )
            ON CONFLICT (user_id, media_id, season_number, episode_number)
            DO UPDATE SET
              watched = EXCLUDED.watched,
              watched_at = EXCLUDED.watched_at
          `;
        }
      }
    }

    // 4. Sincronização com library_items
    const releasedCount = Number(body.released_episode_count || 0);
    let updatedLibrary: any = null;

    if (releasedCount > 0) {
      const countRes = await sql`
        SELECT count(*)::int as count
        FROM public.episodes_progress
        WHERE user_id = ${user.id}
          AND media_id = ${libraryItem.media_id}
          AND season_number = ${seasonNumber}
          AND watched = true
      `;
      const watchedCount = Number(countRes[0]?.count || 0);
      const seasonComplete = watchedCount >= releasedCount;

      const currentLibRes = await sql`
        SELECT completed_seasons, status
        FROM public.library_items
        WHERE id = ${libraryId} AND user_id = ${user.id}
        LIMIT 1
      `;

      if (currentLibRes.length > 0) {
        const currentLibrary = currentLibRes[0];
        const currentCompleted = Number(currentLibrary.completed_seasons || 0);
        const previousSeasonsCompleted = Math.max(0, seasonNumber - 1);
        const totalSeasons = Number(
          body.total_seasons || libraryItem.seasons_count || 0,
        );
        const finishedSeries =
          seasonComplete && totalSeasons > 0 && seasonNumber >= totalSeasons;
        const activeStatus =
          currentLibrary.status === "rewatching" ? "rewatching" : "watching";

        let newCompletedSeasons: number;
        let newCurrentSeason: number;
        let newStatus: string;

        if (seasonComplete) {
          newCompletedSeasons = Math.max(currentCompleted, seasonNumber);
          newCurrentSeason =
            totalSeasons > 0
              ? Math.min(seasonNumber + 1, totalSeasons)
              : seasonNumber + 1;
          newStatus = finishedSeries
            ? currentLibrary.status === "rewatching"
              ? "rewatched"
              : "watched"
            : activeStatus;
        } else if (body.watched) {
          newCompletedSeasons = Math.max(
            currentCompleted,
            previousSeasonsCompleted,
          );
          newCurrentSeason = Math.max(1, seasonNumber);
          newStatus = activeStatus;
        } else {
          newCompletedSeasons = Math.min(
            currentCompleted,
            previousSeasonsCompleted,
          );
          newCurrentSeason = Math.max(1, seasonNumber);
          newStatus =
            currentLibrary.status === "watched"
              ? "watching"
              : currentLibrary.status;
        }

        const savedLibRes = await sql`
          UPDATE public.library_items
          SET
            completed_seasons = ${newCompletedSeasons},
            current_season = ${newCurrentSeason},
            status = ${newStatus}
          WHERE id = ${libraryId} AND user_id = ${user.id}
          RETURNING id, status, completed_seasons, current_season, stopped_season, rewatch_count
        `;
        updatedLibrary = savedLibRes[0] || null;
      }
    }

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
      !numbers.length ||
      typeof body.watched !== "boolean"
    ) {
      return entradaInvalida("Dados da temporada inválidos.");
    }

    const sql = getDb();
    const itemRows = await sql`
      SELECT id, media_id, completed_seasons, current_season, status
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

    const item = itemRows[0];
    const now = new Date().toISOString();
    const watchedAt = body.watched ? now : null;

    const rows: any[] = [];
    for (const episodeNumber of numbers) {
      const res = await sql`
        INSERT INTO public.episodes_progress (
          user_id,
          media_id,
          season_number,
          episode_number,
          watched,
          watched_at
        )
        VALUES (
          ${user.id},
          ${item.media_id},
          ${seasonNumber},
          ${episodeNumber},
          ${body.watched},
          ${watchedAt}
        )
        ON CONFLICT (user_id, media_id, season_number, episode_number)
        DO UPDATE SET
          watched = EXCLUDED.watched,
          watched_at = EXCLUDED.watched_at
        RETURNING *
      `;
      if (res.length > 0) rows.push(res[0]);
    }

    const completed = Number(item.completed_seasons || 0);
    const totalSeasons = Number(body.total_seasons || 0);
    const finishingStatus =
      item.status === "rewatching" ? "rewatched" : "watched";
    const activeStatus =
      item.status === "rewatching" ? "rewatching" : "watching";

    const newCompleted = body.watched
      ? Math.max(completed, seasonNumber)
      : Math.min(completed, Math.max(0, seasonNumber - 1));

    const newCurrent = body.watched
      ? totalSeasons > 0
        ? Math.min(seasonNumber + 1, totalSeasons)
        : seasonNumber + 1
      : Math.max(1, seasonNumber);

    const newStatus = body.watched
      ? totalSeasons > 0 && seasonNumber >= totalSeasons
        ? finishingStatus
        : activeStatus
      : item.status === "rewatched"
        ? "rewatching"
        : item.status === "watched"
          ? "watching"
          : item.status;

    const updateLibRes = await sql`
      UPDATE public.library_items
      SET
        completed_seasons = ${newCompleted},
        current_season = ${newCurrent},
        status = ${newStatus}
      WHERE id = ${libraryId} AND user_id = ${user.id}
      RETURNING *
    `;

    return NextResponse.json({
      progress: rows,
      library: updateLibRes[0] || null,
    });
  } catch (error) {
    return respostaDeErro(error, "PUT /api/episodes");
  }
}
