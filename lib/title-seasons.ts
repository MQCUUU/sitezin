import type { CrewCredit } from "@/lib/title-credits";

/*
 * Contrato interno (sanitizado) de temporadas/episódios de série (C5.1).
 *
 * Mesma filosofia de lib/title-credits.ts: fronteira RAW (TMDB) -> unknown
 * -> normalizer puro -> contrato interno pequeno e explícito. Não modela o
 * payload cru do TMDB inteiro, só os campos que os consumers reais usam
 * (Title SSR, /api/tv/[id]/season/[season], EpisodeBrowser, SeasonProgress,
 * a página deep-link de episódio). Não conhece React, CSS, fetch nem DOM.
 */

export type SeasonSummary = {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_count: number | null;
  poster_path: string | null;
};

export type EpisodeSummary = {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number | null;
  /**
   * Só a página de episódio usa isto (direção/roteiro do episódio); os
   * demais consumers (linhas de lista, widget "continuar assistindo",
   * SeasonProgress) simplesmente ignoram o campo. Fica no contrato
   * compartilhado em vez de um segundo tipo paralelo porque o shape é
   * exatamente `CrewCredit` (C4) — mesmo conceito, granularidade de
   * episódio em vez de título.
   */
  crew: CrewCredit[];
};

export type SeasonDetails = {
  id: number;
  name: string;
  overview: string;
  season_number: number;
  air_date: string | null;
  poster_path: string | null;
  episodes: EpisodeSummary[];
};

export type EpisodeReleaseStatus = "released" | "future" | "unknown";

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

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resumo de temporada — o que `details.seasons` e o seletor precisam.
 * `season_number` aceita 0 (Especiais); negativo/fracionário/NaN é inválido.
 */
export function normalizeSeasonSummary(raw: unknown): SeasonSummary | null {
  if (!isRawRecord(raw)) return null;

  const id = toFiniteInt(raw.id);
  const seasonNumber = toFiniteInt(raw.season_number);
  if (id === null || seasonNumber === null || seasonNumber < 0) return null;

  return {
    id,
    season_number: seasonNumber,
    name: toStringOrEmpty(raw.name),
    overview: toStringOrEmpty(raw.overview),
    air_date: toNullableString(raw.air_date),
    episode_count: toFiniteInt(raw.episode_count),
    poster_path: toNullableString(raw.poster_path),
  };
}

/** Filtra entradas inválidas; nunca fabrica id/season_number falso. */
export function normalizeSeasonSummaries(raw: unknown): SeasonSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeSeasonSummary)
    .filter((season): season is SeasonSummary => season !== null);
}

/**
 * Episódio — usado tanto dentro de `SeasonDetails.episodes` quanto para
 * `last_episode_to_air`/`next_episode_to_air` do detalhe da série.
 * `episode_number` segue a mesma regra de `/api/episodes` (inteiro >= 1).
 */
export function normalizeEpisodeSummary(raw: unknown): EpisodeSummary | null {
  if (!isRawRecord(raw)) return null;

  const id = toFiniteInt(raw.id);
  const episodeNumber = toFiniteInt(raw.episode_number);
  const seasonNumber = toFiniteInt(raw.season_number);
  if (id === null) return null;
  if (episodeNumber === null || episodeNumber < 1) return null;
  if (seasonNumber === null || seasonNumber < 0) return null;

  return {
    id,
    name: toStringOrEmpty(raw.name),
    overview: toStringOrEmpty(raw.overview),
    episode_number: episodeNumber,
    season_number: seasonNumber,
    air_date: toNullableString(raw.air_date),
    runtime: toFiniteNumber(raw.runtime),
    still_path: toNullableString(raw.still_path),
    vote_average: toFiniteNumber(raw.vote_average),
    crew: normalizeEpisodeCrew(raw.crew),
  };
}

/**
 * Detalhes de uma temporada (resposta de `seasonTMDB`). `episodes[]`
 * preserva só entradas válidas — um episódio malformado nunca derruba a
 * temporada inteira nem os episódios válidos ao redor dele.
 */
export function normalizeSeasonDetails(raw: unknown): SeasonDetails | null {
  if (!isRawRecord(raw)) return null;

  const id = toFiniteInt(raw.id);
  const seasonNumber = toFiniteInt(raw.season_number);
  if (id === null || seasonNumber === null || seasonNumber < 0) return null;

  const episodes = Array.isArray(raw.episodes)
    ? raw.episodes
        .map(normalizeEpisodeSummary)
        .filter((episode): episode is EpisodeSummary => episode !== null)
    : [];

  return {
    id,
    name: toStringOrEmpty(raw.name),
    overview: toStringOrEmpty(raw.overview),
    season_number: seasonNumber,
    air_date: toNullableString(raw.air_date),
    poster_path: toNullableString(raw.poster_path),
    episodes,
  };
}

/**
 * Crew de um episódio (`episode.crew` da resposta de season details do
 * TMDB). Mesmo shape de `CrewCredit` (C4) — id/name/profile_path/
 * department/job — porque é semanticamente o mesmo conceito (crédito de
 * pessoa com cargo), só que na granularidade de um episódio em vez do
 * título inteiro. Nenhum limite/dedupe/política editorial é aplicado
 * aqui — quem decide o que exibir é o consumer (hoje: a página de
 * episódio filtra por job na própria UI, sem mudar essa política).
 */
export function normalizeEpisodeCrew(raw: unknown): CrewCredit[] {
  if (!Array.isArray(raw)) return [];

  const out: CrewCredit[] = [];
  for (const item of raw) {
    if (!isRawRecord(item)) continue;
    const id = toFiniteInt(item.id);
    if (id === null || typeof item.name !== "string") continue;

    out.push({
      id,
      name: item.name,
      profile_path: toNullableString(item.profile_path),
      department: toNullableString(item.department),
      job: toNullableString(item.job),
    });
  }

  return out;
}

/**
 * Status de lançamento derivado de `air_date`, por comparação de data
 * civil (string `YYYY-MM-DD`, sem `Date` completo) para não depender do
 * fuso horário do processo. `air_date` ausente/inválida é `"unknown"` —
 * NUNCA `"released"`. Essa é a decisão de produto da C5.1: episódio sem
 * data não pode ser assumido como lançado.
 */
export function getEpisodeReleaseStatus(
  airDate: string | null | undefined
): EpisodeReleaseStatus {
  if (!airDate) return "unknown";

  const dateOnly = String(airDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return "unknown";

  const today = new Date().toISOString().slice(0, 10);
  return dateOnly <= today ? "released" : "future";
}
