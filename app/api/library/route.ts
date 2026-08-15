import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const s = await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Não autenticado" },
      { status: 401 }
    );
  }

  const {
    data,
    error,
  } = await s
    .from("library_items")
    .select(
      `
      id,
      status,
      favorite,
      personal_rating,
      review,
      watched_at,
      rewatch_count,
      added_at,
      updated_at,
      media:media_id(*)
      `
    )
    .eq("user_id", user.id)
    .order("added_at", {
      ascending: false,
    });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    data || []
  );
}

export async function POST(
  req
) {
  const s = await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Não autenticado",
      },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const media = body.media;

    if (!media?.id) {
      return NextResponse.json(
        {
          error:
            "Dados do título inválidos.",
        },
        { status: 400 }
      );
    }

    const {
      data: existingMedia,
      error: mediaError,
    } = await s
      .from("media")
      .upsert(
        {
          tmdb_id: media.id,

          media_type:
            media.media_type,

          title:
            media.title ||
            media.name,

          original_title:
            media.original_title ||
            media.original_name ||
            null,

          overview:
            media.overview ||
            null,

          poster_path:
            media.poster_path ||
            null,

          backdrop_path:
            media.backdrop_path ||
            null,

          release_date:
            media.release_date ||
            null,

          first_air_date:
            media.first_air_date ||
            null,

          genres:
            media.genres || [],

          tmdb_rating:
            media.vote_average ||
            media.tmdb_rating ||
            null,

          tmdb_vote_count:
            media.vote_count ||
            null,

          runtime:
            media.runtime ||
            null,

          seasons_count:
            media.number_of_seasons ||
            null,

          episodes_count:
            media.number_of_episodes ||
            null,

          creator_names:
            media.creator_names ||
            [],

          cast_names:
            media.cast_names ||
            [],

          raw: media,
        },
        {
          onConflict:
            "tmdb_id,media_type",
        }
      )
      .select()
      .single();

    if (mediaError) {
      return NextResponse.json(
        {
          error:
            mediaError.message,
        },
        { status: 500 }
      );
    }

    const {
      data: item,
      error: itemError,
    } = await s
      .from("library_items")
      .upsert(
        {
          user_id: user.id,

          media_id:
            existingMedia.id,

          status:
            body.status ||
            "want",

          favorite:
            Boolean(body.favorite),

          personal_rating:
            body.personal_rating ??
            null,
        },
        {
          onConflict:
            "user_id,media_id",
        }
      )
      .select(
        `
        id,
        status,
        favorite,
        personal_rating,
        review,
        watched_at,
        rewatch_count,
        added_at,
        updated_at,
        media:media_id(*)
        `
      )
      .single();

    if (itemError) {
      return NextResponse.json(
        {
          error:
            itemError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      item
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req
) {
  const s = await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Não autenticado",
      },
      { status: 401 }
    );
  }

  const url = new URL(
    req.url
  );

  const id =
    url.searchParams.get(
      "id"
    );

  if (!id) {
    return NextResponse.json(
      {
        error:
          "ID da biblioteca não informado.",
      },
      { status: 400 }
    );
  }

  const {
    error,
  } = await s
    .from("library_items")
    .delete()
    .eq("id", id)
    .eq(
      "user_id",
      user.id
    );

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
  });
}
