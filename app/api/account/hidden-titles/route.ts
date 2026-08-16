import { NextResponse } from "next/server";

import {
  naoAutenticado,
  respostaDeErro,
} from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

const PRIVATE_NO_STORE = {
  "Cache-Control": "private, no-store",
};

type HiddenTitle = {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  reason: string | null;
  created_at: string;
};

function fallbackTitle(row: HiddenTitle) {
  return {
    ...row,
    title:
      `${row.media_type === "tv"
        ? "Série"
        : "Filme"} #${row.tmdb_id}`,
    poster_path: null,
    year: "",
    vote_average: null,
  };
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
      "GET /api/account/hidden-titles",
    );
  }

  const rows = (data || []) as HiddenTitle[];
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      rows.map(fallbackTitle),
      {
        headers: PRIVATE_NO_STORE,
      },
    );
  }

  const language =
    process.env.TMDB_LANGUAGE || "pt-BR";

  const enriched = await Promise.all(
    rows.map(async (row) => {
      try {
        const response = await fetch(
          `${TMDB_BASE}/${row.media_type}/${row.tmdb_id}?api_key=${encodeURIComponent(
            apiKey,
          )}&language=${encodeURIComponent(
            language,
          )}`,
          {
            next: {
              revalidate: 21600,
            },
            signal: AbortSignal.timeout(8000),
          },
        );

        if (!response.ok) {
          return fallbackTitle(row);
        }

        const item = await response.json();

        const date =
          item.release_date ||
          item.first_air_date ||
          "";

        return {
          ...row,
          title:
            item.title ||
            item.name ||
            `#${row.tmdb_id}`,
          poster_path:
            item.poster_path || null,
          year: String(date).slice(0, 4),
          vote_average:
            Number(item.vote_average || 0) ||
            null,
        };
      } catch {
        return fallbackTitle(row);
      }
    }),
  );

  return NextResponse.json(enriched, {
    headers: PRIVATE_NO_STORE,
  });
}