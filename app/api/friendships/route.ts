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
      SELECT requester_id, addressee_id, status, created_at, updated_at
      FROM public.friendships
      WHERE requester_id = ${user.id} OR addressee_id = ${user.id}
      ORDER BY created_at DESC
    `;

    const counterpartIds = [
      ...new Set(
        rows.map((row: any) =>
          row.requester_id === user.id ? row.addressee_id : row.requester_id
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
      const isRequester = row.requester_id === user.id;
      const otherId = isRequester ? row.addressee_id : row.requester_id;
      return {
        ...row,
        direction: isRequester ? "outgoing" : "incoming",
        friend: profileMap.get(otherId) || null,
      };
    });

    return NextResponse.json({
      friends: enriched.filter((row: any) => row.status === "accepted"),
      incoming: enriched.filter((row: any) => row.direction === "incoming" && row.status === "pending"),
      outgoing: enriched.filter((row: any) => row.direction === "outgoing" && row.status === "pending"),
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/friendships");
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
        SELECT id, username, display_name
        FROM public.profiles
        WHERE id = ${targetId}
        LIMIT 1
      `;
    } else {
      const cleanUsername = rawUsername.replace(/^@+/, "").toLowerCase();
      targetRows = await sql`
        SELECT id, username, display_name
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
      return entradaInvalida("Você não pode solicitar amizade a si mesmo.");
    }

    const existing = await sql`
      SELECT requester_id, addressee_id, status
      FROM public.friendships
      WHERE (requester_id = ${user.id} AND addressee_id = ${target.id})
         OR (requester_id = ${target.id} AND addressee_id = ${user.id})
      LIMIT 1
    `;

    if (existing.length > 0) {
      if (existing[0].status === "accepted") {
        return NextResponse.json({ error: "Vocês já são amigos." }, { status: 409 });
      }
      return NextResponse.json({ error: "Já existe uma solicitação pendente." }, { status: 409 });
    }

    await sql`
      INSERT INTO public.friendships (requester_id, addressee_id, status, created_at, updated_at)
      VALUES (${user.id}, ${target.id}, 'pending', now(), now())
    `;

    return NextResponse.json({ success: true, status: "pending" }, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "POST /api/friendships");
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
    const requesterId = String(body.requester_id || "").trim();
    const action = String(body.action || "").trim();

    if (!requesterId || !["accept", "reject"].includes(action)) {
      return entradaInvalida("requester_id e action ('accept' ou 'reject') são obrigatórios.");
    }

    const sql = getDb();

    if (action === "reject") {
      const del = await sql`
        DELETE FROM public.friendships
        WHERE requester_id = ${requesterId}
          AND addressee_id = ${user.id}
          AND status = 'pending'
        RETURNING requester_id
      `;
      if (del.length === 0) {
        return NextResponse.json(
          { error: "Pedido de amizade não encontrado ou sem permissão." },
          { status: 404 }
        );
      }
    } else {
      const upd = await sql`
        UPDATE public.friendships
        SET status = 'accepted', updated_at = now()
        WHERE requester_id = ${requesterId}
          AND addressee_id = ${user.id}
          AND status = 'pending'
        RETURNING requester_id
      `;
      if (upd.length === 0) {
        return NextResponse.json(
          { error: "Pedido de amizade não encontrado ou sem permissão." },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "PATCH /api/friendships");
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
    const body = await request.json().catch(() => ({}));
    userId = body?.user_id ? String(body.user_id).trim() : null;
    if (!userId) {
      userId = request.nextUrl.searchParams.get("user_id");
    }

    if (!userId) {
      return entradaInvalida("user_id é obrigatório.");
    }

    const sql = getDb();
    const del = await sql`
      DELETE FROM public.friendships
      WHERE (requester_id = ${user.id} AND addressee_id = ${userId})
         OR (addressee_id = ${user.id} AND requester_id = ${userId})
      RETURNING requester_id, addressee_id
    `;

    if (del.length === 0) {
      return NextResponse.json(
        { error: "Relação de amizade não encontrada ou já removida." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/friendships");
  }
}
