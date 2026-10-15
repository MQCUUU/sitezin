import { NextRequest, NextResponse } from "next/server";

import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { ensureMedia } from "@/lib/lists/media";
import { ITEMS_PAGE, isUuid, normalizeDescription, parseIndex, parseMediaType, parsePage, parsePositiveInt } from "@/lib/lists/validate";

/*
 * Itens de uma lista — identidade = MÍDIA (media_id), independente da Biblioteca.
 *
 * GET    ?list_id=&page=&q=   dono: sempre; outros: só se pública. Privada ≡ inexistente (404).
 *                             Ordem editorial: position, added_at, media_id. 60 por página.
 *                             Visitante nunca recebe dados da Biblioteca do dono.
 * POST   { list_id, tmdb_id, media_type }   adiciona no FIM; não toca Biblioteca/histórico.
 *        (legado: { list_id, library_item_id } do diálogo antigo — resolve a mídia)
 * DELETE { list_id, media_id }      tira só desta lista.
 * PATCH  { list_id, media_id, to_index }   move para a posição (0-based), renumerando 0..n-1.
 *
 * Toda escrita: dono = usuário da sessão, numa transação que TRAVA a linha da lista
 * (FOR UPDATE) antes de ler a ordem — requisições simultâneas nunca se misturam.
 */

const PRIVATE = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ error: "Lista não encontrada." }, { status: 404, headers: PRIVATE });

