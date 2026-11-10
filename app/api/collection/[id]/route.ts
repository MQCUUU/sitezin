import { NextRequest, NextResponse } from "next/server";

import { respostaDeErro, entradaInvalida } from "@/lib/api-error";
import { CollectionError, getCollectionDetails, parseCollectionId } from "@/lib/collection/details";

/*
 * A lógica (concorrência limitada, teto de 40 filmes, ordenação, estatísticas)
 * mora em lib/collection/details.ts — a página de coleção usa a mesma função
 * no servidor. Formato da resposta inalterado: { collection, stats, parts }.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collectionId = parseCollectionId(id);

  if (!collectionId) return entradaInvalida("ID de coleção inválido");

  try {
    const data = await getCollectionDetails(collectionId);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" },
    });
  } catch (erro) {
    if (erro instanceof CollectionError) {
      return NextResponse.json({ error: erro.message }, { status: erro.status });
    }
    return respostaDeErro(erro, "GET /api/collection");
  }
}
