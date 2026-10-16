/*
 * V2.1-D — o endpoint POST /api/library/state aceita no máximo 100 títulos
 * por chamada. Coleções maiores são divididas em lotes: ceil(N / 100)
 * requests, nunca N.
 */
export const LIBRARY_STATE_BATCH_SIZE = 100;

export function chunkLibraryStateIds(
  ids: number[],
  size: number = LIBRARY_STATE_BATCH_SIZE
): number[][] {
  const unique = Array.from(new Set(ids));
  const batches: number[][] = [];

  for (let index = 0; index < unique.length; index += size) {
    batches.push(unique.slice(index, index + size));
  }

  return batches;
}

export type LibraryStatePair = { media_type: "movie" | "tv"; tmdb_id: number };

/*
 * V3.2 — mesma regra para resultados mistos (filmes + séries) da Busca:
 * pares (media_type, tmdb_id) válidos, sem duplicatas, em lotes de 100.
 */
export function chunkLibraryStatePairs(
  items: { media_type?: unknown; id?: unknown }[],
  size: number = LIBRARY_STATE_BATCH_SIZE
): LibraryStatePair[][] {
  const seen = new Set<string>();
  const pairs: LibraryStatePair[] = [];

  for (const item of items) {
    const mediaType = item?.media_type;
    const tmdbId = Number(item?.id);

    if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isInteger(tmdbId) || tmdbId <= 0) continue;

    const key = `${mediaType}:${tmdbId}`;

    if (seen.has(key)) continue;

    seen.add(key);
    pairs.push({ media_type: mediaType, tmdb_id: tmdbId });
  }

  const batches: LibraryStatePair[][] = [];

  for (let index = 0; index < pairs.length; index += size) {
    batches.push(pairs.slice(index, index + size));
  }

  return batches;
}