async function sessionUser() {
  const session = await auth.getSession().catch(() => null);

  return session?.data?.user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams;
    const listId = search.get("list_id");

    if (!isUuid(listId)) return notFound();

    const viewer = await sessionUser();
    const sql = getDb();
    const rows = (await sql`
      SELECT cl.id, cl.user_id, cl.name, cl.description, cl.is_public, cl.created_at, cl.updated_at,
             p.username AS owner_username, p.display_name AS owner_display_name,
             (SELECT count(*)::int FROM public.custom_list_items i WHERE i.list_id = cl.id) AS item_count,
             COALESCE((
               SELECT json_agg(c.poster_path ORDER BY c.position, c.added_at, c.media_id)
               FROM (
                 SELECT m.poster_path, i.position, i.added_at, i.media_id
                 FROM public.custom_list_items i
                 JOIN public.media m ON m.id = i.media_id
                 WHERE i.list_id = cl.id AND m.poster_path IS NOT NULL
                 ORDER BY i.position, i.added_at, i.media_id
                 LIMIT 4
               ) c
             ), '[]'::json) AS covers
      FROM public.custom_lists cl
      LEFT JOIN public.profiles p ON p.id = cl.user_id
      WHERE cl.id = ${listId}
      LIMIT 1
    `) as Record<string, any>[];
    const list = rows[0];
    const isOwner = Boolean(list && viewer && viewer === list.user_id);

    // Privada para quem não é dono: mesma resposta de "não existe" (não confirma o UUID).
    if (!list || (!list.is_public && !isOwner)) return notFound();

    const page = parsePage(search.get("page"));
    const q = (search.get("q") || "").trim().slice(0, 100);
    const params: unknown[] = [listId];
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const filter = q
      ? `AND (extensions.unaccent(m.title) ILIKE extensions.unaccent(${add(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)}) OR extensions.unaccent(coalesce(m.original_title, '')) ILIKE extensions.unaccent(${add(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)}))`
      : "";
    // Estado na Biblioteca: SÓ para o dono (é dado pessoal). Visitante recebe null.
    const libraryJoin = isOwner ? `LEFT JOIN public.library_items li ON li.user_id = ${add(list.user_id)} AND li.media_id = m.id` : "";
    const libraryStatus = isOwner ? "li.status" : "NULL::text";
    const base = `
      WITH ordered AS (
        SELECT i.media_id, row_number() OVER (ORDER BY i.position, i.added_at, i.media_id) AS rank
        FROM public.custom_list_items i
        WHERE i.list_id = $1
      )
      SELECT o.rank::int, m.id AS media_id, m.tmdb_id, m.media_type, m.title, m.original_title, m.poster_path,
             m.release_date, m.first_air_date, ${libraryStatus} AS library_status
      FROM ordered o
      JOIN public.media m ON m.id = o.media_id
      ${libraryJoin}
      WHERE true ${filter}
    `;
    const countParams = [...params];
    const limitAt = add(ITEMS_PAGE);
    const offsetAt = add((page - 1) * ITEMS_PAGE);

    const [items, filtered, members] = (await Promise.all([
      sql.query(`${base} ORDER BY o.rank LIMIT ${limitAt} OFFSET ${offsetAt}`, params),
      sql.query(`SELECT count(*)::int AS total FROM (${base}) s`, countParams),
      isOwner
        ? sql`SELECT m.media_type || ':' || m.tmdb_id AS key FROM public.custom_list_items i JOIN public.media m ON m.id = i.media_id WHERE i.list_id = ${listId}`
        : Promise.resolve([]),
    ])) as [Record<string, unknown>[], { total: number }[], { key: string }[]];

    const totalFiltered = Number(filtered[0]?.total || 0);

    return NextResponse.json(
      {
        list: {
          id: list.id,
          name: list.name,
          description: normalizeDescription(list.description),
          is_public: Boolean(list.is_public),
          is_owner: isOwner,
          item_count: Number(list.item_count || 0),
          covers: list.covers || [],
          created_at: list.created_at,
          updated_at: list.updated_at,
          owner: { username: list.owner_username, display_name: list.owner_display_name },
        },
        items,
        page,
        total_filtered: totalFiltered,
        total_pages: Math.max(1, Math.ceil(totalFiltered / ITEMS_PAGE)),
        // Para o seletor "Já está nesta lista" (só o dono adiciona).
        members: isOwner ? members.map((row) => row.key) : undefined,
      },
      { headers: PRIVATE }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/lists/items");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await sessionUser();

    if (!userId) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const listId = body?.list_id;

    if (!isUuid(listId)) return notFound();

    const sql = getDb();
    const owned = (await sql`SELECT 1 FROM public.custom_lists WHERE id = ${listId} AND user_id = ${userId}`) as unknown[];

    if (!owned.length) return notFound();

    let mediaId: number | null = null;
    const tmdbId = parsePositiveInt(body.tmdb_id);
    const mediaType = parseMediaType(body.media_type);

    if (tmdbId && mediaType) {
      mediaId = await ensureMedia(sql, mediaType, tmdbId);
    } else if (isUuid(body.library_item_id)) {
      const lib = (await sql`SELECT media_id FROM public.library_items WHERE id = ${body.library_item_id} AND user_id = ${userId}`) as { media_id: number }[];

      mediaId = lib[0] ? Number(lib[0].media_id) : null;
    } else {
      return entradaInvalida("Título inválido.");
    }

    if (!mediaId) return NextResponse.json({ error: "Título não encontrado." }, { status: 404, headers: PRIVATE });

    const [, inserted] = (await sql.transaction([
      sql`SELECT id FROM public.custom_lists WHERE id = ${listId} AND user_id = ${userId} FOR UPDATE`,
      sql`
        INSERT INTO public.custom_list_items (list_id, media_id, position, added_at)
        SELECT cl.id, ${mediaId}, COALESCE((SELECT max(position) + 1 FROM public.custom_list_items WHERE list_id = cl.id), 0), now()
        FROM public.custom_lists cl
        WHERE cl.id = ${listId} AND cl.user_id = ${userId}
        ON CONFLICT (list_id, media_id) DO NOTHING
        RETURNING media_id, position
      `,
      sql`UPDATE public.custom_lists SET updated_at = now() WHERE id = ${listId} AND user_id = ${userId}`,
    ])) as [unknown[], { media_id: number; position: number }[]];

    if (!inserted.length) return NextResponse.json({ added: false, already: true, media_id: mediaId }, { headers: PRIVATE });

    return NextResponse.json({ added: true, media_id: mediaId, position: inserted[0].position }, { status: 201, headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "POST /api/lists/items");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await sessionUser();

    if (!userId) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const listId = body?.list_id ?? request.nextUrl.searchParams.get("list_id");

    if (!isUuid(listId)) return notFound();

    const sql = getDb();
    let mediaId = parsePositiveInt(body?.media_id ?? request.nextUrl.searchParams.get("media_id"));
    const tmdbId = parsePositiveInt(body?.tmdb_id);
    const mediaType = parseMediaType(body?.media_type);

    if (!mediaId && tmdbId && mediaType) {
      const m = (await sql`SELECT id FROM public.media WHERE tmdb_id = ${tmdbId} AND media_type = ${mediaType}`) as { id: number }[];

      mediaId = m[0] ? Number(m[0].id) : null;
    }

    const owned = (await sql`SELECT 1 FROM public.custom_lists WHERE id = ${listId} AND user_id = ${userId}`) as unknown[];

    if (!owned.length) return notFound();
    if (!mediaId) return entradaInvalida("Título inválido.");

    const [removed] = (await sql.transaction([
      sql`
        DELETE FROM public.custom_list_items i
        USING public.custom_lists cl
        WHERE i.list_id = cl.id AND cl.id = ${listId} AND cl.user_id = ${userId} AND i.media_id = ${mediaId}
        RETURNING i.media_id
      `,
      sql`UPDATE public.custom_lists SET updated_at = now() WHERE id = ${listId} AND user_id = ${userId}`,
    ])) as [unknown[]];

    return NextResponse.json({ removed: removed.length > 0 }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/lists/items");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await sessionUser();

    if (!userId) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const listId = body?.list_id;
    const mediaId = parsePositiveInt(body?.media_id);
    const toIndex = parseIndex(body?.to_index);

    if (!isUuid(listId)) return notFound();
    if (!mediaId || toIndex === null) return entradaInvalida("Movimento inválido.");

    const sql = getDb();
    const [locked, moved] = (await sql.transaction([
      sql`SELECT id FROM public.custom_lists WHERE id = ${listId} AND user_id = ${userId} FOR UPDATE`,
      // Ordem atual → tira o item → reinsere no destino → grava 0..n-1 (sem buracos, sem empates).
      sql`
        WITH ordered AS (
          SELECT i.media_id, row_number() OVER (ORDER BY i.position, i.added_at, i.media_id) - 1 AS idx
          FROM public.custom_list_items i
          JOIN public.custom_lists cl ON cl.id = i.list_id AND cl.user_id = ${userId}
          WHERE i.list_id = ${listId}
        ),
        target AS (SELECT GREATEST(0, LEAST(${toIndex}::int, (SELECT count(*) FROM ordered)::int - 1)) AS t),
        others AS (SELECT media_id, row_number() OVER (ORDER BY idx) - 1 AS r FROM ordered WHERE media_id <> ${mediaId}),
        placed AS (
          SELECT media_id, CASE WHEN r < (SELECT t FROM target) THEN r ELSE r + 1 END AS pos FROM others
          UNION ALL
          SELECT ${mediaId}::int, (SELECT t FROM target)
        )
        UPDATE public.custom_list_items i
        SET position = placed.pos
        FROM placed
        WHERE i.list_id = ${listId} AND i.media_id = placed.media_id
          AND EXISTS (SELECT 1 FROM ordered WHERE media_id = ${mediaId})
        RETURNING i.media_id, i.position
      `,
      sql`UPDATE public.custom_lists SET updated_at = now() WHERE id = ${listId} AND user_id = ${userId}`,
    ])) as [unknown[], { media_id: number; position: number }[]];

    if (!locked.length) return notFound();
    if (!moved.length) return NextResponse.json({ error: "Título não está nesta lista." }, { status: 404, headers: PRIVATE });

    const position = moved.find((row) => Number(row.media_id) === mediaId)?.position ?? null;

    return NextResponse.json({ moved: true, position }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "PATCH /api/lists/items");
  }
}
