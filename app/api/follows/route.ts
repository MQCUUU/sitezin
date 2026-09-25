import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const sql = getDb();
    const rows = await sql`
      SELECT follower_id, following_id, status, created_at, updated_at
      FROM public.follows
      WHERE follower_id = ${user.id} OR following_id = ${user.id}
      ORDER BY created_at DESC
    `;

    const counterpartIds = [
      ...new Set(
        rows.map((row: any) =>
          row.follower_id === user.id ? row.following_id : row.follower_id
        )
      ),
    ];

    let profiles: any[] = [];
    if (counterpartIds.length > 0) {
      profiles = await sql`
        SELECT id, username, display_name, avatar_url, visibility
        FROM public.profiles
        WHERE id = ANY(${counterpartIds})
      `;
    }

    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const enriched = rows.map((row: any) => {
      const isFollowing = row.follower_id === user.id;
      const otherId = isFollowing ? row.following_id : row.follower_id;
      return {
        ...row,
        direction: isFollowing ? "following" : "follower",
        profile: profileMap.get(otherId) || null,
      };
    });

    return NextResponse.json(
      {
        following: enriched.filter(
          (row: any) => row.direction === "following" && row.status === "accepted"
        ),
        followers: enriched.filter(
          (row: any) => row.direction === "follower" && row.status === "accepted"
        ),
        incoming: enriched.filter(
          (row: any) => row.direction === "follower" && row.status === "pending"
        ),
        outgoing: enriched.filter(
          (row: any) => row.direction === "following" && row.status === "pending"
        ),
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
