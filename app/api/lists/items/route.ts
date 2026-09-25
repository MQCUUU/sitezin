import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function GET(request: NextRequest) {
  try {
    const listId = request.nextUrl.searchParams.get("list_id");
    if (!listId) {
      return entradaInvalida("list_id é obrigatório.");
    }

    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    const sql = getDb();

    // Checa existência da lista
    const listRows = await sql`
      SELECT id, user_id FROM public.custom_lists WHERE id = ${listId}
      UNION ALL
      SELECT id, user_id FROM public.lists WHERE id = ${listId}
      LIMIT 1
    `;

    if (listRows.length === 0) {
      return NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
    }

    const list = listRows[0];
    const stdRow = await sql`SELECT is_public FROM public.lists WHERE id = ${listId} LIMIT 1`;
    const isPublic = stdRow[0]?.is_public === true;
    const isOwner = user?.id === list.user_id;

    if (!isPublic && !isOwner) {
      return NextResponse.json({ error: "Lista privada." }, { status: 403 });
    }

    const customItems = await sql`
      SELECT
        cli.list_id,
        cli.library_item_id,
        cli.position,
        json_build_object(
          'id', li.id,
          'status', li.status,
          'personal_rating', li.personal_rating,
          'media', json_build_object(
            'id', m.id,
            'tmdb_id', m.tmdb_id,
            'media_type', m.media_type,
            'title', m.title,
            'poster_path', m.poster_path
          )
        ) as library_item
      FROM public.custom_list_items cli
      JOIN public.library_items li ON li.id = cli.library_item_id
      LEFT JOIN public.media m ON m.id = li.media_id
      WHERE cli.list_id = ${listId}
      ORDER BY cli.position ASC
    `;

    const standardItems = await sql`
      SELECT id, list_id, movie_id, user_id, added_at
      FROM public.list_items
      WHERE list_id = ${listId}
      ORDER BY added_at ASC
    `;

    return NextResponse.json({
      items: customItems || [],
      standard_items: standardItems || [],
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/lists/items");
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
    const listId = String(body.list_id || "").trim();
    if (!listId) {
      return entradaInvalida("list_id é obrigatório.");
    }

    const sql = getDb();

    // Valida ownership da lista: o usuário DEVE ser o dono da lista
    const ownCheck = await sql`
      SELECT id FROM public.custom_lists WHERE id = ${listId} AND user_id = ${user.id}
      UNION
      SELECT id FROM public.lists WHERE id = ${listId} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (ownCheck.length === 0) {
      return NextResponse.json(
        { error: "Lista não encontrada ou sem permissão." },
        { status: 404 }
      );
    }

    if (body.library_item_id) {
      const libCheck = await sql`
        SELECT id FROM public.library_items WHERE id = ${body.library_item_id} AND user_id = ${user.id} LIMIT 1
      `;
      if (libCheck.length === 0) {
        return NextResponse.json({ error: "Item da biblioteca não encontrado." }, { status: 404 });
      }

      const countRes = await sql`
        SELECT count(*)::int as count FROM public.custom_list_items WHERE list_id = ${listId}
      `;
      const pos = Number(body.position ?? countRes[0]?.count ?? 0);

      await sql`
        INSERT INTO public.custom_list_items (list_id, library_item_id, position)
        VALUES (${listId}, ${body.library_item_id}, ${pos})
        ON CONFLICT (list_id, library_item_id)
        DO UPDATE SET position = EXCLUDED.position
      `;
    }

    if (body.movie_id) {
      await sql`
        INSERT INTO public.list_items (list_id, movie_id, user_id, added_at)
        VALUES (${listId}, ${String(body.movie_id)}, ${user.id}, now())
        ON CONFLICT (list_id, movie_id, user_id) DO NOTHING
      `;
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "POST /api/lists/items");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    let listId = request.nextUrl.searchParams.get("list_id");
    let libraryItemId = request.nextUrl.searchParams.get("library_item_id");
    let movieId = request.nextUrl.searchParams.get("movie_id");

    if (!listId) {
      const body = await request.json().catch(() => ({}));
      listId = body?.list_id ? String(body.list_id) : null;
      libraryItemId = body?.library_item_id ? String(body.library_item_id) : libraryItemId;
      movieId = body?.movie_id ? String(body.movie_id) : movieId;
    }

    if (!listId) {
      return entradaInvalida("list_id é obrigatório.");
    }

    const sql = getDb();

    // Valida ownership da lista: o usuário DEVE ser o dono
    const ownCheck = await sql`
      SELECT id FROM public.custom_lists WHERE id = ${listId} AND user_id = ${user.id}
      UNION
      SELECT id FROM public.lists WHERE id = ${listId} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (ownCheck.length === 0) {
      return NextResponse.json(
        { error: "Lista não encontrada ou sem permissão." },
        { status: 404 }
      );
    }

    if (libraryItemId) {
      await sql`
        DELETE FROM public.custom_list_items
        WHERE list_id = ${listId} AND library_item_id = ${libraryItemId}
      `;
    }

    if (movieId) {
      await sql`
        DELETE FROM public.list_items
        WHERE list_id = ${listId} AND movie_id = ${movieId} AND user_id = ${user.id}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/lists/items");
  }
}
