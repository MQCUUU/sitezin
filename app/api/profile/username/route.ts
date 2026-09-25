import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user) {
      return NextResponse.json({ authenticated: false });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT username
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;

    return NextResponse.json(
      {
        authenticated: true,
        username: rows.length > 0 ? rows[0].username || null : null,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Username-Backend": "neon-direct-v1",
        },
      }
    );
  } catch (error: any) {
    console.error("[username] Erro em GET /api/profile/username:", error?.message);
    return NextResponse.json(
      { error: "Erro interno do servidor ao carregar perfil." },
      { status: 500, headers: { "X-Username-Backend": "neon-direct-v1" } }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Sessão expirada. Faça login novamente." },
        { status: 401, headers: { "X-Username-Backend": "neon-direct-v1" } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawUsername = body.username;
    if (typeof rawUsername !== "string") {
      return NextResponse.json(
        { error: "Username inválido." },
        { status: 400, headers: { "X-Username-Backend": "neon-direct-v1" } }
      );
    }

    const username = rawUsername.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return NextResponse.json(
        { error: "Use de 3 a 24 letras, números ou _." },
        { status: 400, headers: { "X-Username-Backend": "neon-direct-v1" } }
      );
    }

    const sql = getDb();

    const existing = await sql`
      SELECT id, username
      FROM public.profiles
      WHERE lower(username) = ${username}
      LIMIT 1
    `;

    if (existing.length > 0 && existing[0].id !== user.id) {
      return NextResponse.json(
        { error: "Esse @ já está em uso." },
        { status: 409, headers: { "X-Username-Backend": "neon-direct-v1" } }
      );
    }

    const myProfile = await sql`
      SELECT id, display_name, username
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;

    let finalUsername: string;

    if (myProfile.length > 0) {
      const currentUsername = myProfile[0].username;

      if (currentUsername && currentUsername !== username) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const changesCountRes = await sql`
          SELECT count(*)::int as count
          FROM public.username_changes
          WHERE user_id = ${user.id} AND changed_at >= ${thirtyDaysAgo}
        `;

        if (Number(changesCountRes[0]?.count || 0) >= 2) {
          return NextResponse.json(
            { error: "Você já usou as 2 trocas de @ dos últimos 30 dias." },
            { status: 429, headers: { "X-Username-Backend": "neon-direct-v1" } }
          );
        }

        await sql.transaction([
          sql`
            UPDATE public.profiles
            SET username = ${username}
            WHERE id = ${user.id}
          `,
          sql`
            INSERT INTO public.username_changes (user_id, old_username, new_username, changed_at)
            VALUES (${user.id}, ${currentUsername}, ${username}, now())
          `,
        ]);
        finalUsername = username;
      } else {
        const updated = await sql`
          UPDATE public.profiles
          SET username = ${username}
          WHERE id = ${user.id}
          RETURNING id, username
        `;
        finalUsername = updated[0].username;
      }
    } else {
      const displayName = (user.name || "").trim() || username;
      const inserted = await sql`
        INSERT INTO public.profiles (
          id,
          display_name,
          username,
          visibility,
          is_public
        )
        VALUES (
          ${user.id},
          ${displayName},
          ${username},
          'private',
          false
        )
        RETURNING id, username
      `;
      finalUsername = inserted[0].username;
    }

    return NextResponse.json(
      { success: true, username: finalUsername },
      { headers: { "X-Username-Backend": "neon-direct-v1" } }
    );
  } catch (error: any) {
    console.error("[username] Erro em POST /api/profile/username:", error?.message);
    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar username." },
      { status: 500, headers: { "X-Username-Backend": "neon-direct-v1" } }
    );
  }
}
