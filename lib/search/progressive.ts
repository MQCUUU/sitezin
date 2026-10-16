/*
 * Busca V3.2 — estratégia progressiva das chamadas externas. Puro (sem rede):
 * testado em scripts/test-search.mjs.
 *
 * 1ª tentativa: /search/multi + /search/person com a query como digitada.
 * 2ª (só se necessário): variantes de pessoa (primeiro/último nome, prefixo
 * para typo) — apenas quando a 1ª não trouxe título exato. Pessoa forte NÃO
 * corta a 2ª tentativa: as variantes trazem homônimos/parentes que o dropdown
 * já mostrava ("Tom Hanks" → Jim Hanks) e cortar mudaria o resultado.
 */

import { isExactTitle, normalizeSearch } from "./rank";

/** Timeouts das fontes TMDB: a principal tem folga; as secundárias não podem segurar a resposta. */
export const PRIMARY_TIMEOUT_MS = 4000;
export const SECONDARY_TIMEOUT_MS = 2500;

/** Variantes adicionais de pessoa (sem a query original, que é a 1ª tentativa). Máx. 3. */
export function personVariantsFor(query: string): string[] {
  const q = normalizeSearch(query);
  const out = new Set<string>();
  const tokens = q.split(" ").filter(Boolean);

  if (tokens.length > 1) {
    out.add(tokens[0]);
    out.add(tokens[tokens.length - 1]);
  }

  if (q.length >= 5) out.add(q.slice(0, Math.max(4, q.length - 1)));

  out.delete(q);
  out.delete(query.trim());

  return Array.from(out).slice(0, 3);
}

/** A 2ª tentativa (variantes de pessoa) só roda se a 1ª não trouxe um título exato. */
export function needsPersonVariants(query: string, results: unknown[]) {
  // O multi mistura pessoas (campo `name`): só filme/série conta como título.
  return !results.some((item) => {
    const mediaType = item && typeof item === "object" ? (item as { media_type?: unknown }).media_type : null;

    return (mediaType === "movie" || mediaType === "tv") && isExactTitle(query, item as never);
  });
}
