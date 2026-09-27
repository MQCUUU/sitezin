import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";

const CONNECTION_TYPES = ["followers", "following", "incoming", "outgoing"] as const;
type ConnectionType = (typeof CONNECTION_TYPES)[number];
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;

/*
 * E1 — followers/following eram um fetch completo do grafo do usuário
 * (E0 §22/§29, HIGH). Agora `GET /api/follows?type=...` pagina de
 * verdade (LIMIT/OFFSET + COUNT dedicado), e `GET /api/follows` sem
 * `type` vira um resumo leve (contagens + item mais recente por lista)
 * — o único formato que o polling de 30s do FollowRequestNotifier
 * precisa, sem nunca baixar o grafo inteiro.
 */
function directionFilter(type: ConnectionType): { column: "follower_id" | "following_id"; status: "accepted" | "pending" } {
  switch (type) {
    case "followers":
      return { column: "following_id", status: "accepted" };
    case "following":
      return { column: "follower_id", status: "accepted" };
    case "incoming":
      return { column: "following_id", status: "pending" };
    case "outgoing":
      return { column: "follower_id", status: "pending" };
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const sql = getDb();
    const type = request.nextUrl.searchParams.get("type");

    if (!type) {
      /*
       * Modo resumo — o que o FollowRequestNotifier consome a cada 30s.
       * Quatro contagens via COUNT (não `.length` de array) + o item
       * mais recente de incoming/following (para o texto do toast),
       * cada um limitado a 1 linha.
       */
      const counts = await sql`
        SELECT
          count(*) FILTER (WHERE following_id = ${user.id} AND status = 'accepted')::int AS followers,
          count(*) FILTER (WHERE follower_id = ${user.id} AND status = 'accepted')::int AS following,
          count(*) FILTER (WHERE following_id = ${user.id} AND status = 'pending')::int AS incoming,
          count(*) FILTER (WHERE follower_id = ${user.id} AND status = 'pending')::int AS outgoing
        FROM public.follows
        WHERE follower_id = ${user.id} OR following_id = ${user.id}
      `;

      const latestIncomingRows = await sql`
        SELECT f.follower_id, f.created_at,
          json_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) as profile
        FROM public.follows f
        JOIN public.profiles p ON p.id = f.follower_id
        WHERE f.following_id = ${user.id} AND f.status = 'pending'
        ORDER BY f.created_at DESC
        LIMIT 1
      `;

      const latestAcceptedRows = await sql`
        SELECT f.following_id, f.updated_at,
          json_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) as profile
        FROM public.follows f
        JOIN public.profiles p ON p.id = f.following_id
        WHERE f.follower_id = ${user.id} AND f.status = 'accepted'
        ORDER BY f.updated_at DESC
        LIMIT 1
      `;

      return NextResponse.json(
        {
          counts: counts[0] || { followers: 0, following: 0, incoming: 0, outgoing: 0 },
          latest_incoming: latestIncomingRows[0] || null,
          latest_accepted: latestAcceptedRows[0] || null,
        },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (!CONNECTION_TYPES.includes(type as ConnectionType)) {
      return entradaInvalida("type deve ser followers, following, incoming ou outgoing.");
    }

    const requestedPage = Number(request.nextUrl.searchParams.get("page") || 1);
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_PAGE_SIZE);
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit)))
      : DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * limit;

    const { column, status } = directionFilter(type as ConnectionType);
    const otherColumn = column === "follower_id" ? "following_id" : "follower_id";

    const totalRows = await sql.query(
      `SELECT count(*)::int as total FROM public.follows WHERE ${column} = $1 AND status = $2`,
      [user.id, status]
    );
    const total = Number((totalRows[0] as { total: number } | undefined)?.total || 0);

    const rows = await sql.query(
      `
        SELECT
          f.follower_id, f.following_id, f.status, f.created_at, f.updated_at,
          json_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'visibility', p.visibility) as profile
        FROM public.follows f
        JOIN public.profiles p ON p.id = f.${otherColumn}
        WHERE f.${column} = $1 AND f.status = $2
        ORDER BY f.created_at DESC
        LIMIT $3 OFFSET $4
      `,
      [user.id, status, limit, offset]
    );

    const direction = column === "follower_id" ? "following" : "follower";
    const items = (rows as any[]).map((row) => ({ ...row, direction }));

    return NextResponse.json(
      {
        items,
        page,
        per_page: limit,
        total,
        has_more: offset + items.length < total,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/follows");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const body = await request.json().catch(() => ({}));
    const rawUsername = String(body.username || "").trim();
    const targetId = body.target_id ? String(body.target_id).trim() : null;

    if (!rawUsername && !targetId) {
      return entradaInvalida("Username ou target_id é obrigatório.");
    }

    const sql = getDb();

    let targetRows: any[] = [];
    if (targetId) {
      targetRows = await sql`
        SELECT id, username, display_name, visibility, is_public, follow_policy
        FROM public.profiles
        WHERE id = ${targetId}
        LIMIT 1
      `;
    } else {
      const cleanUsername = rawUsername.replace(/^@+/, "").toLowerCase();
      targetRows = await sql`
        SELECT id, username, display_name, visibility, is_public, follow_policy
        FROM public.profiles
        WHERE lower(username) = ${cleanUsername}
        LIMIT 1
      `;
    }

    if (targetRows.length === 0) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const target = targetRows[0];
    if (target.id === user.id) {
      return entradaInvalida("Você não pode seguir a si mesmo.");
    }

    if (target.follow_policy === "nobody") {
      return NextResponse.json(
        { error: "Este usuário não está aceitando novos seguidores." },
        { status: 403 }
      );
    }

    const automatic =
      target.follow_policy === "profile" &&
      (target.visibility === "public" || target.is_public === true);
    const status = automatic ? "accepted" : "pending";

    await sql`
      INSERT INTO public.follows (follower_id, following_id, status, created_at, updated_at)
      VALUES (${user.id}, ${target.id}, ${status}, now(), now())
      ON CONFLICT (follower_id, following_id)
      DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    `;

    return NextResponse.json({ status });
  } catch (error) {
    return respostaDeErro(error, "POST /api/follows");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const body = await request.json().catch(() => ({}));
    const followerId = String(body.follower_id || "").trim();
    const action = String(body.action || "").trim();

    if (!followerId || !["accept", "reject"].includes(action)) {
      return entradaInvalida("follower_id e action ('accept' ou 'reject') são obrigatórios.");
    }

    const sql = getDb();

    if (action === "reject") {
      const del = await sql`
        DELETE FROM public.follows
        WHERE follower_id = ${followerId}
          AND following_id = ${user.id}
          AND status = 'pending'
        RETURNING follower_id
      `;
      if (del.length === 0) {
        return NextResponse.json(
          { error: "Solicitação não encontrada ou sem permissão." },
          { status: 404 }
        );
      }
    } else {
      const upd = await sql`
        UPDATE public.follows
        SET status = 'accepted', updated_at = now()
        WHERE follower_id = ${followerId}
          AND following_id = ${user.id}
          AND status = 'pending'
        RETURNING follower_id
      `;
      if (upd.length === 0) {
        return NextResponse.json(
          { error: "Solicitação não encontrada ou sem permissão." },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "PATCH /api/follows");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    let userId: string | null = null;
    let mode: string = "unfollow";

    const body = await request.json().catch(() => ({}));
    userId = body?.user_id ? String(body.user_id).trim() : null;
    mode = body?.mode ? String(body.mode).trim() : "unfollow";

    if (!userId) {
      userId = request.nextUrl.searchParams.get("user_id");
      mode = request.nextUrl.searchParams.get("mode") || mode;
    }

    if (!userId || !["unfollow", "remove_follower", "cancel"].includes(mode)) {
      return entradaInvalida("user_id e mode ('unfollow', 'remove_follower' ou 'cancel') são obrigatórios.");
    }

    const sql = getDb();
    let res: any[] = [];

    if (mode === "unfollow" || mode === "cancel") {
      res = await sql`
        DELETE FROM public.follows
        WHERE follower_id = ${user.id} AND following_id = ${userId}
        RETURNING follower_id, following_id
      `;
    } else {
      res = await sql`
        DELETE FROM public.follows
        WHERE follower_id = ${userId} AND following_id = ${user.id}
        RETURNING follower_id, following_id
      `;
    }

    if (res.length === 0) {
      return NextResponse.json(
        { error: "Relação não encontrada ou já removida." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/follows");
  }
}
