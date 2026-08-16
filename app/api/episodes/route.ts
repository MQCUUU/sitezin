import { NextResponse } from "next/server";

import {
  entradaInvalida,
  naoAutenticado,
  respostaDeErro
} from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

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
      "id, media_id"
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
            ? new Date()
                .toISOString()
            : null
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

  return NextResponse.json(
    data
  );
}