import { detailsTMDB } from "@/lib/tmdb";

/*
 * ============================================================
 * ARQUIVO NOVO — lib/title-details.ts
 *
 * POR QUE EXISTE
 *   app/api/tmdb/[type]/[id]/route.ts monta a resposta da
 *   página de título juntando duas coisas: o detailsTMDB e o
 *   /watch/providers. O novo Server Component precisa
 *   EXATAMENTE do mesmo objeto — se as duas montagens
 *   divergirem um dia, a página vai se comportar diferente no
 *   servidor e no cliente, e esse é o tipo de bug que leva
 *   horas para achar.
 *
 *   Então a lógica sai da rota e vem para cá. A rota passa a
 *   chamar esta função, e o Server Component também. Uma fonte
 *   só.
 *
 * O QUE **NÃO** VEIO PARA CÁ
 *   O indexMediaCharacters() que a rota roda dentro de after().
 *   É efeito colateral de indexação, específico daquela rota, e
 *   continua lá.
 * ============================================================
 */

const TMDB_BASE = "https://api.themoviedb.org/3";

export type TitleType = "movie" | "tv";

/**
 * Detalhes completos de um título + onde assistir.
 *
 * Devolve o mesmo formato que GET /api/tmdb/[type]/[id]:
 * todos os campos do TMDB mais `watch_providers`.
 *
 * Lança se o TMDB falhar — quem chama decide o que fazer.
 */
export async function getTitleDetails(
  type: TitleType,
  tmdbId: number
) {
  const apiKey = process.env.TMDB_API_KEY;

  /*
   * Sem chave, a página ainda funciona — só não mostra onde
   * assistir. Melhor que derrubar tudo.
   */
  const providersPromise = apiKey
    ? fetch(
        `${TMDB_BASE}/${type}/${tmdbId}/watch/providers?api_key=${encodeURIComponent(
          apiKey
        )}`,
        {
          headers: { accept: "application/json" },
          next: { revalidate: 21600 },
          signal: AbortSignal.timeout(8000),
        }
      ).catch(() => null)
    : null;

  const [details, providersResponse] = await Promise.all([
    detailsTMDB(type, tmdbId),
    providersPromise,
  ]);

  let watchProviders: unknown = null;

  if (providersResponse?.ok) {
    watchProviders = await providersResponse.json();
  } else if (providersResponse) {
    console.error(
      "[watch providers]",
      providersResponse.status
    );
  }

  return {
    ...(details as Record<string, unknown>),
    watch_providers: watchProviders,
  };
}

/** Valida os params da rota. Devolve null se forem inválidos. */
export function parseTitleParams(type: string, id: string) {
  if (type !== "movie" && type !== "tv") return null;

  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  return { type: type as TitleType, tmdbId };
}