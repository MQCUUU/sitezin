import { limitPublicRequest } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { canViewProfile, canViewSection } from "@/lib/social/visibility";

/*
 * V3.3 — privacidade aplicada AQUI (servidor), pela regra única de
 * lib/social/visibility.ts:
 *  - seção invisível para quem pede nem é consultada (antes: diário,
 *    listas e seguidores eram buscados e só depois descartados);
 *  - nenhum id interno de conta sai desta rota (nem do dono, nem de
 *    seguidores/seguindo) — a página age por @username;
 *  - e-mail nunca é selecionado.
 */
const NO_STORE = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function publicProfile(profile: Record<string, any>, bio: string | null) {
  return {
    display_name: profile.display_name,
    username: profile.username,
    bio,
    avatar_url: profile.avatar_url,
    is_public: profile.is_public,
    visibility: profile.visibility,
    follow_policy: profile.follow_policy,
    created_at: profile.created_at,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  // Fase 6 (P3-08): endpoint público e caro — limite por IP (lib/rate-limit.ts).
  const limited = limitPublicRequest(_request, "publicProfile");
  if (limited) return limited;

  const { username } = await context.params;
  const sql = getDb();

  const profileRows = await sql`
    SELECT
      id, display_name, username, bio, avatar_url, is_public, visibility,
      follow_policy, followers_visibility, following_visibility,
      activity_visibility, diary_visibility, lists_visibility,
      likes_visibility, created_at
    FROM public.profiles
    WHERE lower(username) = lower(${username})
    LIMIT 1
  `;

  if (profileRows.length === 0) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }
  const profile = profileRows[0];

  const session = await auth.getSession().catch(() => null);
  const viewerId: string | null = session?.data?.user?.id ?? null;
  const isOwner = viewerId === profile.id;

  const [viewerFollowRows, viewerProfileRows] = await Promise.all([
    viewerId && !isOwner
      ? sql`
          SELECT status
          FROM public.follows
          WHERE follower_id = ${viewerId} AND following_id = ${profile.id}
          LIMIT 1
        `
      : Promise.resolve([]),
    viewerId ? sql`SELECT username FROM public.profiles WHERE id = ${viewerId} LIMIT 1` : Promise.resolve([]),
  ]);
  const viewerFollowStatus: string | null = (viewerFollowRows[0] as { status?: string } | undefined)?.status || null;
  const viewerUsername: string | null = (viewerProfileRows[0] as { username?: string } | undefined)?.username || null;
  const relation = { isOwner, isAcceptedFollower: viewerFollowStatus === "accepted" };
  const canView = canViewProfile(profile, relation);

  const followersCountPromise = sql`SELECT count(*)::int as count FROM public.follows WHERE following_id = ${profile.id} AND status = 'accepted'`;
  const followingCountPromise = sql`SELECT count(*)::int as count FROM public.follows WHERE follower_id = ${profile.id} AND status = 'accepted'`;

  if (!canView) {
    const [followersCountRes, followingCountRes] = await Promise.all([followersCountPromise, followingCountPromise]);

    return NextResponse.json(
      {
        // I1: bio é texto livre do usuário — perfil bloqueado não a expõe.
        profile: publicProfile(profile, null),
        locked: true,
        favorites: [],
        activity: [],
        reviews: [],
        recent_reviews: [],
        liked_titles: [],
        lists: [],
        diary: [],
        social: {
          followers_count: Number(followersCountRes[0]?.count || 0),
          following_count: Number(followingCountRes[0]?.count || 0),
          relationship: viewerFollowStatus || "none",
          can_follow: profile.follow_policy !== "nobody",
          viewer_username: viewerUsername,
          followers: null,
          following: null,
          viewer_following_usernames: [],
        },
      },
      { headers: NO_STORE }
    );
  }

  const visible = (setting: unknown) => canViewSection(profile, setting, relation);
  const activityVisible = visible(profile.activity_visibility);
  const diaryVisible = visible(profile.diary_visibility);
  const listsVisible = visible(profile.lists_visibility);
  const likesVisible = visible(profile.likes_visibility);
  const followersVisible = visible(profile.followers_visibility);
  const followingVisible = visible(profile.following_visibility);
  const none = Promise.resolve([] as Record<string, any>[]);

  /*
   * H1 — agregado SQL para `stats` e listas já filtradas/limitadas no banco
   * (nunca a library_items inteira). Cada seção só é consultada se for
   * visível para quem pede.
   */
  const [
    favorites,
    statsRows,
    reviewsRows,
    recentReviewsRows,
    likedTitlesRows,
    followers,
    following,
    lists,
    diary,
    viewerFollowingRows,
    followersCountRes,
    followingCountRes,
  ] = await Promise.all([
    sql`
      SELECT
        pf.media_type,
        pf.position,
        (to_jsonb(m.*) - 'raw') as media
      FROM public.profile_favorites pf
      JOIN public.media m ON m.id = pf.media_id
      WHERE pf.user_id = ${profile.id}
      ORDER BY pf.position ASC
    `,
    sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE li.status IN ('watched', 'rewatching', 'rewatched'))::int AS watched,
        count(*) FILTER (WHERE m.media_type = 'movie')::int AS movies,
        count(*) FILTER (WHERE m.media_type = 'tv')::int AS series
      FROM public.library_items li
      LEFT JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${profile.id}
    `,
    activityVisible
      ? sql`
          SELECT
            li.id, li.personal_rating, li.review, li.watched_at, li.added_at, li.updated_at,
            json_build_object(
              'tmdb_id', m.tmdb_id,
              'media_type', m.media_type,
              'title', m.title,
              'poster_path', m.poster_path
            ) as media
          FROM public.library_items li
          LEFT JOIN public.media m ON m.id = li.media_id
          WHERE li.user_id = ${profile.id} AND li.review IS NOT NULL AND trim(li.review) <> ''
          ORDER BY coalesce(li.updated_at, li.watched_at, li.added_at) DESC
          LIMIT 200
        `
      : none,
    activityVisible
      ? sql`
          SELECT
            li.id, li.personal_rating, li.review, li.watched_at, li.added_at, li.updated_at,
            json_build_object(
              'tmdb_id', m.tmdb_id,
              'media_type', m.media_type,
              'title', m.title,
              'poster_path', m.poster_path
            ) as media
          FROM public.library_items li
          LEFT JOIN public.media m ON m.id = li.media_id
          WHERE li.user_id = ${profile.id}
            AND ((li.review IS NOT NULL AND trim(li.review) <> '') OR li.personal_rating IS NOT NULL)
          ORDER BY coalesce(li.updated_at, li.watched_at, li.added_at) DESC
          LIMIT 8
        `
      : none,
    likesVisible
      ? sql`
          SELECT
            li.id, li.status, li.personal_rating, li.review, li.favorite,
            li.watched_at, li.added_at, li.updated_at,
            json_build_object(
              'tmdb_id', m.tmdb_id,
              'media_type', m.media_type,
              'title', m.title,
              'poster_path', m.poster_path
            ) as media
          FROM public.library_items li
          LEFT JOIN public.media m ON m.id = li.media_id
          WHERE li.user_id = ${profile.id} AND li.favorite = true
          ORDER BY li.updated_at DESC
          LIMIT 20
        `
      : none,
    followersVisible
      ? sql`
          SELECT
            json_build_object(
              'username', p.username,
              'display_name', p.display_name,
              'avatar_url', p.avatar_url
            ) as profile
          FROM public.follows f
          JOIN public.profiles p ON p.id = f.follower_id
          WHERE f.following_id = ${profile.id} AND f.status = 'accepted'
          ORDER BY f.created_at DESC
          LIMIT 200
        `
      : none,
    followingVisible
      ? sql`
          SELECT
            json_build_object(
              'username', p.username,
              'display_name', p.display_name,
              'avatar_url', p.avatar_url
            ) as profile
          FROM public.follows f
          JOIN public.profiles p ON p.id = f.following_id
          WHERE f.follower_id = ${profile.id} AND f.status = 'accepted'
          ORDER BY f.created_at DESC
          LIMIT 200
        `
      : none,
    listsVisible
      ? sql`
          SELECT
            cl.id,
            cl.name,
            NULLIF(NULLIF(btrim(cl.description), ''), 'null') AS description,
            cl.is_public,
            cl.created_at,
            json_build_array(json_build_object('count', (
              SELECT count(*)::int FROM public.custom_list_items cli WHERE cli.list_id = cl.id
            ))) as items,
            COALESCE((
              SELECT json_agg(c.poster_path ORDER BY c.rn)
              FROM (
                SELECT m.poster_path, row_number() OVER (ORDER BY i.position, i.added_at, i.media_id) AS rn
                FROM public.custom_list_items i
                JOIN public.media m ON m.id = i.media_id
                WHERE i.list_id = cl.id AND m.poster_path IS NOT NULL
                ORDER BY i.position, i.added_at, i.media_id
                LIMIT 4
              ) c
            ), '[]'::json) AS covers
          FROM public.custom_lists cl
          -- V2.7: visitante só vê listas PÚBLICAS; lista privada nunca vira pública pelo perfil.
          WHERE cl.user_id = ${profile.id} AND (cl.is_public OR ${isOwner})
          ORDER BY cl.updated_at DESC, cl.id
          LIMIT 20
        `
      : none,
    diaryVisible
      ? sql`
          SELECT
            we.id,
            we.watched_at,
            we.rating,
            we.comment,
            we.is_rewatch,
            json_build_object(
              'media', json_build_object(
                'tmdb_id', m.tmdb_id,
                'media_type', m.media_type,
                'title', m.title,
                'poster_path', m.poster_path
              )
            ) as library
          FROM public.watch_entries we
          LEFT JOIN public.library_items li ON li.id = we.library_item_id
          -- V2.5: a visualização guarda o próprio media_id (sobrevive à remoção do item).
          LEFT JOIN public.media m ON m.id = COALESCE(we.media_id, li.media_id)
          WHERE we.user_id = ${profile.id}
          ORDER BY we.watched_at DESC
          LIMIT 12
        `
      : none,
    viewerId
      ? sql`
          SELECT p.username
          FROM public.follows f
          JOIN public.profiles p ON p.id = f.following_id
          WHERE f.follower_id = ${viewerId} AND f.status = 'accepted' AND p.username IS NOT NULL
        `
      : none,
    followersCountPromise,
    followingCountPromise,
  ]);

  const statsRow = (statsRows[0] as { total: number; watched: number; movies: number; series: number } | undefined) || {
    total: 0,
    watched: 0,
    movies: 0,
    series: 0,
  };

  return NextResponse.json(
    {
      profile: publicProfile(profile, profile.bio ?? null),
      favorites: favorites || [],
      stats: {
        total: Number(statsRow.total || 0),
        watched: Number(statsRow.watched || 0),
        movies: Number(statsRow.movies || 0),
        series: Number(statsRow.series || 0),
      },
      reviews: reviewsRows || [],
      recent_reviews: recentReviewsRows || [],
      liked_titles: likedTitlesRows || [],
      lists: lists || [],
      diary: diary || [],
      section_visibility: {
        activity: activityVisible,
        diary: diaryVisible,
        lists: listsVisible,
        likes: likesVisible,
      },
      social: {
        followers_count: Number(followersCountRes[0]?.count || 0),
        following_count: Number(followingCountRes[0]?.count || 0),
        relationship: isOwner ? "self" : viewerFollowStatus || "none",
        can_follow: !isOwner && profile.follow_policy !== "nobody",
        viewer_username: viewerUsername,
        followers: followersVisible ? followers || [] : null,
        following: followingVisible ? following || [] : null,
        viewer_following_usernames: (viewerFollowingRows || []).map((row: Record<string, any>) => row.username),
      },
    },
    { headers: NO_STORE }
  );
}
