import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

/*
 * E1 — antes, a aba "Atividade" do perfil público reconstruía um feed
 * ad-hoc a partir de `library_items` (ordenado por updated_at, sem
 * paginação). Decisão de produto #2: `activity_events` vira a fonte
 * canônica — o mesmo log real que já alimenta Home/Diário/
 * Retrospectiva via /api/activity (own-only, intocado por esta rota).
 * Aqui é o equivalente PÚBLICO: paginado, com a mesma checagem de
 * privacidade server-side que o resto de /api/public-profile já usa
 * (nunca confia em esconder seção só no client).
 */

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  const { username } = await context.params;
  const sql = getDb();

  const profileRows = await sql`
    SELECT id, activity_visibility
    FROM public.profiles
    WHERE lower(username) = lower(${username})
    LIMIT 1
  `;

  if (profileRows.length === 0) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  const profile = profileRows[0] as { id: string; activity_visibility: string };

  const session = await auth.getSession().catch(() => null);
  const viewerId: string | null = session?.data?.user?.id || null;
  const isOwner = viewerId === profile.id;

  let isFollower = false;
  if (viewerId && !isOwner) {
    const followRows = await sql`
      SELECT status FROM public.follows
      WHERE follower_id = ${viewerId} AND following_id = ${profile.id}
      LIMIT 1
    `;
    isFollower = followRows[0]?.status === "accepted";
  }

  const visible =
    isOwner ||
    profile.activity_visibility === "profile" ||
    (profile.activity_visibility === "followers" && isFollower);

  if (!visible) {
    return NextResponse.json(
      { items: [], page: 1, per_page: DEFAULT_PAGE_SIZE, total: 0, has_more: false, visible: false },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const requestedPage = Number(request.nextUrl.searchParams.get("page") || 1);
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_PAGE_SIZE);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit)))
    : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const [totalRows, items] = await Promise.all([
    sql`SELECT count(*)::int as total FROM public.activity_events WHERE user_id = ${profile.id}`,
    sql`
      SELECT
        ae.id,
        ae.event_type,
        ae.metadata,
        ae.occurred_at,
        to_jsonb(m.*) AS media
      FROM public.activity_events ae
      LEFT JOIN public.library_items li ON li.id = ae.library_item_id
      LEFT JOIN public.media m ON m.id = COALESCE(ae.media_id, li.media_id)
      WHERE ae.user_id = ${profile.id}
      ORDER BY ae.occurred_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
  ]);

  const total = Number(totalRows[0]?.total || 0);

  return NextResponse.json(
    {
      items,
      page,
      per_page: limit,
      total,
      has_more: offset + items.length < total,
      visible: true,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
