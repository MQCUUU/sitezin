import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { mergeSocialSettings, type SocialSettings } from "@/lib/social/visibility";

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

    return NextResponse.json(rows[0], { headers: { "Cache-Control": "private, no-store" } });
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
    const sql = getDb();

    const currentRows = await sql`
      SELECT
        visibility, follow_policy, followers_visibility, following_visibility,
        activity_visibility, diary_visibility, lists_visibility, likes_visibility
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;

    if (currentRows.length === 0) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    }

    // V3.3: PUT parcial é aplicado SOBRE o estado salvo (campo ausente/inválido
    // mantém o valor atual — antes voltava ao padrão e apagava as outras regras).
    const next = mergeSocialSettings(currentRows[0] as SocialSettings, body && typeof body === "object" ? body : {});

    const updated = await sql`
      UPDATE public.profiles
      SET
        visibility = ${next.visibility},
        is_public = ${next.visibility === "public"},
        follow_policy = ${next.follow_policy},
        followers_visibility = ${next.followers_visibility},
        following_visibility = ${next.following_visibility},
        activity_visibility = ${next.activity_visibility},
        diary_visibility = ${next.diary_visibility},
        lists_visibility = ${next.lists_visibility},
        likes_visibility = ${next.likes_visibility}
      WHERE id = ${user.id}
      RETURNING visibility, is_public, follow_policy
    `;

    if (updated.length === 0) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, settings: updated[0] });
  } catch (error) {
    return respostaDeErro(error, "PUT /api/profile/social-settings");
  }
}
