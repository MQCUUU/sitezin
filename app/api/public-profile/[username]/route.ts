import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
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
  const viewer: { id: string } | null = session?.data?.user?.id ? { id: session.data.user.id } : null;
  const isOwner = viewer?.id === profile.id;

  let canView = profile.visibility === "public" || profile.is_public === true || isOwner;

  let viewerFollowStatus: string | null = null;
  if (viewer && !isOwner) {
    const vfRows = await sql`
      SELECT status
      FROM public.follows
      WHERE follower_id = ${viewer.id} AND following_id = ${profile.id}
      LIMIT 1
    `;
    viewerFollowStatus = vfRows[0]?.status || null;
  }

  const isFollower = viewerFollowStatus === "accepted";
  if (!canView) {
    canView = isFollower;
  }

  const sectionVisible = (setting: string) => isOwner || setting === "profile" || (setting === "followers" && isFollower);
  const activityVisible = sectionVisible(profile.activity_visibility);
  const diaryVisible = sectionVisible(profile.diary_visibility);
  const listsVisible = sectionVisible(profile.lists_visibility);
  const likesVisible = sectionVisible(profile.likes_visibility);

  if (!canView) {
    const [followersCountRes, followingCountRes] = await Promise.all([
      sql`SELECT count(*)::int as count FROM public.follows WHERE following_id = ${profile.id} AND status = 'accepted'`,
      sql`SELECT count(*)::int as count FROM public.follows WHERE follower_id = ${profile.id} AND status = 'accepted'`,
    ]);
    const followersCount = Number(followersCountRes[0]?.count || 0);
    const followingCount = Number(followingCountRes[0]?.count || 0);

    return NextResponse.json(
      {
        // I1 — achado durante a auditoria de metadata (§30): esta rota
        // devolvia `profile` cru, incluindo `bio` (texto livre do
        // usuário), mesmo com `canView=false`. As demais seções já eram
        // corretamente ocultadas (arrays vazios); a bio escapava disso
        // por ser um campo do objeto `profile`, não uma seção separada.
        profile: { ...profile, bio: null },
        locked: true,
        favorites: [],
        activity: [],
        reviews: [],
        recent_reviews: [],
        liked_titles: [],
        lists: [],
        diary: [],
        social: {
          followers_count: followersCount,
          following_count: followingCount,
          relationship: viewerFollowStatus || "none",
          can_follow: !isOwner && profile.follow_policy !== "nobody",
          followers: null,
          following: null,
          viewer_following_ids: [],
        },
      },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }
    );
  }

  /*
   * H1 — antes esta rota buscava `library_items` INTEIRA (sem LIMIT) e
   * derivava `stats`/`reviews`/`recent_reviews`/`liked_titles` em JS
   * sobre esse array completo (H0, HIGH — pior que o full-fetch da
   * Library antes da D1, porque este aqui é exposto a QUALQUER
   * visitante de um perfil público, não só ao dono). Substituído por
   * quatro queries específicas: um agregado SQL para `stats`, e três
   * listas já filtradas/ordenadas/limitadas no banco. As duas seções
   * gated por privacidade (`reviews`/`recent_reviews` por
   * `activityVisible`, `liked_titles` por `likesVisible`) só disparam a
   * query quando a seção é visível para quem está pedindo — mesmo
   * padrão já usado abaixo para `viewerFollowingRows`.
   *
   * `reviews` (aba "Todas as reviews") preservava a lista completa,
   * sem limite, no comportamento antigo — aqui ganhou um teto de 200,
   * generoso o bastante para nunca ser atingido por um usuário real
   * (nenhuma mudança de produto pretendida, só um limite de segurança
   * que a versão anterior nunca teve).
   */
  const statsPromise = sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE li.status IN ('watched', 'rewatching', 'rewatched'))::int AS watched,
      count(*) FILTER (WHERE m.media_type = 'movie')::int AS movies,
      count(*) FILTER (WHERE m.media_type = 'tv')::int AS series
    FROM public.library_items li
    LEFT JOIN public.media m ON m.id = li.media_id
    WHERE li.user_id = ${profile.id}
  `;

  const reviewsPromise = activityVisible
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
    : Promise.resolve([]);

  const recentReviewsPromise = activityVisible
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
    : Promise.resolve([]);

  const likedTitlesPromise = likesVisible
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
    : Promise.resolve([]);

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
        row_to_json(m.*) as media
      FROM public.profile_favorites pf
      JOIN public.media m ON m.id = pf.media_id
      WHERE pf.user_id = ${profile.id}
      ORDER BY pf.position ASC
    `,
    statsPromise,
    reviewsPromise,
    recentReviewsPromise,
    likedTitlesPromise,
    sql`
      SELECT
        f.follower_id,
        json_build_object(
          'id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url
        ) as profile
      FROM public.follows f
      JOIN public.profiles p ON p.id = f.follower_id
      WHERE f.following_id = ${profile.id} AND f.status = 'accepted'
      ORDER BY f.created_at DESC
      LIMIT 200
    `,
    sql`
      SELECT
        f.following_id,
        json_build_object(
          'id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url
        ) as profile
      FROM public.follows f
      JOIN public.profiles p ON p.id = f.following_id
      WHERE f.follower_id = ${profile.id} AND f.status = 'accepted'
      ORDER BY f.created_at DESC
      LIMIT 200
    `,
    sql`
      SELECT
        cl.id,
        cl.name,
        cl.description,
        cl.created_at,
        json_build_array(json_build_object('count', (
          SELECT count(*)::int FROM public.custom_list_items cli WHERE cli.list_id = cl.id
        ))) as items
      FROM public.custom_lists cl
      WHERE cl.user_id = ${profile.id}
      ORDER BY cl.created_at DESC
      LIMIT 20
    `,
    sql`
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
      LEFT JOIN public.media m ON m.id = li.media_id
      WHERE we.user_id = ${profile.id}
      ORDER BY we.watched_at DESC
      LIMIT 12
    `,
    viewer?.id
      ? sql`SELECT following_id FROM public.follows WHERE follower_id = ${viewer.id} AND status = 'accepted'`
      : Promise.resolve([]),
    sql`SELECT count(*)::int as count FROM public.follows WHERE following_id = ${profile.id} AND status = 'accepted'`,
    sql`SELECT count(*)::int as count FROM public.follows WHERE follower_id = ${profile.id} AND status = 'accepted'`,
  ]);

  const statsRow = (statsRows[0] as { total: number; watched: number; movies: number; series: number } | undefined) || {
    total: 0,
    watched: 0,
    movies: 0,
    series: 0,
  };
  const stats = {
    total: Number(statsRow.total || 0),
    watched: Number(statsRow.watched || 0),
    movies: Number(statsRow.movies || 0),
    series: Number(statsRow.series || 0),
  };

  const followersCount = Number(followersCountRes[0]?.count || 0);
  const followingCount = Number(followingCountRes[0]?.count || 0);
  const viewerFollowing = (viewerFollowingRows || []).map((row: any) => row.following_id);

  const reviews = reviewsRows || [];
  const recentReviews = recentReviewsRows || [];

  return NextResponse.json(
    {
      profile,
      favorites: favorites || [],
      stats,
      reviews,
      recent_reviews: recentReviews,
      liked_titles: likedTitlesRows || [],
      lists: listsVisible ? lists || [] : [],
      diary: diaryVisible ? diary || [] : [],
      section_visibility: {
        activity: activityVisible,
        diary: diaryVisible,
        lists: listsVisible,
        likes: likesVisible,
      },
      social: {
        followers_count: followersCount,
        following_count: followingCount,
        relationship: isOwner ? "self" : viewerFollowStatus || "none",
        can_follow: !isOwner && profile.follow_policy !== "nobody",
        followers: sectionVisible(profile.followers_visibility) ? followers || [] : null,
        following: sectionVisible(profile.following_visibility) ? following || [] : null,
        viewer_following_ids: viewerFollowing,
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Vary": "Cookie",
      },
    }
  );
}
