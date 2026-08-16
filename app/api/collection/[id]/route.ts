import { NextRequest, NextResponse } from "next/server";
import { respostaDeErro, entradaInvalida } from "@/lib/api-error";

/*
 * ============================================================
 * SUBSTITUI app/api/collection/[id]/route.ts
 *
 * TRÊS PROBLEMAS CORRIGIDOS
 *
 * 1. N+1 DE CHAMADAS AO TMDB
 *    O código antigo buscava a coleção e depois disparava UMA
 *    requisição por filme dentro dela, em Promise.all sem
 *    limite. "O Senhor dos Anéis" = 4 chamadas. Marvel = 30+.
 *    Todas simultâneas, todas contra a sua quota do TMDB, e
 *    tudo isso numa rota SEM autenticação.
 *
 *    Agora: no máximo 6 requisições em paralelo por vez, e
 *    teto de 40 filmes por coleção. Um pouco mais lento no
 *    pior caso, muito mais previsível.
 *
 * 2. ERRO INTERNO VAZANDO
 *    `error.message` ia direto para o navegador.
 *
 * 3. LEGIBILIDADE
 *    Eram ~300 linhas para ~90 de lógica, por causa da
 *    formatação de um identificador por linha. Mesmo
 *    comportamento, escrito de forma legível.
 *
 * O QUE **NÃO** MUDOU
 *    O formato da resposta JSON é idêntico: mesmas chaves
 *    (collection, stats, parts), mesma ordenação por data de
 *    lançamento, mesmo Cache-Control. A página
 *    app/collection/[id]/page.tsx não precisa de nenhum ajuste.
 * ============================================================
 */

const TMDB_BASE = "https://api.themoviedb.org/3";

/** Teto de filmes detalhados por coleção. */
const MAX_PARTES = 40;

/** Quantas requisições ao TMDB rodam ao mesmo tempo. */
const CONCORRENCIA = 6;

/**
 * Executa `tarefa` sobre cada item, mas com no máximo `limite`
 * em voo simultaneamente. Substitui o Promise.all irrestrito.
 */
async function mapaComLimite<T, R>(
  itens: T[],
  limite: number,
  tarefa: (item: T) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;

  async function operario() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await tarefa(itens[indice]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, operario)
  );

  return resultados;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    /*
     * Falta de configuração é problema do servidor, não do
     * usuário — e a mensagem antiga entregava o nome exato da
     * variável de ambiente.
     */
    console.error(
      "[GET /api/collection] TMDB_API_KEY não configurada"
    );

    return NextResponse.json(
      { error: "Serviço indisponível no momento." },
      { status: 503 }
    );
  }

  const collectionId = Number(id);

  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    return entradaInvalida("ID de coleção inválido");
  }

  const language = process.env.TMDB_LANGUAGE || "pt-BR";

  const qs = new URLSearchParams({ api_key: apiKey, language });

  const revalidate = 21600; // 6 horas

  try {
    const resposta = await fetch(
      `${TMDB_BASE}/collection/${collectionId}?${qs}`,
      { next: { revalidate } }
    );

    const collection = await resposta.json();

    if (!resposta.ok) {
      /*
       * status_message do TMDB é seguro de repassar: é texto
       * público da API deles, não detalhe do nosso sistema.
       */
      return NextResponse.json(
        { error: collection?.status_message || "Coleção não encontrada." },
        { status: resposta.status }
      );
    }

    const rawParts: any[] = Array.isArray(collection?.parts)
      ? collection.parts.slice(0, MAX_PARTES)
      : [];

    /*
     * Busca detalhes individuais (duração, gêneros, status) com
     * concorrência limitada. Cada falha isolada cai no item
     * básico da coleção, como antes.
     */
    const detailedParts = await mapaComLimite(
      rawParts,
      CONCORRENCIA,
      async (part) => {
        try {
          const r = await fetch(
            `${TMDB_BASE}/movie/${part.id}?${qs}`,
            { next: { revalidate } }
          );

          if (!r.ok) {
            return { ...part, media_type: "movie" };
          }

          return { ...part, ...(await r.json()), media_type: "movie" };
        } catch {
          return { ...part, media_type: "movie" };
        }
      }
    );

    /* Ordem padrão: lançamento. Sem data vai para o final. */
    const parts = detailedParts.sort((a, b) =>
      String(a.release_date || "9999-12-31").localeCompare(
        String(b.release_date || "9999-12-31")
      )
    );

    const agora = Date.now();

    const released = parts.filter(
      (item) =>
        item.release_date &&
        new Date(item.release_date).getTime() <= agora
    );

    const totalRuntime = parts.reduce(
      (soma, item) => soma + (Number(item.runtime) || 0),
      0
    );

    const rated = parts.filter(
      (item) => Number(item.vote_average || 0) > 0
    );

    const averageRating =
      rated.length > 0
        ? rated.reduce(
            (soma, item) => soma + Number(item.vote_average || 0),
            0
          ) / rated.length
        : null;

    return NextResponse.json(
      {
        collection: {
          id: collection.id,
          name: collection.name,
          overview: collection.overview || "",
          poster_path: collection.poster_path,
          backdrop_path: collection.backdrop_path,
        },

        stats: {
          total: parts.length,
          released: released.length,
          total_runtime: totalRuntime,
          average_rating: averageRating,
        },

        parts,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=21600",
        },
      }
    );
  } catch (erro) {
    return respostaDeErro(erro, "GET /api/collection");
  }
}