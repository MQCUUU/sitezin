import { isApiError } from "@/lib/api-client";

import type { SearchErrorKind } from "./types";

/*
 * Fase 5/6 — textos de falha da busca (sugestões e página /search), por causa.
 * Antes, toda falha virava "Verifique sua conexão", inclusive limite de buscas
 * (429) e erro do servidor.
 */
export const SEARCH_ERROR_COPY: Record<SearchErrorKind, { title: string; hint: string }> = {
  "rate-limit": {
    title: "Muitas buscas em pouco tempo",
    hint: "Aguarde um momento e tente novamente.",
  },
  network: {
    title: "Não foi possível buscar agora",
    hint: "Verifique sua conexão e tente novamente.",
  },
  unavailable: {
    title: "Não foi possível buscar agora",
    hint: "A busca está indisponível no momento. Tente novamente em instantes.",
  },
  invalid: {
    title: "Não deu para buscar esse termo",
    hint: "Revise o que foi digitado e tente de novo.",
  },
};

/** Erro (ApiError do cliente padrão, ou falha de rede crua) → causa exibida. */
export function searchErrorKind(error: unknown): SearchErrorKind {
  if (isApiError(error, "RATE_LIMITED")) return "rate-limit";
  if (isApiError(error, "NETWORK_ERROR", "TIMEOUT") || error instanceof TypeError) return "network";
  if (isApiError(error, "VALIDATION_ERROR")) return "invalid";
  return "unavailable";
}
