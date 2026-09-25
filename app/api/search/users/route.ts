import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/neon";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q")?.trim() || "";
  const query = rawQuery.replace(/^@+/, "").trim();

  if (query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const safeQuery = query.replace(/[,%()]/g, "");
  const sql = getDb();

  try {
    const data = await sql`
      SELECT id, username, display_name, avatar_url
      FROM public.profiles
      WHERE username IS NOT NULL
        AND (
          username ILIKE ${'%' + safeQuery + '%'}
          OR display_name ILIKE ${'%' + safeQuery + '%'}
        )
      LIMIT 20
    `;

    const normalizedQuery = normalize(query);
    const users = [...(data || [])].sort((a, b) => {
      const score = (profile: any) => {
        const username = normalize(profile.username || "");
        const name = normalize(profile.display_name || "");
        if (username === normalizedQuery) return 4;
        if (name === normalizedQuery) return 3;
        if (username.startsWith(normalizedQuery)) return 2;
        if (name.startsWith(normalizedQuery)) return 1;
        return 0;
      };
      return score(b) - score(a);
    });

    return NextResponse.json(
      { users },
      {
        headers: {
          "Cache-Control":
            "public, max-age=30, s-maxage=120, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("[GET /api/search/users]", error);
    return NextResponse.json({ users: [] }, { status: 500 });
  }
}
