/*
 * Fase 2 (P3-11) — metadados de filtros do Descobrir compartilhados na aba.
 *
 * Descobrir e "Escolha pra mim" buscavam as MESMAS URLs
 * (/api/discover/filters?type=movie|tv) de forma independente; a resposta é
 * pública e quase estática (cache de 24 h na CDN), mas sem `max-age` o
 * navegador não a reaproveitava — abrir "Escolha pra mim" no Descobrir
 * repetia as duas requisições. Aqui a primeira chamada é compartilhada (em voo
 * ou concluída) por 30 min; falhas nunca ficam em cache.
 */

export type DiscoverFiltersPayload = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  genres?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providers?: any[];
};

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<DiscoverFiltersPayload> }>();

type Fetcher = (url: string) => Promise<Response>;

export function fetchDiscoverFilters(url: string, fetcher: Fetcher = (input) => fetch(input)): Promise<DiscoverFiltersPayload> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;

  const promise = fetcher(url).then(async (response) => {
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.error) {
      throw new Error(data?.error || "Erro ao carregar filtros.");
    }
    return data as DiscoverFiltersPayload;
  });

  cache.set(url, { at: Date.now(), promise });
  promise.catch(() => {
    if (cache.get(url)?.promise === promise) cache.delete(url);
  });

  return promise;
}

/** Só para testes. */
export function clearDiscoverFiltersCache() {
  cache.clear();
}
