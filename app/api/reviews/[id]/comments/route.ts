import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { isUuid } from "@/lib/lists/validate";
import { notifyReviewComment } from "@/lib/notifications/reviews";
import { normalizeCommentBody, reviewAccess } from "@/lib/reviews/access";
import { COMMENTS_PAGE, loadReview, toComment } from "@/lib/reviews/load";
import { actorName, PRIVATE, rateLimited, reviewNotFound, viewerOf } from "@/lib/reviews/route-helpers";

/*
 * GET lista os comentários (mais antigos primeiro, 20 por página, cursor = id do último).
 * POST comenta (1–500 caracteres, sem edição). Só quem pode ver a avaliação.
 */
/** Cursor = id do último comentário visto (a posição sai da própria linha, sem perder microssegundos). */
function parseCursor(raw: string | null): string | null {
  return raw && isUuid(raw) ? raw : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await viewerOf();
    const sql = getDb();
    const loaded = await loadReview(sql, id, viewer.id);
    if (!loaded) return reviewNotFound();
    if (!reviewAccess(loaded.row, { id: viewer.id, followsOwner: loaded.followsOwner }).visible) return reviewNotFound();

    const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));
    const rows = await sql`
      SELECT c.id, c.user_id, c.body, c.created_at, p.username, p.display_name, p.avatar_url
      FROM public.review_comments c
      LEFT JOIN public.profiles p ON p.id = c.user_id
      WHERE c.library_item_id = ${loaded.id}::uuid
        AND (${cursor}::uuid IS NULL
             OR (c.created_at, c.id) > (
               SELECT a.created_at, a.id FROM public.review_comments a
               WHERE a.id = ${cursor}::uuid AND a.library_item_id = ${loaded.id}::uuid
             ))
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT ${COMMENTS_PAGE + 1}
    `;
    const page = rows.slice(0, COMMENTS_PAGE).map((r) => toComment(r, loaded.row.owner_id, viewer.id));
    const last = page.at(-1);
    const next_cursor = rows.length > COMMENTS_PAGE && last ? last.id : null;

    return NextResponse.json({ items: page, next_cursor }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "GET /api/reviews/[id]/comments");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await viewerOf();
    if (viewer.unavailable) return sessionUnavailableResponse();
    if (!viewer.id) return naoAutenticado();

    const body = normalizeCommentBody((await request.json().catch(() => ({})))?.body);
    if (!body) return entradaInvalida("Escreva um comentário de 1 a 500 caracteres.");

    const limited = rateLimited(`reviewComment:${viewer.id}`, 10, 60_000);
    if (limited) return limited;

    const sql = getDb();
    const loaded = await loadReview(sql, id, viewer.id);
    if (!loaded) return reviewNotFound();
    if (!reviewAccess(loaded.row, { id: viewer.id, followsOwner: loaded.followsOwner }).canComment) return reviewNotFound();

    const rows = await sql`
      WITH inserted AS (
        INSERT INTO public.review_comments (library_item_id, user_id, body)
        VALUES (${loaded.id}::uuid, ${viewer.id}::uuid, ${body})
        RETURNING id, user_id, body, created_at
      )
      SELECT i.*, p.username, p.display_name, p.avatar_url
      FROM inserted i LEFT JOIN public.profiles p ON p.id = i.user_id
    `;
    const comment = toComment(rows[0], loaded.row.owner_id, viewer.id);

    await notifyReviewComment(sql, {
      commentId: comment.id,
      reviewId: loaded.id,
      ownerId: loaded.row.owner_id,
      actorId: viewer.id,
      actorName: await actorName(sql, viewer.id),
      titleName: loaded.media.title,
    }).catch((error) => console.error("Aviso de comentário falhou:", error));

    return NextResponse.json(comment, { status: 201, headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "POST /api/reviews/[id]/comments");
  }
}
