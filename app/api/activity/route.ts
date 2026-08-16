import { NextRequest, NextResponse } from "next/server";

import {
  naoAutenticado,
  respostaDeErro
} from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

type Media = {
  id: number;
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_path: string | null;
  seasons_count: number | null;
  runtime: number | null;
  genres: string[];
};

type ActivityRow = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  occurred_at: string;

  library_item:
    | {
        media:
          | Media
          | Media[]
          | null;
      }
    | Array<{
        media:
          | Media
          | Media[]
          | null;
      }>
    | null;
};

function first<T>(
  value:
    | T
    | T[]
    | null
    | undefined
): T | null {
  return Array.isArray(value)
    ? value[0] ?? null
    : value ?? null;
}

export async function GET(
  request: NextRequest
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError
  } =
    await supabase.auth.getUser();

  if (authError || !user) {
    return naoAutenticado();
  }

  const url =
    new URL(request.url);

  const year =
    url.searchParams.get("year");

  const requestedLimit =
    Number(
      url.searchParams.get("limit") ||
        300
    );

  const limit =
    Number.isFinite(requestedLimit)
      ? Math.min(
          Math.max(
            Math.floor(requestedLimit),
            1
          ),
          1000
        )
      : 300;

  /*
   * activity_events.media_id não possui FK para media.id.
   *
   * O relacionamento válido é:
   * activity_events.library_item_id
   *   -> library_items.id
   *   -> library_items.media_id
   *   -> media.id
   */
  let query = supabase
    .from("activity_events")
    .select(`
      id,
      event_type,
      metadata,
      occurred_at,
      library_item:library_item_id(
        media:media_id(
          id,
          tmdb_id,
          media_type,
          title,
          poster_path,
          seasons_count,
          runtime,
          genres
        )
      )
    `)
    .eq("user_id", user.id)
    .order(
      "occurred_at",
      {
        ascending: false
      }
    )
    .limit(limit);

  if (
    year &&
    /^\d{4}$/.test(year)
  ) {
    const start =
      `${year}-01-01T00:00:00.000Z`;

    const end =
      `${Number(year) + 1}-01-01T00:00:00.000Z`;

    query = query
      .gte("occurred_at", start)
      .lt("occurred_at", end);
  }

  const {
    data,
    error
  } = await query;

  if (error) {
    return respostaDeErro(
      error,
      "GET /api/activity"
    );
  }

  /*
   * Mantém o contrato esperado pela página:
   *
   * {
   *   id,
   *   event_type,
   *   metadata,
   *   occurred_at,
   *   media
   * }
   *
   * Portanto app/page.tsx não precisa mudar.
   */
  const activities =
    (
      (data || []) as unknown as
        ActivityRow[]
    ).map(
      ({
        library_item:
          libraryItemValue,
        ...activity
      }) => {
        const libraryItem =
          first(libraryItemValue);

        return {
          ...activity,

          media:
            first(
              libraryItem?.media
            )
        };
      }
    );

  return NextResponse.json(
    activities
  );
}