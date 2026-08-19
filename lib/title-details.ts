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

type TmdbRecord = Record<string, unknown>;

function compactPerson(value: unknown, crew = false) {
  if (!value || typeof value !== "object") return null;

  const person = value as TmdbRecord;
  if (!Number.isInteger(Number(person.id)) || typeof person.name !== "string") {
    return null;
  }

  return {
    id: Number(person.id),
    name: person.name,
    profile_path: typeof person.profile_path === "string" ? person.profile_path : null,
    ...(crew
      ? {
          department: typeof person.department === "string" ? person.department : null,
          job: typeof person.job === "string" ? person.job : null,
        }
      : {
          character: typeof person.character === "string" ? person.character : null,
          order: Number.isInteger(Number(person.order)) ? Number(person.order) : null,
        }),
  };
}

/**
 * Reduz a resposta pública do TMDB aos dados realmente usados pela interface.
 * Além de diminuir o RSC/JSON, remove credit_id e números financeiros que
 * scanners confundem com cartões ou timestamps.
 */
export function sanitizeTitleDetails(value: unknown): TmdbRecord {
  if (!value || typeof value !== "object") return {};

  const details = value as TmdbRecord;
  const credits = details.credits && typeof details.credits === "object"
    ? details.credits as TmdbRecord
    : {};
  const cast = Array.isArray(credits.cast)
    ? credits.cast.map((person) => compactPerson(person)).filter(Boolean).slice(0, 24)
    : [];
  const crew = Array.isArray(credits.crew)
    ? credits.crew
        .filter((person) => person && typeof person === "object" && (person as TmdbRecord).job === "Director")
        .map((person) => compactPerson(person, true))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const createdBy = Array.isArray(details.created_by)
    ? details.created_by.map((person) => compactPerson(person)).filter(Boolean).slice(0, 10)
    : [];

  const {
    budget: _budget,
    revenue: _revenue,
    credits: _credits,
    aggregate_credits: _aggregateCredits,
    images: _images,
    created_by: _createdBy,
    ...safeDetails
  } = details;

  return {
    ...safeDetails,
    credits: { cast, crew },
    created_by: createdBy,
  };
}

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
    ...sanitizeTitleDetails(details),
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
