import { NextRequest, NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { limitPublicRequest } from "@/lib/rate-limit";
import { normalizedTasteAffinity } from "@/lib/social/ratings";

const LIMIT_MAX = 50;

export async function GET(request: NextRequest, context: { params: Promise<{ username: string }> }) {
  const limited = limitPublicRequest(request, "publicProfile");
  if (limited) return limited;

  try {
    const { username } = await context.params;
    const session = await auth.getSession().catch(() => null);
    const viewerId: string | null = session?.data?.user?.id ?? null;
    const params = request.nextUrl.searchParams;
    const requestedPage = Number(params.get("page") || 1);
    const requestedLimit = Number(params.get("limit") || 24);
    const page = Math.min(100_000, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
    const limit = Math.min(LIMIT_MAX, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 24));
    const offset = (page - 1) * limit;
    const sql = getDb();

    const profiles = await sql`
      SELECT id
      FROM public.profiles WHERE lower(username) = lower(${username}) LIMIT 1
    `;
    if (!profiles.length) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    const profile = profiles[0];
    const isOwner = viewerId === profile.id;
    if (!isOwner) return NextResponse.json({ error: "A lista de amigos só pode ser vista pelo dono do perfil." }, { status: 403, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });

    const totalRows = await sql`
      SELECT count(*)::int AS total
      FROM public.follows f JOIN public.follows back
        ON back.follower_id = f.following_id AND back.following_id = f.follower_id AND back.status = 'accepted'
      WHERE f.follower_id = ${profile.id} AND f.status = 'accepted'
    `;
    const items = await sql`
      SELECT json_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) AS profile,
        affinity.shared_ratings, affinity.average_difference
      FROM public.follows f JOIN public.follows back
        ON back.follower_id = f.following_id AND back.following_id = f.follower_id AND back.status = 'accepted'
      JOIN public.profiles p ON p.id = f.following_id
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS shared_ratings,
          avg(abs(theirs.personal_rating::float - mine.personal_rating::float))::float AS average_difference
        FROM public.library_items theirs
        JOIN public.library_items mine ON mine.user_id = ${profile.id} AND mine.media_id = theirs.media_id AND mine.personal_rating IS NOT NULL
        WHERE theirs.user_id = f.following_id AND theirs.personal_rating IS NOT NULL
      ) affinity ON true
      WHERE f.follower_id = ${profile.id} AND f.status = 'accepted'
      ORDER BY f.updated_at DESC, p.username ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const total = Number(totalRows[0]?.total || 0);
    const enrichedItems = items.map((row: any) => ({ ...row, affinity_score: normalizedTasteAffinity(Number(row.shared_ratings || 0), Number(row.average_difference)) }));
    return NextResponse.json({ items: enrichedItems, page, per_page: limit, total, has_more: offset + items.length < total }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) {
    return respostaDeErro(error, "GET /api/public-profile/[username]/connections");
  }
}
