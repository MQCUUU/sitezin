import { NextResponse } from "next/server";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

const TMDB_BASE = "https://api.themoviedb.org/3";
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

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
    title: `${row.media_type === "tv" ? "Série" : "Filme"} #${row.tmdb_id}`,
    poster_path: null,
    year: "",
    vote_average: null,
  };
}

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const sql = getDb();
    const rows = (await sql`
      SELECT id, tmdb_id, media_type, reason, created_at
      FROM public.user_hidden_titles
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 100
    `) as HiddenTitle[];

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      return NextResponse.json(rows.map(fallbackTitle), { headers: PRIVATE_NO_STORE });
    }

    const language = process.env.TMDB_LANGUAGE || "pt-BR";
    const enriched = await Promise.all(
      rows.map(async (row) => {
        try {
          const response = await fetch(
            `${TMDB_BASE}/${row.media_type}/${row.tmdb_id}?api_key=${encodeURIComponent(
              apiKey,
            )}&language=${encodeURIComponent(language)}`,
            {
              next: { revalidate: 21600 },
              signal: AbortSignal.timeout(8000),
            },
          );
          if (!response.ok) return fallbackTitle(row);
          const details = await response.json();
          const title = details.title || details.name || fallbackTitle(row).title;
          const releaseDate = details.release_date || details.first_air_date || "";
          const year = releaseDate ? String(releaseDate).slice(0, 4) : "";
          return {
            ...row,
            title,
            poster_path: details.poster_path || null,
            year,
            vote_average: typeof details.vote_average === "number" ? Number(details.vote_average.toFixed(1)) : null,
          };
        } catch {
          return fallbackTitle(row);
        }
      }),
    );

    return NextResponse.json(enriched, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return respostaDeErro(error, "GET /api/account/hidden-titles");
  }
}
