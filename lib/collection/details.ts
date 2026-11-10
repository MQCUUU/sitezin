/*
 * Coleção do TMDB com detalhes das partes — usada pela página (Server
 * Component, HTML inicial já com o conteúdo) e pela rota /api/collection/[id].
 * Fase 6 (desempenho): antes só a rota existia e a página montava tudo no
 * cliente, depois do JS. Lógica igual à da rota antiga:
 *   - no máximo 6 requisições ao TMDB por vez e teto de 40 filmes;
 *   - falha de um filme cai no item básico da coleção;
 *   - partes por data de lançamento (sem data vai para o final).
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const MAX_PARTES = 40;
const CONCORRENCIA = 6;
const REVALIDATE = 21600; // 6 horas

/* eslint-disable @typescript-eslint/no-explicit-any -- formato livre do TMDB, como na rota original */
export type CollectionDetails = {
  collection: { id: number; name: string; overview: string; poster_path: string | null; backdrop_path: string | null };
  stats: { total: number; released: number; total_runtime: number; average_rating: number | null };
  parts: any[];
};

/** Erro com o status HTTP que a rota deve devolver; a mensagem é segura para o usuário. */
export class CollectionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function parseCollectionId(id: string) {
  const collectionId = Number(id);
  return Number.isFinite(collectionId) && collectionId > 0 ? collectionId : null;
}

async function mapaComLimite<T, R>(itens: T[], limite: number, tarefa: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;

  async function operario() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await tarefa(itens[indice]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, operario));
  return resultados;
}

export async function getCollectionDetails(collectionId: number): Promise<CollectionDetails> {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    console.error("[collection] TMDB_API_KEY não configurada");
    throw new CollectionError("Serviço indisponível no momento.", 503);
  }

  const qs = new URLSearchParams({ api_key: apiKey, language: process.env.TMDB_LANGUAGE || "pt-BR" });
  const resposta = await fetch(`${TMDB_BASE}/collection/${collectionId}?${qs}`, { next: { revalidate: REVALIDATE } });
  const collection = await resposta.json();

  if (!resposta.ok) {
    // status_message do TMDB é texto público da API deles, seguro de repassar.
    throw new CollectionError(collection?.status_message || "Coleção não encontrada.", resposta.status);
  }

  const rawParts: any[] = Array.isArray(collection?.parts) ? collection.parts.slice(0, MAX_PARTES) : [];

  const detailedParts = await mapaComLimite(rawParts, CONCORRENCIA, async (part) => {
    try {
      const r = await fetch(`${TMDB_BASE}/movie/${part.id}?${qs}`, { next: { revalidate: REVALIDATE } });
      if (!r.ok) return { ...part, media_type: "movie" };
      return { ...part, ...(await r.json()), media_type: "movie" };
    } catch {
      return { ...part, media_type: "movie" };
    }
  });

  const parts = detailedParts.sort((a, b) =>
    String(a.release_date || "9999-12-31").localeCompare(String(b.release_date || "9999-12-31"))
  );

  const agora = Date.now();
  const released = parts.filter((item) => item.release_date && new Date(item.release_date).getTime() <= agora);
  const totalRuntime = parts.reduce((soma, item) => soma + (Number(item.runtime) || 0), 0);
  const rated = parts.filter((item) => Number(item.vote_average || 0) > 0);
  const averageRating =
    rated.length > 0 ? rated.reduce((soma, item) => soma + Number(item.vote_average || 0), 0) / rated.length : null;

  return {
    collection: {
      id: collection.id,
      name: collection.name,
      overview: collection.overview || "",
      poster_path: collection.poster_path ?? null,
      backdrop_path: collection.backdrop_path ?? null,
    },
    stats: { total: parts.length, released: released.length, total_runtime: totalRuntime, average_rating: averageRating },
    parts,
  };
}
