import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { followStatusFor } from "@/lib/social/visibility";
import { normalizedTasteAffinity } from "@/lib/social/ratings";
import { createSocialNotice } from "@/lib/notifications/social";

const CONNECTION_TYPES = ["followers", "following", "friends", "incoming", "outgoing"] as const;
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
function directionFilter(type: Exclude<ConnectionType, "friends">): { column: "follower_id" | "following_id"; status: "accepted" | "pending" } {
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
          count(*) FILTER (WHERE follower_id = ${user.id} AND status = 'pending')::int AS outgoing,
          count(*) FILTER (WHERE follower_id = ${user.id} AND status = 'accepted'
            AND EXISTS (SELECT 1 FROM public.follows back
              WHERE back.follower_id = public.follows.following_id
                AND back.following_id = ${user.id} AND back.status = 'accepted'))::int AS friends
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
      return entradaInvalida("type deve ser followers, following, friends, incoming ou outgoing.");
    }

    const requestedPage = Number(request.nextUrl.searchParams.get("page") || 1);
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_PAGE_SIZE);
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit)))
      : DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * limit;

    if (type === "friends") {
      const totalRows = await sql.query(
        `SELECT count(*)::int AS total
         FROM public.follows f
         JOIN public.follows back ON back.follower_id = f.following_id
           AND back.following_id = f.follower_id AND back.status = 'accepted'
         WHERE f.follower_id = $1 AND f.status = 'accepted'`,
        [user.id]
      );
      const total = Number((totalRows[0] as { total: number } | undefined)?.total || 0);
      const rows = await sql.query(
        `SELECT f.follower_id, f.following_id, f.created_at, f.updated_at,
          json_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
            'avatar_url', p.avatar_url, 'visibility', p.visibility) AS profile,
          affinity.shared_ratings, affinity.average_difference
         FROM public.follows f
         JOIN public.follows back ON back.follower_id = f.following_id
           AND back.following_id = f.follower_id AND back.status = 'accepted'
         JOIN public.profiles p ON p.id = f.following_id
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS shared_ratings,
             avg(abs(theirs.personal_rating::float - mine.personal_rating::float))::float AS average_difference
           FROM public.library_items theirs
           JOIN public.library_items mine ON mine.user_id = $1 AND mine.media_id = theirs.media_id AND mine.personal_rating IS NOT NULL
           WHERE theirs.user_id = f.following_id AND theirs.personal_rating IS NOT NULL
         ) affinity ON true
         WHERE f.follower_id = $1 AND f.status = 'accepted'
         ORDER BY f.updated_at DESC
         LIMIT $2 OFFSET $3`,
        [user.id, limit, offset]
      );
      const items = (rows as any[]).map((row) => ({
        ...row,
        direction: "friend",
        affinity_score: normalizedTasteAffinity(Number(row.shared_ratings || 0), Number(row.average_difference)),
      }));
      return NextResponse.json({ items, page, per_page: limit, total, has_more: offset + items.length < total }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const { column, status } = directionFilter(type as Exclude<ConnectionType, "friends">);
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

    const status = followStatusFor(target);

    // V3.3: idempotente — repetir o pedido (retry/duplo clique) nunca rebaixa um
    // follow já aceito para "pending"; só promove pending → accepted.
    const saved = await sql`
      INSERT INTO public.follows (follower_id, following_id, status, created_at, updated_at)
      VALUES (${user.id}, ${target.id}, ${status}, now(), now())
      ON CONFLICT (follower_id, following_id)
      DO UPDATE SET
        status = CASE WHEN follows.status = 'accepted' THEN 'accepted' ELSE EXCLUDED.status END,
        updated_at = CASE WHEN follows.status = 'accepted' OR follows.status = EXCLUDED.status THEN follows.updated_at ELSE now() END
      RETURNING status, created_at, (xmax = 0) AS created
    `;

    const relationship = saved[0];
    if (relationship?.created) {
      const actorRows = await sql`SELECT username FROM public.profiles WHERE id = ${user.id} LIMIT 1`;
      const actorUsername = actorRows[0]?.username;
      if (actorUsername && relationship.status === "pending") {
        await createSocialNotice(sql, {
          recipientId: target.id,
          actorId: user.id,
          actorUsername,
          type: "follow_request",
          eventKey: `follow-request:${user.id}:${target.id}:${new Date(relationship.created_at).getTime()}`,
          href: `/u/${target.username}?tab=connections`,
        });
      } else if (actorUsername && relationship.status === "accepted") {
        const transitionKey = new Date(relationship.created_at).getTime();
        await createSocialNotice(sql, {
          recipientId: target.id,
          actorId: user.id,
          actorUsername,
          type: "new_follower",
          eventKey: `new-follower:${user.id}:${target.id}:${transitionKey}`,
          href: `/u/${actorUsername}`,
        });

        const mutual = await sql`
          SELECT 1 FROM public.follows
          WHERE follower_id = ${target.id} AND following_id = ${user.id} AND status = 'accepted'
          LIMIT 1
        `;
        if (mutual.length) {
          const recipients = [
            { recipientId: user.id, actorId: target.id, actorUsername: target.username, href: `/u/${target.username}` },
            { recipientId: target.id, actorId: user.id, actorUsername, href: `/u/${actorUsername}` },
          ];
          for (const recipient of recipients) {
            await createSocialNotice(sql, {
              ...recipient,
              type: "new_friend",
              eventKey: `new-friend:${[user.id, target.id].sort().join(":")}:${transitionKey}`,
            });
          }
        }
      }
    }

    return NextResponse.json({ status: relationship?.status ?? status });
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
        RETURNING follower_id, updated_at
      `;
      if (upd.length === 0) {
        return NextResponse.json(
          { error: "Solicitação não encontrada ou sem permissão." },
          { status: 404 }
        );
      }

      const [actorRows, currentRows, mutual] = await Promise.all([
        sql`SELECT username FROM public.profiles WHERE id = ${user.id} LIMIT 1`,
        sql`SELECT username FROM public.profiles WHERE id = ${followerId} LIMIT 1`,
        sql`SELECT 1 FROM public.follows WHERE follower_id = ${user.id} AND following_id = ${followerId} AND status = 'accepted' LIMIT 1`,
      ]);
      const currentUsername = currentRows[0]?.username;
      const requesterUsername = actorRows[0]?.username;
      const transitionKey = new Date(upd[0].updated_at).getTime();

      if (requesterUsername) {
        await createSocialNotice(sql, {
          recipientId: followerId,
          actorId: user.id,
          actorUsername: requesterUsername,
          type: "follow_accepted",
          eventKey: `follow-accepted:${followerId}:${user.id}:${transitionKey}`,
          href: currentUsername ? `/u/${currentUsername}` : "/",
        });
      }
      if (mutual.length && currentUsername && requesterUsername) {
        const recipients = [
          { recipientId: user.id, actorId: followerId, actorUsername: requesterUsername, href: `/u/${requesterUsername}` },
          { recipientId: followerId, actorId: user.id, actorUsername: currentUsername, href: `/u/${currentUsername}` },
        ];
        for (const recipient of recipients) {
          await createSocialNotice(sql, {
            ...recipient,
            type: "new_friend",
            eventKey: `new-friend:${[user.id, followerId].sort().join(":")}:${transitionKey}`,
          });
        }
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

    const sql = getDb();

    // V3.3: o perfil público não expõe ids — a outra ponta pode vir por @username.
    const rawUsername = typeof body?.username === "string" ? body.username.replace(/^@+/, "").trim().toLowerCase() : "";

    if (!userId && rawUsername) {
      const target = await sql`SELECT id FROM public.profiles WHERE lower(username) = ${rawUsername} LIMIT 1`;

      userId = target[0]?.id ?? null;

      if (!userId) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    if (!userId || !["unfollow", "remove_follower", "cancel"].includes(mode)) {
      return entradaInvalida("user_id (ou username) e mode ('unfollow', 'remove_follower' ou 'cancel') são obrigatórios.");
    }

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
