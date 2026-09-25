import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function POST(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Sessão não encontrada ou expirada. Faça login novamente." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawUsername = body.username;
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (typeof rawUsername !== "string") {
      return NextResponse.json(
        { error: "Username é obrigatório." },
        { status: 400 }
      );
    }

    const cleanUsername = rawUsername.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      return NextResponse.json(
        { error: "Username deve ter de 3 a 24 caracteres (letras, números ou _)." },
        { status: 400 }
      );
    }

    const sql = getDb();

    // 1. Verifica se username já está em uso por outro usuário
    const existing = await sql`
      SELECT id, username
      FROM public.profiles
      WHERE lower(username) = ${cleanUsername}
      LIMIT 1
    `;

    if (existing.length > 0 && existing[0].id !== user.id) {
      return NextResponse.json(
        { error: "Este @ de usuário já está em uso." },
        { status: 409 }
      );
    }

    const displayName = name || (user.name || "").trim() || cleanUsername;

    // 2. Verifica se profile já existe para este user.id
    const myProfile = await sql`
      SELECT id, display_name, username
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;

    if (myProfile.length === 0) {
      // Profile inexistente: INSERT
      await sql`
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
          ${cleanUsername},
          'private',
          false
        )
      `;
    } else {
      // Profile já existente: UPDATE
      await sql`
        UPDATE public.profiles
        SET
          display_name = COALESCE(NULLIF(${name}, ''), display_name),
          username = ${cleanUsername}
        WHERE id = ${user.id}
      `;
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: user.id,
        username: cleanUsername,
        display_name: displayName,
      },
    });
  } catch (error: any) {
    console.error("[profile-create] Erro:", error?.message);
    return NextResponse.json(
      { error: error?.message || "Falha ao registrar perfil." },
      { status: 500 }
    );
  }
}


export async function PATCH(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Sessão não encontrada ou expirada. Faça login novamente." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const displayName = typeof body.display_name === "string" ? body.display_name.trim() : null;

    if (displayName !== null && displayName.length > 0) {
      const sql = getDb();
      await sql`
        UPDATE public.profiles
        SET display_name = ${displayName}
        WHERE id = ${user.id}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[profile-patch] Erro:", error?.message);
    return NextResponse.json(
      { error: error?.message || "Falha ao atualizar perfil." },
      { status: 500 }
    );
  }
}
