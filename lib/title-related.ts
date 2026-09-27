/*
 * Contrato interno (sanitizado) de "relacionados" e referência de coleção
 * de título (C6). Mesma filosofia de lib/title-credits.ts e
 * lib/title-seasons.ts: fronteira RAW (TMDB) -> unknown -> normalizer puro
 * -> contrato interno pequeno. Não conhece React, CSS, fetch nem DOM.
 */

export type RelatedItemType = "movie" | "tv";

export type RelatedItem = {
  id: number;
  media_type: RelatedItemType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  /** `release_date` (movie) ou `first_air_date` (tv), o que existir. */
  date: string | null;
  vote_average: number | null;
};

/** `belongs_to_collection` do detalhe de filme — nunca existe para TV. */
export type CollectionRef = {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
};

const RELATED_LIMIT = 12;

type RawRecord = Record<string, unknown>;

function isRawRecord(value: unknown): value is RawRecord {
  return !!value && typeof value === "object";
}

function toFiniteInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeRelatedItem(raw: unknown, mediaType: RelatedItemType): RelatedItem | null {
  if (!isRawRecord(raw)) return null;

  const id = toFiniteInt(raw.id);
  if (id === null) return null;

  const title = typeof raw.title === "string" && raw.title
    ? raw.title
    : typeof raw.name === "string" && raw.name
      ? raw.name
      : null;
  if (!title) return null;

  return {
    id,
    media_type: mediaType,
    title,
    poster_path: toNullableString(raw.poster_path),
    backdrop_path: toNullableString(raw.backdrop_path),
    date: toNullableString(raw.release_date) ?? toNullableString(raw.first_air_date),
    vote_average: toFiniteNumber(raw.vote_average),
  };
}

/**
 * `raw` é `details.recommendations` cru do TMDB (`{results: [...]}`).
 * `mediaType` vem de quem chama (o endpoint `/movie|tv/{id}/recommendations`
 * embutido via `append_to_response` não marca `media_type` nos itens — são
 * sempre do mesmo tipo do título consultado). `excludeId` remove o próprio
 * título caso o TMDB o devolva como recomendação de si mesmo. Filtra
 * inválidos, deduplica por `media_type+id` mantendo a primeira ocorrência,
 * e limita a `RELATED_LIMIT`.
 */
export function normalizeRelatedItems(
  raw: unknown,
  mediaType: RelatedItemType,
  excludeId: number
): RelatedItem[] {
  const results = isRawRecord(raw) ? raw.results : null;
  if (!Array.isArray(results)) return [];

  const seen = new Set<string>();
  const out: RelatedItem[] = [];

  for (const entry of results) {
    const item = normalizeRelatedItem(entry, mediaType);
    if (!item || item.id === excludeId) continue;

    const key = `${item.media_type}-${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(item);
    if (out.length >= RELATED_LIMIT) break;
  }

  return out;
}

/** `details.belongs_to_collection` cru — objeto único ou ausente/null. */
export function normalizeCollectionRef(raw: unknown): CollectionRef | null {
  if (!isRawRecord(raw)) return null;

  const id = toFiniteInt(raw.id);
  if (id === null || typeof raw.name !== "string" || !raw.name) return null;

  return {
    id,
    name: raw.name,
    poster_path: toNullableString(raw.poster_path),
    backdrop_path: toNullableString(raw.backdrop_path),
  };
}
