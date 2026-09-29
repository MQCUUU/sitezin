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

    /*
     * `custom_lists` é a geração canônica (D1): é a única que o
     * consumidor real, o perfil público, já lê. `public.lists` é o
     * espelho mantido por POST/PATCH em /api/lists só para guardar
     * `is_public` — não existe esse campo em `custom_lists`.
     */
    const listRows = await sql`
      SELECT
        cl.id,
        cl.user_id,
        cl.name,
        cl.description,
        cl.created_at,
        p.username as owner_username,
        p.display_name as owner_display_name,
        COALESCE(l.is_public, false) as is_public
      FROM public.custom_lists cl
      LEFT JOIN public.lists l ON l.id = cl.id
      LEFT JOIN public.profiles p ON p.id = cl.user_id
      WHERE cl.id = ${listId}
      LIMIT 1
    `;

    if (listRows.length === 0) {
      return NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
    }

    const list = listRows[0] as {
      id: string;
      user_id: string;
      name: string;
      description: string | null;
      created_at: string;
      owner_username: string | null;
      owner_display_name: string | null;
      is_public: boolean;
    };
    const isOwner = user?.id === list.user_id;

    if (!list.is_public && !isOwner) {
      return NextResponse.json({ error: "Lista privada." }, { status: 403 });
    }

    /*
     * Mesmo formato de app/api/library/route.ts (li.* + media em
     * to_jsonb) — PosterGrid espera exatamente esse contrato para
     * renderizar pôster, badge de status, coração de favorito e o
     * menu de ações por igual, dentro ou fora do contexto de lista.
     */
    const customItems = await sql`
      SELECT
        cli.list_id,
        cli.library_item_id,
        cli.position,
        li.id,
        li.status,
        li.favorite,
        li.personal_rating,
        li.review,
        li.watched_at,
        li.rewatch_count,
        li.added_at,
        li.updated_at,
        to_jsonb(m.*) - 'raw' as media
      FROM public.custom_list_items cli
      JOIN public.library_items li ON li.id = cli.library_item_id
      JOIN public.media m ON m.id = li.media_id
      WHERE cli.list_id = ${listId}
      ORDER BY cli.position ASC
    `;

    return NextResponse.json({
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        created_at: list.created_at,
        is_public: list.is_public,
        is_owner: isOwner,
        owner: {
          username: list.owner_username,
          display_name: list.owner_display_name,
        },
      },
      items: customItems || [],
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

    const libraryItemId = String(body.library_item_id || "").trim();
    if (!libraryItemId) {
      return entradaInvalida("library_item_id é obrigatório.");
    }

    const libCheck = await sql`
      SELECT id FROM public.library_items WHERE id = ${libraryItemId} AND user_id = ${user.id} LIMIT 1
    `;
    if (libCheck.length === 0) {
      return NextResponse.json({ error: "Item da biblioteca não encontrado." }, { status: 404 });
    }

    const countRes = await sql`
      SELECT count(*)::int as count FROM public.custom_list_items WHERE list_id = ${listId}
    `;
    const pos = Number(body.position ?? countRes[0]?.count ?? 0);

    /*
     * A PRIMARY KEY (list_id, library_item_id) já impede duplicatas —
     * ON CONFLICT aqui é só para permitir reordenar sem erro, nunca
     * cria uma segunda linha para o mesmo par.
     */
    await sql`
      INSERT INTO public.custom_list_items (list_id, library_item_id, position)
      VALUES (${listId}, ${libraryItemId}, ${pos})
      ON CONFLICT (list_id, library_item_id)
      DO UPDATE SET position = EXCLUDED.position
    `;

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

    if (!listId) {
      const body = await request.json().catch(() => ({}));
      listId = body?.list_id ? String(body.list_id) : null;
      libraryItemId = body?.library_item_id ? String(body.library_item_id) : libraryItemId;
    }

    if (!listId) {
      return entradaInvalida("list_id é obrigatório.");
    }
    if (!libraryItemId) {
      return entradaInvalida("library_item_id é obrigatório.");
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

    await sql`
      DELETE FROM public.custom_list_items
      WHERE list_id = ${listId} AND library_item_id = ${libraryItemId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/lists/items");
  }
}
