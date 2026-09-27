import { detailsTMDB } from "@/lib/tmdb";
import type {
  CastCredit,
  CrewCredit,
  PersonCredit,
  TitleCreditsData,
} from "@/lib/title-credits";
import { groupEditorialCrew } from "@/lib/title-credits";
import type { EpisodeSummary, SeasonSummary } from "@/lib/title-seasons";
import {
  normalizeEpisodeSummary,
  normalizeSeasonSummaries,
} from "@/lib/title-seasons";
import type { CollectionRef, RelatedItem } from "@/lib/title-related";
import {
  normalizeCollectionRef,
  normalizeRelatedItems,
} from "@/lib/title-related";

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
 * Watch-provider lookup is optional enrichment: a TMDB provider outage must
 * not turn an otherwise valid title response into a page-level failure.
 * Shared by the Server Component path and the client fallback Route Handler.
 */
export async function getTitleWatchProviders(
  type: TitleType,
  tmdbId: number
): Promise<unknown | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `${TMDB_BASE}/${type}/${tmdbId}/watch/providers?api_key=${encodeURIComponent(
        apiKey
      )}`,
      {
        headers: { accept: "application/json" },
        next: { revalidate: 21600 },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      console.error("[watch providers]", response.status);
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

type TmdbRecord = Record<string, unknown>;

/*
 * Créditos editoriais suportados (C4.3) — Title page não é ficha técnica
 * exaustiva. Producer/Executive Producer/Camera/Editing/Sound/Art/
 * Costume/Makeup/demais crew são descartados aqui, na sanitização, e
 * nunca chegam à UI nem à API.
 */
const SUPPORTED_CREW_JOBS = new Set(["Director", "Writer", "Screenplay", "Story"]);

/* Cada grupo editorial do payload respeita diretamente seu teto visual. */
const DIRECTION_PAYLOAD_LIMIT = 5;
const WRITING_PAYLOAD_LIMIT = 5;

function compactPerson(value: unknown, crew: true): CrewCredit | null;
function compactPerson(value: unknown, crew?: false): CastCredit | null;
function compactPerson(value: unknown, crew = false): CastCredit | CrewCredit | null {
  if (!value || typeof value !== "object") return null;

  const person = value as TmdbRecord;
  if (!Number.isInteger(Number(person.id)) || typeof person.name !== "string") {
    return null;
  }

  const base: PersonCredit = {
    id: Number(person.id),
    name: person.name,
    profile_path: typeof person.profile_path === "string" ? person.profile_path : null,
  };

  return crew
    ? {
        ...base,
        department: typeof person.department === "string" ? person.department : null,
        job: typeof person.job === "string" ? person.job : null,
      }
    : {
        ...base,
        character: typeof person.character === "string" ? person.character : null,
        order: Number.isInteger(Number(person.order)) ? Number(person.order) : null,
      };
}

/** Formato sanitizado devolvido por sanitizeTitleDetails / consumido pela UI. */
export type SanitizedTitleDetails = Record<string, unknown> & {
  credits: TitleCreditsData;
  created_by: PersonCredit[];
  seasons: SeasonSummary[];
  last_episode_to_air: EpisodeSummary | null;
  next_episode_to_air: EpisodeSummary | null;
  recommendations: RelatedItem[];
  belongs_to_collection: CollectionRef | null;
};

/**
 * Reduz a resposta pública do TMDB aos dados realmente usados pela interface.
 * Além de diminuir o RSC/JSON, remove credit_id e números financeiros que
 * scanners confundem com cartões ou timestamps.
 *
 * `type` só alimenta `media_type` das recomendações — a resposta
 * `/movie|tv/{id}/recommendations` embutida via `append_to_response` nunca
 * marca esse campo nos itens (são sempre do mesmo tipo do título
 * consultado).
 */
export function sanitizeTitleDetails(
  value: unknown,
  type: TitleType
): SanitizedTitleDetails {
  if (!value || typeof value !== "object") {
    return {
      credits: { cast: [], crew: [] },
      created_by: [],
      seasons: [],
      last_episode_to_air: null,
      next_episode_to_air: null,
      recommendations: [],
      belongs_to_collection: null,
    };
  }

  const details = value as TmdbRecord;
  const credits = details.credits && typeof details.credits === "object"
    ? details.credits as TmdbRecord
    : {};
  const cast: CastCredit[] = Array.isArray(credits.cast)
    ? credits.cast
        .map((person) => compactPerson(person))
        .filter((person): person is CastCredit => person !== null)
        .slice(0, 24)
    : [];
  const supportedCrew = Array.isArray(credits.crew)
    ? credits.crew.filter((person): person is TmdbRecord => {
        if (!person || typeof person !== "object" || !("job" in person)) {
          return false;
        }

        const job = person.job;
        return typeof job === "string" && SUPPORTED_CREW_JOBS.has(job);
      })
    : [];
  const compactedCrew: CrewCredit[] = supportedCrew
    .map((person) => compactPerson(person, true))
    .filter((person): person is CrewCredit => person !== null);
  const editorialCrew = groupEditorialCrew(compactedCrew);
  const crew: CrewCredit[] = [
    ...editorialCrew.direction.slice(0, DIRECTION_PAYLOAD_LIMIT),
    ...editorialCrew.writing.slice(0, WRITING_PAYLOAD_LIMIT),
  ];
  const createdBy: PersonCredit[] = Array.isArray(details.created_by)
    ? details.created_by
        .map((person) => compactPerson(person))
        .filter((person): person is CastCredit => person !== null)
        .slice(0, 10)
    : [];

  const seasons: SeasonSummary[] = normalizeSeasonSummaries(details.seasons);
  const lastEpisodeToAir: EpisodeSummary | null = normalizeEpisodeSummary(
    details.last_episode_to_air
  );
  const nextEpisodeToAir: EpisodeSummary | null = normalizeEpisodeSummary(
    details.next_episode_to_air
  );

  const selfId = Number(details.id);
  const recommendations: RelatedItem[] = normalizeRelatedItems(
    details.recommendations,
    type,
    Number.isFinite(selfId) ? selfId : -1
  );
  /*
   * `belongs_to_collection` só existe no detalhe de filme (o TMDB nunca
   * inclui esse campo em `/tv/{id}`) — para TV, normalizeCollectionRef
   * recebe `undefined` e devolve `null` defensivamente, então nunca
   * "inventa" coleção para série.
   */
  const belongsToCollection: CollectionRef | null = normalizeCollectionRef(
    details.belongs_to_collection
  );

  const {
    budget: _budget,
    revenue: _revenue,
    credits: _credits,
    aggregate_credits: _aggregateCredits,
    images: _images,
    created_by: _createdBy,
    seasons: _seasons,
    last_episode_to_air: _lastEpisodeToAir,
    next_episode_to_air: _nextEpisodeToAir,
    recommendations: _recommendations,
    belongs_to_collection: _belongsToCollection,
    ...safeDetails
  } = details;

  return {
    ...safeDetails,
    credits: { cast, crew },
    created_by: createdBy,
    seasons,
    last_episode_to_air: lastEpisodeToAir,
    next_episode_to_air: nextEpisodeToAir,
    recommendations,
    belongs_to_collection: belongsToCollection,
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
  const [details, providersResponse] = await Promise.all([
    detailsTMDB(type, tmdbId),
    getTitleWatchProviders(type, tmdbId),
  ]);

  return {
    ...sanitizeTitleDetails(details, type),
    watch_providers: providersResponse,
  };
}

/** Formato devolvido por getTitleDetails / GET /api/tmdb/[type]/[id]. */
export type TitleDetails = Awaited<ReturnType<typeof getTitleDetails>>;

/** Valida os params da rota. Devolve null se forem inválidos. */
export function parseTitleParams(type: string, id: string) {
  if (type !== "movie" && type !== "tv") return null;

  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  return { type: type as TitleType, tmdbId };
}
