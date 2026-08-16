import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  entradaInvalida,
  naoAutenticado,
  respostaDeErro,
} from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

function validType(
  value: unknown,
): value is "movie" | "tv" {
  return (
    value === "movie" ||
    value === "tv"
  );
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  const { data, error } = await supabase
    .from("user_hidden_titles")
    .select(
      "id, tmdb_id, media_type, reason, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", {
      ascending: false,
    })
    .limit(100);

  if (error) {
    return respostaDeErro(
      error,
      "GET /api/not-interested",
    );
  }

  return NextResponse.json(data || [], {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  try {
    const body = await request.json();
    const tmdbId = Number(body?.tmdb_id);
    const mediaType = body?.media_type;

    if (
      !Number.isInteger(tmdbId) ||
      tmdbId <= 0 ||
      !validType(mediaType)
    ) {
      return entradaInvalida(
        "Título inválido.",
      );
    }

    const suppliedReason =
      typeof body?.reason === "string"
        ? body.reason.trim()
        : "";

    const reason =
      suppliedReason.slice(0, 100) ||
      "not_interested";

    const { data, error } = await supabase
      .from("user_hidden_titles")
      .upsert(
        {
          user_id: user.id,
          tmdb_id: tmdbId,
          media_type: mediaType,
          reason,
        },
        {
          onConflict:
            "user_id,tmdb_id,media_type",
        },
      )
      .select(
        "id, tmdb_id, media_type, reason, created_at",
      )
      .single();

    if (error) {
      return respostaDeErro(
        error,
        "POST /api/not-interested",
      );
    }

    return NextResponse.json(data, {
      status: 201,
    });
  } catch {
    return entradaInvalida(
      "Dados inválidos.",
    );
  }
}

export async function DELETE(
  request: NextRequest,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  const tmdbId = Number(
    request.nextUrl.searchParams.get(
      "tmdb_id",
    ),
  );

  const mediaType =
    request.nextUrl.searchParams.get(
      "media_type",
    );

  if (
    !Number.isInteger(tmdbId) ||
    tmdbId <= 0 ||
    !validType(mediaType)
  ) {
    return entradaInvalida(
      "Título inválido.",
    );
  }

  const { error } = await supabase
    .from("user_hidden_titles")
    .delete()
    .eq("user_id", user.id)
    .eq("tmdb_id", tmdbId)
    .eq("media_type", mediaType);

  if (error) {
    return respostaDeErro(
      error,
      "DELETE /api/not-interested",
    );
  }

  return NextResponse.json({
    ok: true,
  });
}