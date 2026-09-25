import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const body = await request.json().catch(() => ({}));
    const tagId = String(body.tag_id || "").trim();
    if (!tagId) {
      return entradaInvalida("tag_id é obrigatório.");
    }

    const sql = getDb();

    // Valida ownership da tag: a tag DEVE pertencer ao user.id autenticado
    const tagCheck = await sql`
      SELECT id FROM public.tags WHERE id = ${tagId} AND user_id = ${user.id}
      UNION
      SELECT id FROM public.personal_tags WHERE id = ${tagId} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (tagCheck.length === 0) {
      return NextResponse.json(
        { error: "Tag não encontrada ou não pertence a este usuário." },
        { status: 404 }
      );
    }

    if (body.movie_id) {
      await sql`
        INSERT INTO public.movie_tags (movie_id, tag_id, user_id, created_at)
        VALUES (${String(body.movie_id)}, ${tagId}, ${user.id}, now())
        ON CONFLICT (movie_id, tag_id, user_id) DO NOTHING
      `;
    }

    if (body.library_item_id) {
      const libCheck = await sql`
        SELECT id FROM public.library_items WHERE id = ${body.library_item_id} AND user_id = ${user.id} LIMIT 1
      `;
      if (libCheck.length === 0) {
        return NextResponse.json({ error: "Item da biblioteca não encontrado." }, { status: 404 });
      }

      await sql`
        INSERT INTO public.library_tags (library_item_id, tag_id)
        VALUES (${body.library_item_id}, ${tagId})
        ON CONFLICT (library_item_id, tag_id) DO NOTHING
      `;
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "POST /api/tags/assign");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    let tagId = request.nextUrl.searchParams.get("tag_id");
    let movieId = request.nextUrl.searchParams.get("movie_id");
    let libraryItemId = request.nextUrl.searchParams.get("library_item_id");

    if (!tagId) {
      const body = await request.json().catch(() => ({}));
      tagId = body?.tag_id ? String(body.tag_id) : null;
      movieId = body?.movie_id ? String(body.movie_id) : movieId;
      libraryItemId = body?.library_item_id ? String(body.library_item_id) : libraryItemId;
    }

    if (!tagId) {
      return entradaInvalida("tag_id é obrigatório.");
    }

    const sql = getDb();

    // Valida ownership da tag
    const tagCheck = await sql`
      SELECT id FROM public.tags WHERE id = ${tagId} AND user_id = ${user.id}
      UNION
      SELECT id FROM public.personal_tags WHERE id = ${tagId} AND user_id = ${user.id}
      LIMIT 1
    `;

    if (tagCheck.length === 0) {
      return NextResponse.json(
        { error: "Tag não encontrada ou não pertence a este usuário." },
        { status: 404 }
      );
    }

    if (movieId) {
      await sql`
        DELETE FROM public.movie_tags
        WHERE movie_id = ${movieId} AND tag_id = ${tagId} AND user_id = ${user.id}
      `;
    }

    if (libraryItemId) {
      await sql`
        DELETE FROM public.library_tags
        WHERE library_item_id = ${libraryItemId} AND tag_id = ${tagId}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/tags/assign");
  }
}
