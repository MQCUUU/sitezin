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
