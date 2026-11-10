/*
 * Busca — correção de grafia de título. Puro (sem rede): testado em
 * scripts/test-search.mjs.
 *
 * O TMDB não tolera erro de digitação ("intrestellar" → 0). Quando a busca
 * avançada volta vazia, a rota pede ao índice local (search_v4_title_suggest,
 * trigram sobre ~10 mil títulos) o título mais parecido e refaz a busca com
 * ele, avisando o usuário ("Mostrando resultados para Interestelar").
 */

import { normalizeSearch } from "./rank";

export type TitleSuggestionRow = { title: string; similarity: number | string; popularity?: number | string | null };

/** Semelhança mínima (trigram) para trocar o que a pessoa digitou. */
export const MIN_CORRECTION_SIMILARITY = 0.4;

/**
 * Só vale tentar quando a busca não achou nada: `handled: false` com catálogo
 * vazio. `catalog: null` é falha do TMDB (não "zero resultados") e fica de fora,
 * assim como buscas curtas, de usuário (@) ou já corrigidas.
 */
export function shouldTryTitleCorrection(query: string, body: unknown): boolean {
  if (normalizeSearch(query).length < 4 || query.trim().startsWith("@")) return false;
  if (!body || typeof body !== "object") return false;
  const data = body as { handled?: unknown; catalog?: unknown; corrected?: unknown; error?: unknown };
  if (data.error || data.corrected) return false;
  return data.handled === false && Array.isArray(data.catalog) && data.catalog.length === 0;
}

/** Melhor sugestão aceitável, ou null. Ignora a própria grafia digitada. */
export function pickTitleCorrection(query: string, rows: TitleSuggestionRow[]): string | null {
  const typed = normalizeSearch(query);
  for (const row of rows) {
    if (Number(row.similarity) < MIN_CORRECTION_SIMILARITY) continue;
    const title = String(row.title || "").trim();
    if (!title || normalizeSearch(title) === typed) continue;
    return title;
  }
  return null;
}
