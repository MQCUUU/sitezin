import { getRouteSession, sessionUnavailableResponse } from "@/lib/auth/route-session";
import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { getDb } from "@/lib/db/neon";
import { isUuid } from "@/lib/lists/validate";
import { listWatchlist, moveWatchlistItem } from "@/lib/watchlist";

/*
 * Watchlist automática (lib/watchlist.ts) — sempre do usuário da sessão.
 *
 * GET   ?limit=&offset=          a fila "Quero assistir" em ordem de prioridade
 * PATCH { library_id, to }       move o item para a posição `to` (0 = topo)
 */

const PRIVATE = { "Cache-Control": "private, no-store" };

async function sessionUser() {
  const session = await getRouteSession();
  if (session.unavailable) return undefined;
  return session.data?.user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await sessionUser();
    if (userId === undefined) return sessionUnavailableResponse();
    if (!userId) return naoAutenticado();

    const params = request.nextUrl.searchParams;
    const data = await listWatchlist(getDb(), userId, {
      limit: Number(params.get("limit") || 50),
      offset: Number(params.get("offset") || 0),
    });

    return NextResponse.json(data, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "GET /api/watchlist");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await sessionUser();
    if (userId === undefined) return sessionUnavailableResponse();
    if (!userId) return naoAutenticado();

    const body = await request.json().catch(() => null);
    const libraryId = body?.library_id;
    const to = Number(body?.to);

    if (!isUuid(libraryId)) return entradaInvalida("Item inválido.");
    if (!Number.isInteger(to) || to < 0) return entradaInvalida("Posição inválida.");

    const position = await moveWatchlistItem(getDb(), userId, String(libraryId), to);

    if (position === null) {
      return NextResponse.json({ error: "Este título não está mais na sua watchlist." }, { status: 404, headers: PRIVATE });
    }

    return NextResponse.json({ ok: true, position }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "PATCH /api/watchlist");
  }
}
