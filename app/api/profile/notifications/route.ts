import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

const defaults = {
  new_follower_site: true,
  new_follower_email: false,
  follow_request_site: true,
  follow_request_email: false,
  review_like_site: true,
  review_like_email: false,
  product_updates_email: false,
  new_season_site: true,
  new_episode_site: true,
};

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const userId = user.id;
    const sql = getDb();

    const rows = await sql`
      SELECT
        new_follower_site,
        new_follower_email,
        follow_request_site,
        follow_request_email,
        review_like_site,
        review_like_email,
        product_updates_email,
        new_season_site,
        new_episode_site
      FROM public.notification_preferences
      WHERE user_id = ${userId}
      LIMIT 1;
    `;

    return NextResponse.json(rows[0] || defaults);
  } catch (error) {
    console.error("Erro em GET /api/profile/notifications:", error);
    return respostaDeErro(error, "GET /api/profile/notifications");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const userId = user.id;
    const body = await request.json().catch(() => ({}));
    const sql = getDb();

    const new_follower_site = body.new_follower_site !== undefined ? Boolean(body.new_follower_site) : defaults.new_follower_site;
    const new_follower_email = body.new_follower_email !== undefined ? Boolean(body.new_follower_email) : defaults.new_follower_email;
    const follow_request_site = body.follow_request_site !== undefined ? Boolean(body.follow_request_site) : defaults.follow_request_site;
    const follow_request_email = body.follow_request_email !== undefined ? Boolean(body.follow_request_email) : defaults.follow_request_email;
    const review_like_site = body.review_like_site !== undefined ? Boolean(body.review_like_site) : defaults.review_like_site;
    const review_like_email = body.review_like_email !== undefined ? Boolean(body.review_like_email) : defaults.review_like_email;
    const product_updates_email = body.product_updates_email !== undefined ? Boolean(body.product_updates_email) : defaults.product_updates_email;
    const new_season_site = body.new_season_site !== undefined ? Boolean(body.new_season_site) : defaults.new_season_site;
    const new_episode_site = body.new_episode_site !== undefined ? Boolean(body.new_episode_site) : defaults.new_episode_site;

    await sql`
      INSERT INTO public.notification_preferences (
        user_id,
        new_follower_site,
        new_follower_email,
        follow_request_site,
        follow_request_email,
        review_like_site,
        review_like_email,
        product_updates_email,
        new_season_site,
        new_episode_site,
        updated_at
      )
      VALUES (
        ${userId},
        ${new_follower_site},
        ${new_follower_email},
        ${follow_request_site},
        ${follow_request_email},
        ${review_like_site},
        ${review_like_email},
        ${product_updates_email},
        ${new_season_site},
        ${new_episode_site},
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        new_follower_site = EXCLUDED.new_follower_site,
        new_follower_email = EXCLUDED.new_follower_email,
        follow_request_site = EXCLUDED.follow_request_site,
        follow_request_email = EXCLUDED.follow_request_email,
        review_like_site = EXCLUDED.review_like_site,
        review_like_email = EXCLUDED.review_like_email,
        product_updates_email = EXCLUDED.product_updates_email,
        new_season_site = EXCLUDED.new_season_site,
        new_episode_site = EXCLUDED.new_episode_site,
        updated_at = NOW();
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro em PUT /api/profile/notifications:", error);
    return respostaDeErro(error, "PUT /api/profile/notifications");
  }
}
