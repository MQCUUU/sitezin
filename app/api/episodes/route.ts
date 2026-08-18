import { NextResponse } from "next/server";

import {
  entradaInvalida,
  naoAutenticado,
  respostaDeErro
} from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";
import { seasonTMDB } from "@/lib/tmdb";

type EpisodeBody = {
  library_id?: unknown;

  /*
   * Compatibilidade temporária com clientes antigos que
   * enviavam o UUID da biblioteca usando o nome media_id.
   */
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

export async function POST(
  request: Request
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError
  } =
    await supabase.auth.getUser();

  if (
    authError ||
    !user
  ) {
    return naoAutenticado();
  }

  let body: EpisodeBody;

  try {
    body =
      await request.json() as
        EpisodeBody;
  } catch {
    return entradaInvalida(
      "O corpo da requisição deve ser um JSON válido."
    );
  }

  const libraryId =
    String(
      body.library_id ??
        body.media_id ??
        ""
    ).trim();

  const seasonNumber =
    Number(
      body.season_number
    );

  const episodeNumber =
    Number(
      body.episode_number
    );

  if (
    !UUID_PATTERN.test(
      libraryId
    )
  ) {
    return entradaInvalida(
      "library_id inválido."
    );
  }

  /*
   * Temporada zero é aceita porque algumas APIs usam T0
   * para especiais.
   */
  if (
    !Number.isInteger(
      seasonNumber
    ) ||
    seasonNumber < 0
  ) {
    return entradaInvalida(
      "season_number deve ser um inteiro maior ou igual a zero."
    );
  }

  if (
    !Number.isInteger(
      episodeNumber
    ) ||
    episodeNumber < 1
  ) {
    return entradaInvalida(
      "episode_number deve ser um inteiro maior ou igual a um."
    );
  }

  if (
    typeof body.watched !==
    "boolean"
  ) {
    return entradaInvalida(
      "watched deve ser verdadeiro ou falso."
    );
  }

  /*
   * Nunca confiamos diretamente no media_id enviado.
   * A mídia é obtida de um item que precisa pertencer ao
   * usuário autenticado.
   */
  const {
    data: libraryItem,
    error: libraryError
  } = await supabase
    .from("library_items")
    .select(
      "id, media_id, media:media_id(tmdb_id, media_type, seasons_count)"
    )
    .eq(
      "id",
      libraryId
    )
    .eq(
      "user_id",
      user.id
    )
    .maybeSingle();

  if (libraryError) {
    return respostaDeErro(
      libraryError,
      "POST /api/episodes:library"
    );
  }

  if (!libraryItem) {
    return NextResponse.json(
      {
        error:
          "Item não encontrado na sua biblioteca."
      },
      {
        status: 404
      }
    );
  }

  const {
    data,
    error
  } = await supabase
    .from("episodes_progress")
    .upsert(
      {
        user_id:
          user.id,

        media_id:
          libraryItem.media_id,

        season_number:
          seasonNumber,

        episode_number:
          episodeNumber,

        watched:
          body.watched,

        watched_at:
          body.watched
            ? typeof body.watched_at === "string" && body.watched_at
              ? new Date(body.watched_at).toISOString()
              : new Date().toISOString()
            : null
        ,
        comment: typeof body.comment === "string" ? body.comment.trim().slice(0, 4000) || null : null,
        is_rewatch: Boolean(body.is_rewatch)
      },
      {
        onConflict:
          "user_id,media_id,season_number,episode_number"
      }
    )
    .select()
    .single();

  if (error) {
    return respostaDeErro(
      error,
      "POST /api/episodes"
    );
  }

  /*
   * Progresso sequencial: marcar T2E7 implica que todos os
   * episódios anteriores, inclusive os da T1, foram assistidos.
   * O registro selecionado acima é preservado com comentário/data;
   * a cascata abaixo grava apenas o estado dos anteriores.
   */
  if (body.watched && seasonNumber >= 1) {
    const mediaRelation = libraryItem.media as any;
    const media = Array.isArray(mediaRelation) ? mediaRelation[0] : mediaRelation;

    if (media?.media_type === "tv" && media?.tmdb_id) {
      const [{ data: existingProgress }, priorSeasons] = await Promise.all([
        supabase.from("episodes_progress")
          .select("season_number,episode_number,watched_at")
          .eq("user_id", user.id)
          .eq("media_id", libraryItem.media_id)
          .lte("season_number", seasonNumber),
        Promise.all(
          Array.from({ length: seasonNumber }, (_, index) => index + 1)
            .map((number) => seasonTMDB(media.tmdb_id, number).catch(() => null)),
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
        const episodes = Array.isArray(seasonData?.episodes) ? seasonData.episodes : [];
        for (const episode of episodes) {
          const episodeNo = Number(episode.episode_number);
          if (number === seasonNumber && episodeNo >= episodeNumber) continue;
          cascadeRows.push({
            user_id: user.id,
            media_id: libraryItem.media_id,
            season_number: number,
            episode_number: episodeNo,
            watched: true,
            watched_at: watchedDates.get(`${number}-${episodeNo}`) || new Date().toISOString(),
          });
        }
      });

      if (cascadeRows.length > 0) {
        const { error: cascadeError } = await supabase
          .from("episodes_progress")
          .upsert(cascadeRows, {
            onConflict: "user_id,media_id,season_number,episode_number",
          });
        if (cascadeError) return respostaDeErro(cascadeError, "POST /api/episodes:cascade");
      }
    }
  }

  const releasedCount = Number(body.released_episode_count || 0);
  let updatedLibrary: any = null;
  if (releasedCount > 0) {
    const { count } = await supabase.from("episodes_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("media_id", libraryItem.media_id)
      .eq("season_number", seasonNumber).eq("watched", true);
    const seasonComplete = Number(count || 0) >= releasedCount;
    const { data: currentLibrary } = await supabase.from("library_items")
      .select("completed_seasons, status").eq("id", libraryId).single();
    if (currentLibrary) {
      const currentCompleted = Number(currentLibrary.completed_seasons || 0);
      const previousSeasonsCompleted = Math.max(0, seasonNumber - 1);
      const mediaRelation = libraryItem.media as any;
      const media = Array.isArray(mediaRelation) ? mediaRelation[0] : mediaRelation;
      const totalSeasons = Number(body.total_seasons || media?.seasons_count || 0);
      const finishedSeries = seasonComplete && totalSeasons > 0 && seasonNumber >= totalSeasons;
      const activeStatus = currentLibrary.status === "rewatching" ? "rewatching" : "watching";
      const { data: savedLibrary, error: syncError } = await supabase.from("library_items").update(seasonComplete
        ? {
            completed_seasons: Math.max(currentCompleted, seasonNumber),
            current_season: totalSeasons > 0 ? Math.min(seasonNumber + 1, totalSeasons) : seasonNumber + 1,
            status: finishedSeries ? (currentLibrary.status === "rewatching" ? "rewatched" : "watched") : activeStatus,
          }
        : body.watched
          ? { completed_seasons: Math.max(currentCompleted, previousSeasonsCompleted), current_season: Math.max(1, seasonNumber), status: activeStatus }
          : { completed_seasons: Math.min(currentCompleted, previousSeasonsCompleted), current_season: Math.max(1, seasonNumber), status: currentLibrary.status === "watched" ? "watching" : currentLibrary.status })
        .eq("id", libraryId).eq("user_id", user.id)
        .select("id,status,completed_seasons,current_season,stopped_season,rewatch_count")
        .single();
      if (syncError) return respostaDeErro(syncError, "POST /api/episodes:library-sync");
      updatedLibrary = savedLibrary;
    }
  }

  return NextResponse.json(
    { ...data, library: updatedLibrary }
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return naoAutenticado();

  const url = new URL(request.url);
  const libraryId = url.searchParams.get("library_id") || "";
  const seasonNumber = Number(url.searchParams.get("season"));
  if (!UUID_PATTERN.test(libraryId) || !Number.isInteger(seasonNumber) || seasonNumber < 0) {
    return entradaInvalida("Biblioteca ou temporada inválida.");
  }

  const { data: item } = await supabase.from("library_items")
    .select("media_id").eq("id", libraryId).eq("user_id", user.id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  const { data, error } = await supabase.from("episodes_progress").select("*")
    .eq("user_id", user.id).eq("media_id", item.media_id)
    .eq("season_number", seasonNumber).order("episode_number");
  if (error) return respostaDeErro(error, "GET /api/episodes");
  return NextResponse.json(data || []);
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return naoAutenticado();
  const body = await request.json() as EpisodeBody;
  const libraryId = String(body.library_id || "");
  const seasonNumber = Number(body.season_number);
  const numbers = Array.isArray(body.episode_numbers)
    ? [...new Set(body.episode_numbers.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (!UUID_PATTERN.test(libraryId) || !Number.isInteger(seasonNumber) || !numbers.length || typeof body.watched !== "boolean") {
    return entradaInvalida("Dados da temporada inválidos.");
  }
  const { data: item } = await supabase.from("library_items")
    .select("id, media_id, completed_seasons, current_season, status")
    .eq("id", libraryId).eq("user_id", user.id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  const now = new Date().toISOString();
  const rows = numbers.map((episodeNumber) => ({
    user_id: user.id, media_id: item.media_id, season_number: seasonNumber,
    episode_number: episodeNumber, watched: body.watched,
    watched_at: body.watched ? now : null,
  }));
  const { error } = await supabase.from("episodes_progress").upsert(rows, {
    onConflict: "user_id,media_id,season_number,episode_number",
  });
  if (error) return respostaDeErro(error, "PUT /api/episodes");

  const completed = Number(item.completed_seasons || 0);
  const totalSeasons = Number(body.total_seasons || 0);
  const finishingStatus = item.status === "rewatching" ? "rewatched" : "watched";
  const activeStatus = item.status === "rewatching" ? "rewatching" : "watching";
  const patch = body.watched
    ? { completed_seasons: Math.max(completed, seasonNumber), current_season: totalSeasons > 0 ? Math.min(seasonNumber + 1, totalSeasons) : seasonNumber + 1, status: totalSeasons > 0 && seasonNumber >= totalSeasons ? finishingStatus : activeStatus }
    : { completed_seasons: Math.min(completed, Math.max(0, seasonNumber - 1)), current_season: Math.max(1, seasonNumber), status: item.status === "rewatched" ? "rewatching" : item.status === "watched" ? "watching" : item.status };
  const { data: updated } = await supabase.from("library_items").update(patch)
    .eq("id", libraryId).eq("user_id", user.id).select().single();
  return NextResponse.json({ progress: rows, library: updated });
}
