import { NextResponse, type NextRequest } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { resolveCatalogMedia } from "@/lib/lists/media";
import { notifyRecommendationReceived } from "@/lib/notifications/recommendations";
import { displayName, received, sendRecommendations, sent } from "@/lib/recommendations/db";
import { MAX_RECIPIENTS, normalizeNote } from "@/lib/recommendations/rules";
import { isUuid } from "@/lib/reviews/load";
import { PRIVATE, rateLimited, viewerOf } from "@/lib/reviews/route-helpers";

/*
 * Indicações (migration 0010).
 * GET ?view=received[&tmdb_id=&type=] — o que amigos te indicaram, agrupado por título.
 * GET ?view=sent — o que você indicou, com o estado de cada amigo e o faro.
 * POST { tmdb_id, media_type, recipient_ids, note? } — indica para até 20 amigos.
 */

export async function GET(request: NextRequest) {
  try {
    const viewer = await viewerOf();
    if (viewer.unavailable) return sessionUnavailableResponse();
    if (!viewer.id) return naoAutenticado();

    const params = request.nextUrl.searchParams;
    const sql = getDb();
    if (params.get("view") === "sent") {
      return NextResponse.json(await sent(sql, viewer.id), { headers: PRIVATE });
    }

    const tmdbId = Number(params.get("tmdb_id"));
    const type = params.get("type");
    const filter =
      Number.isInteger(tmdbId) && tmdbId > 0 && (type === "movie" || type === "tv") ? { tmdbId, type: type as "movie" | "tv" } : undefined;
    return NextResponse.json({ groups: await received(sql, viewer.id, filter) }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "GET /api/recommendations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = await viewerOf();
    if (viewer.unavailable) return sessionUnavailableResponse();
    if (!viewer.id) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const tmdbId = Number(body?.tmdb_id);
    const type = body?.media_type === "tv" ? "tv" : body?.media_type === "movie" ? "movie" : null;
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !type) return entradaInvalida("Título inválido.");

    const ids: unknown = body?.recipient_ids;
    if (!Array.isArray(ids) || ids.length === 0) return entradaInvalida("Escolha pelo menos um amigo.");
    if (ids.length > MAX_RECIPIENTS) return entradaInvalida(`Indique para até ${MAX_RECIPIENTS} amigos por vez.`);
    if (!ids.every(isUuid)) return entradaInvalida("Amigo inválido.");
    if (ids.includes(viewer.id)) return entradaInvalida("Você não pode indicar para você.");

    const note = normalizeNote(body?.note);
    if (note === false) return entradaInvalida("O bilhete tem até 140 caracteres.");

    const limited = rateLimited(`recommend:${viewer.id}`, 30, 3_600_000);
    if (limited) return limited;

    const sql = getDb();
    const catalog = await resolveCatalogMedia(sql, type, tmdbId);
    if (!catalog.ok) {
      return catalog.reason === "not_found"
        ? NextResponse.json({ error: "Título não encontrado no catálogo." }, { status: 404, headers: PRIVATE })
        : NextResponse.json(
            { error: "Não foi possível confirmar o título agora. Tente de novo em instantes." },
            { status: 503, headers: PRIVATE }
          );
    }

    const result = await sendRecommendations(sql, { senderId: viewer.id, mediaId: catalog.id, recipientIds: ids as string[], note });

    if (result.sent.length) {
      // O aviso nunca derruba o envio.
      try {
        const [sender] = await sql`SELECT username, display_name FROM public.profiles WHERE id = ${viewer.id}::uuid`;
        const [title] = await sql`SELECT title FROM public.media WHERE id = ${catalog.id}`;
        const senderName = sender
          ? displayName({ username: String(sender.username ?? ""), display_name: sender.display_name ?? null })
          : "Um amigo";
        for (const item of result.sent) {
          await notifyRecommendationReceived(sql, {
            recId: item.recId,
            recipientId: item.recipientId,
            senderId: viewer.id,
            senderName,
            titleName: String(title?.title ?? "um título"),
          });
        }
      } catch (noticeError) {
        console.warn("[recommendations] aviso não enviado:", noticeError instanceof Error ? noticeError.message : String(noticeError));
      }
    }

    return NextResponse.json({ sent: result.sent.map((item) => item.recipientId), skipped: result.skipped }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "POST /api/recommendations");
  }
}
