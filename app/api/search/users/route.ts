import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ users: [] });
  }

  const safeQuery = query.replace(/[,%()]/g, "");
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .not("username", "is", null)
    .or(
      `username.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`,
    )
    .limit(20);

  if (error) {
    console.error("[GET /api/search/users]", error);
    return NextResponse.json({ users: [] }, { status: 500 });
  }

  const normalizedQuery = normalize(query);
  const users = [...(data || [])].sort((a, b) => {
    const score = (profile: (typeof data)[number]) => {
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
    },
  );
}
