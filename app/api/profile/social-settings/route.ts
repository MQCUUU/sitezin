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
      SELECT
        visibility,
        follow_policy,
        followers_visibility,
        following_visibility,
        activity_visibility,
        diary_visibility,
        lists_visibility,
        likes_visibility
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    return respostaDeErro(error, "GET /api/profile/social-settings");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const body = await request.json().catch(() => ({}));
    const visibility = ["public", "private"].includes(body.visibility)
      ? body.visibility
      : "private";
    const followPolicy = ["profile", "approval", "nobody"].includes(body.follow_policy)
      ? body.follow_policy
      : "profile";

    const validList = (value: unknown) =>
      ["profile", "followers", "private"].includes(String(value));

    const followersVisibility = validList(body.followers_visibility)
      ? body.followers_visibility
      : "profile";
    const followingVisibility = validList(body.following_visibility)
      ? body.following_visibility
      : "profile";
    const activityVisibility = validList(body.activity_visibility)
      ? body.activity_visibility
      : "profile";
    const diaryVisibility = validList(body.diary_visibility)
      ? body.diary_visibility
      : "profile";
    const listsVisibility = validList(body.lists_visibility)
      ? body.lists_visibility
      : "profile";
    const likesVisibility = validList(body.likes_visibility)
      ? body.likes_visibility
      : "profile";

    const sql = getDb();
    const updated = await sql`
      UPDATE public.profiles
      SET
        visibility = ${visibility},
        is_public = ${visibility === "public"},
        follow_policy = ${followPolicy},
        followers_visibility = ${followersVisibility},
        following_visibility = ${followingVisibility},
        activity_visibility = ${activityVisibility},
        diary_visibility = ${diaryVisibility},
        lists_visibility = ${listsVisibility},
        likes_visibility = ${likesVisibility}
      WHERE id = ${user.id}
      RETURNING id, visibility, is_public, follow_policy
    `;

    if (updated.length === 0) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, settings: updated[0] });
  } catch (error) {
    return respostaDeErro(error, "PUT /api/profile/social-settings");
  }
}
