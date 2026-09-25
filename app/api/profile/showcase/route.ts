import { NextResponse } from "next/server";
import { respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const sql = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [profileRows, favoritesRows, usernameChangesRows] = await Promise.all([
      sql`
        SELECT
          username, bio, avatar_url, is_public, visibility,
          follow_policy, followers_visibility, following_visibility
        FROM public.profiles
        WHERE id = ${user.id}
        LIMIT 1
      `,
      sql`
        SELECT pf.media_id, pf.media_type, pf.position, row_to_json(m.*) as media
        FROM public.profile_favorites pf
        JOIN public.media m ON m.id = pf.media_id
        WHERE pf.user_id = ${user.id}
        ORDER BY pf.position ASC
      `,
      sql`
        SELECT count(*)::int as count
        FROM public.username_changes
        WHERE user_id = ${user.id} AND changed_at >= ${thirtyDaysAgo}
      `,
    ]);

    const usernameChangesCount = Number(usernameChangesRows[0]?.count || 0);
    return NextResponse.json({
      profile: profileRows[0] || {},
      favorites: favoritesRows || [],
      username_changes: {
        used: usernameChangesCount,
        remaining: Math.max(0, 2 - usernameChangesCount),
      },
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/profile/showcase");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const sql = getDb();

    // 1. Perfil atual
    const existingProfileRows = await sql`
      SELECT id, username, display_name
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;

    const existingProfile = existingProfileRows[0];
    const requestedUsername = String(body.username || "").trim().toLowerCase();
    let username = String(existingProfile?.username || requestedUsername).trim().toLowerCase();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return NextResponse.json({ error: "Use de 3 a 24 letras, números ou _." }, { status: 400 });
    }

    let usernameChange = null;
    if (existingProfile?.username && requestedUsername && requestedUsername !== existingProfile.username) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const changesCountRes = await sql`
        SELECT count(*)::int as count
        FROM public.username_changes
        WHERE user_id = ${user.id} AND changed_at >= ${thirtyDaysAgo}
      `;

      if (Number(changesCountRes[0]?.count || 0) >= 2) {
        return NextResponse.json({ error: "Você já usou as 2 trocas de @ dos últimos 30 dias." }, { status: 429 });
      }

      const takenRes = await sql`
        SELECT id FROM public.profiles
        WHERE lower(username) = ${requestedUsername} AND id != ${user.id}
        LIMIT 1
      `;
      if (takenRes.length > 0) {
        return NextResponse.json({ error: "Esse @ já está em uso." }, { status: 409 });
      }

      const insertChangeRes = await sql`
        INSERT INTO public.username_changes (user_id, old_username, new_username, changed_at)
        VALUES (${user.id}, ${existingProfile.username}, ${requestedUsername}, now())
        RETURNING *
      `;
      usernameChange = insertChangeRes[0];
      username = requestedUsername;
    }

    // 2. Validação dos favoritos
    const favorites = (Array.isArray(body.favorites) ? body.favorites : []).filter(
      (item: any) => ["movie", "tv"].includes(item.media_type),
    );

    if (
      favorites.filter((item: any) => item.media_type === "movie").length > 5 ||
      favorites.filter((item: any) => item.media_type === "tv").length > 5
    ) {
      return NextResponse.json({ error: "Escolha no máximo 5 filmes e 5 séries." }, { status: 400 });
    }

    const favoriteMediaIds: number[] = [
      ...new Set<number>(favorites.map((item: any): number => Number(item.media_id))),
    ];

    if (favoriteMediaIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return NextResponse.json({ error: "Um dos títulos escolhidos é inválido." }, { status: 400 });
    }

    if (favoriteMediaIds.length > 0) {
      const eligible = await sql`
        SELECT li.media_id, li.status, m.media_type
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${user.id}
          AND li.media_id = ANY(${favoriteMediaIds})
          AND li.status IN ('watched', 'rewatching', 'rewatched')
      `;

      const eligibleById = new Map(
        (eligible || []).map((item: any) => [Number(item.media_id), item.media_type]),
      );

      const hasInvalidFavorite = favorites.some(
        (item: any) => eligibleById.get(Number(item.media_id)) !== item.media_type,
      );

      if (hasInvalidFavorite) {
        return NextResponse.json(
          { error: "Escolha apenas filmes e séries assistidos, reassistindo ou reassistidos." },
          { status: 400 },
        );
      }
    }

    // 3. Atualizar public.profiles
    const bio = String(body.bio || "").trim().slice(0, 280) || null;
    const visibility = body.visibility === "public" ? "public" : "private";
    const isPublic = body.visibility === "public";
    const displayName = user.name || existingProfile?.display_name || username;

    await sql`
      INSERT INTO public.profiles (id, display_name, username, bio, visibility, is_public)
      VALUES (${user.id}, ${displayName}, ${username}, ${bio}, ${visibility}, ${isPublic})
      ON CONFLICT (id)
      DO UPDATE SET username = EXCLUDED.username, bio = EXCLUDED.bio, visibility = EXCLUDED.visibility, is_public = EXCLUDED.is_public
    `;

    // 4. Atualizar profile_favorites
    await sql`DELETE FROM public.profile_favorites WHERE user_id = ${user.id}`;

    for (const item of favorites) {
      await sql`
        INSERT INTO public.profile_favorites (user_id, media_id, media_type, position)
        VALUES (${user.id}, ${Number(item.media_id)}, ${item.media_type}, ${Number(item.position)})
      `;
    }

    return NextResponse.json({ success: true, username, username_change: usernameChange });
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Esse nome de usuário já está em uso." }, { status: 409 });
    }
    return respostaDeErro(error, "PUT /api/profile/showcase");
  }
}
