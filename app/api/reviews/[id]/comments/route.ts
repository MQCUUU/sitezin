import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { isUuid } from "@/lib/lists/validate";
import { notifyCommentReply, notifyReviewComment } from "@/lib/notifications/reviews";
import { normalizeCommentBody, replyTarget, reviewAccess } from "@/lib/reviews/access";
import { COMMENTS_PAGE, loadReview, toComment } from "@/lib/reviews/load";
import { actorName, PRIVATE, rateLimited, reviewNotFound, viewerOf } from "@/lib/reviews/route-helpers";

/*
 * GET lista os comentários de cima (mais antigos primeiro, 20 por página, cursor =
 * id do último), cada um com as respostas dele em `replies` (um nível só).
 * POST comenta (1–500 caracteres, sem edição); com `reply_to` (id de um comentário
 * da mesma avaliação) vira resposta. Só quem pode ver a avaliação.
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
      SELECT c.id, c.user_id, c.body, c.created_at, c.parent_id, c.deleted_at,
        p.username, p.display_name, p.avatar_url,
        (SELECT count(*)::int FROM public.review_comment_likes l WHERE l.comment_id = c.id) AS like_count,
        EXISTS (SELECT 1 FROM public.review_comment_likes l WHERE l.comment_id = c.id AND l.user_id = ${viewer.id}::uuid) AS liked_by_viewer
      FROM public.review_comments c
      LEFT JOIN public.profiles p ON p.id = c.user_id
      WHERE c.library_item_id = ${loaded.id}::uuid
        AND c.parent_id IS NULL
        AND (${cursor}::uuid IS NULL
             OR (c.created_at, c.id) > (
               SELECT a.created_at, a.id FROM public.review_comments a
               WHERE a.id = ${cursor}::uuid AND a.library_item_id = ${loaded.id}::uuid
             ))
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT ${COMMENTS_PAGE + 1}
    `;
    const page = rows.slice(0, COMMENTS_PAGE).map((r) => toComment(r, loaded.row.owner_id, viewer.id));
    const parentIds = page.map((c) => c.id);
    const replyRows = parentIds.length
      ? await sql`
          SELECT c.id, c.user_id, c.body, c.created_at, c.parent_id, c.deleted_at,
            p.username, p.display_name, p.avatar_url,
            rp.username AS reply_username, rp.display_name AS reply_display_name,
            (SELECT count(*)::int FROM public.review_comment_likes l WHERE l.comment_id = c.id) AS like_count,
            EXISTS (SELECT 1 FROM public.review_comment_likes l WHERE l.comment_id = c.id AND l.user_id = ${viewer.id}::uuid) AS liked_by_viewer
          FROM public.review_comments c
          LEFT JOIN public.profiles p ON p.id = c.user_id
          LEFT JOIN public.profiles rp ON rp.id = c.reply_to_user_id
          WHERE c.library_item_id = ${loaded.id}::uuid AND c.parent_id = ANY(${parentIds}::uuid[])
          ORDER BY c.created_at ASC, c.id ASC
        `
      : [];
    for (const comment of page) comment.replies = [];
    const byId = new Map(page.map((c) => [c.id, c]));
    for (const r of replyRows) byId.get(String(r.parent_id))?.replies?.push(toComment(r, loaded.row.owner_id, viewer.id));
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

    const input = await request.json().catch(() => ({}));
    const body = normalizeCommentBody(input?.body);
    if (!body) return entradaInvalida("Escreva um comentário de 1 a 500 caracteres.");
    const replyTo = input?.reply_to == null ? null : String(input.reply_to);
    if (replyTo !== null && !isUuid(replyTo)) return reviewNotFound();

    const limited = rateLimited(`reviewComment:${viewer.id}`, 10, 60_000);
    if (limited) return limited;

    const sql = getDb();
    const loaded = await loadReview(sql, id, viewer.id);
    if (!loaded) return reviewNotFound();
    if (!reviewAccess(loaded.row, { id: viewer.id, followsOwner: loaded.followsOwner }).canComment) return reviewNotFound();

    // Resposta: o alvo precisa ser um comentário vivo desta avaliação.
    let target: { id: string; parent_id: string | null; user_id: string } | null = null;
    if (replyTo) {
      const found = await sql`
        SELECT id, parent_id, user_id FROM public.review_comments
        WHERE id = ${replyTo}::uuid AND library_item_id = ${loaded.id}::uuid AND deleted_at IS NULL
      `;
      if (!found[0]) return reviewNotFound();
      target = { id: String(found[0].id), parent_id: found[0].parent_id ? String(found[0].parent_id) : null, user_id: String(found[0].user_id) };
    }
    const link = target ? replyTarget(target) : { parentId: null, replyToUserId: null };

    const rows = await sql`
      WITH inserted AS (
        INSERT INTO public.review_comments (library_item_id, user_id, body, parent_id, reply_to_user_id)
        VALUES (${loaded.id}::uuid, ${viewer.id}::uuid, ${body}, ${link.parentId}::uuid, ${link.replyToUserId}::uuid)
        RETURNING id, user_id, body, created_at, parent_id, reply_to_user_id, deleted_at
      )
      SELECT i.*, p.username, p.display_name, p.avatar_url,
        rp.username AS reply_username, rp.display_name AS reply_display_name,
        0 AS like_count, false AS liked_by_viewer
      FROM inserted i
      LEFT JOIN public.profiles p ON p.id = i.user_id
      LEFT JOIN public.profiles rp ON rp.id = i.reply_to_user_id
    `;
    const comment = toComment(rows[0], loaded.row.owner_id, viewer.id);
    if (!comment.parent_id) comment.replies = [];
    const name = await actorName(sql, viewer.id);

    // Quem foi respondido recebe "respondeu seu comentário"; o dono da avaliação
    // recebe o aviso de comentário de sempre (sem dobrar se for a mesma pessoa).
    if (target && target.user_id !== viewer.id) {
      await notifyCommentReply(sql, {
        commentId: comment.id,
        reviewId: loaded.id,
        recipientId: target.user_id,
        actorId: viewer.id,
        actorName: name,
        titleName: loaded.media.title,
      }).catch((error) => console.error("Aviso de resposta falhou:", error));
    }
    if (target?.user_id === loaded.row.owner_id) {
      return NextResponse.json(comment, { status: 201, headers: PRIVATE });
    }

    await notifyReviewComment(sql, {
      commentId: comment.id,
      reviewId: loaded.id,
      ownerId: loaded.row.owner_id,
      actorId: viewer.id,
      actorName: name,
      titleName: loaded.media.title,
    }).catch((error) => console.error("Aviso de comentário falhou:", error));

    return NextResponse.json(comment, { status: 201, headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "POST /api/reviews/[id]/comments");
  }
}
