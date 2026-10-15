/*
 * V2.9 — regras de catálogo de "Descobrir" (puras, testadas em scripts/test-discover.mjs).
 *
 * Descobrir é NEUTRO: nada aqui usa perfil, notas ou histórico do usuário.
 *
 * Paginação: 20 títulos por página em Filmes, Séries e Todos — o mesmo tamanho da
 * página do TMDB (página N do site = página N do TMDB, sem recortes).
 * O TMDB só navega até a página 500 e informa no máximo 20.001 resultados por
 * consulta; o total exibido nunca finge ser o catálogo completo.
 *
 * Todos: POOL FIXO = páginas 1–20 do TMDB de filmes + páginas 1–20 de séries
 * (até 400 de cada, com os mesmos filtros), sem repetidos, ordenado pela chave
 * real da ordenação com desempate total (sortPool). Toda página de Todos é uma
 * fatia desse MESMO pool ordenado: ordem global nunca volta para trás, nenhum
 * título repete ou some entre páginas, e o resultado é determinístico.
 * (Intercalar só as primeiras páginas de cada tipo não basta: a popularidade
 * que o TMDB devolve não é monotônica dentro da própria lista.)
 * Todos vai até a página 20 (400 títulos); Filmes/Séries até o limite do TMDB.
 */
export type MediaType = "movie" | "tv";
export type DiscoverSort = "popular" | "rating" | "newest";

export const PAGE_SIZE = 20;
export const TMDB_MAX_PAGES = 500;
export const ALL_MAX_PAGES = 20;
/* "Mais bem avaliados": nota com confiança mínima, igual para filme e série */
export const RATING_MIN_VOTES = 500;
/* nota mínima nas outras ordenações: corta notas sem nenhuma confiança */
export const MIN_RATING_VOTES = 50;
/* "Recentes": já lançados (data ≤ hoje) e com algumas avaliações */
export const NEWEST_MIN_VOTES = 10;

export type CatalogItem = {
  id: number;
  media_type: MediaType;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  [extra: string]: unknown;
};

/* ---------- gêneros: equivalência filme ↔ série (ids do TMDB) ---------- */
const MOVIE_TO_TV: Record<number, number> = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768 };
const TV_TO_MOVIE: Record<number, number[]> = { 10759: [28, 12], 10765: [878, 14], 10768: [10752] };
const SHARED = new Set([16, 35, 80, 99, 18, 10751, 9648, 37]);
const MOVIE_ONLY = new Set([36, 27, 10402, 10749, 10770, 53]);
const TV_ONLY = new Set([10762, 10763, 10764, 10766, 10767]);
export const KNOWN_GENRES = new Set([...SHARED, ...MOVIE_ONLY, ...TV_ONLY, ...Object.keys(MOVIE_TO_TV).map(Number), ...Object.keys(TV_TO_MOVIE).map(Number)]);

/** `with_genres` para o tipo; null = esse gênero não existe nesse tipo no TMDB. */
export function genreForType(genreId: number, type: MediaType): string | null {
  if (SHARED.has(genreId)) return String(genreId);
  if (type === "movie") {
    if (MOVIE_ONLY.has(genreId) || MOVIE_TO_TV[genreId]) return String(genreId);
    if (TV_TO_MOVIE[genreId]) return TV_TO_MOVIE[genreId].join("|");
    return null;
  }
  if (TV_ONLY.has(genreId) || TV_TO_MOVIE[genreId]) return String(genreId);
  if (MOVIE_TO_TV[genreId]) return String(MOVIE_TO_TV[genreId]);
  return null;
}

/* ---------- ordenação ---------- */
export function tmdbSortBy(type: MediaType, sort: DiscoverSort): string {
  if (sort === "rating") return "vote_average.desc";
  if (sort === "newest") return type === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
  return "popularity.desc";
}

const dateOf = (c: CatalogItem) => String(c.release_date || c.first_air_date || "");
const num = (v: unknown) => Number(v || 0);

/**
 * Ordem total (< 0 = `a` antes de `b`). Chave principal da ordenação e desempates fixos:
 *   popular: popularidade ↓, avaliações ↓, data ↓
 *   rating:  nota ↓, avaliações ↓, popularidade ↓
 *   newest:  data ↓, popularidade ↓, avaliações ↓
 *   depois:  filme antes de série, id do TMDB ↑ (nunca empata)
 */
export function compareForSort(a: CatalogItem, b: CatalogItem, sort: DiscoverSort): number {
  const steps: number[] =
    sort === "rating"
      ? [num(b.vote_average) - num(a.vote_average), num(b.vote_count) - num(a.vote_count), num(b.popularity) - num(a.popularity)]
      : sort === "newest"
        ? [dateOf(b).localeCompare(dateOf(a)), num(b.popularity) - num(a.popularity), num(b.vote_count) - num(a.vote_count)]
        : [num(b.popularity) - num(a.popularity), num(b.vote_count) - num(a.vote_count), dateOf(b).localeCompare(dateOf(a))];

  for (const d of steps) if (d) return d;
  if (a.media_type !== b.media_type) return a.media_type === "movie" ? -1 : 1;

  return num(a.id) - num(b.id);
}

/** Pool de Todos: remove repetidos (mesmo tipo + id) e ordena pela ordem total. */
export function sortPool(items: CatalogItem[], sort: DiscoverSort): CatalogItem[] {
  const unique = [...new Map(items.map((c) => [`${c.media_type}-${c.id}`, c])).values()];

  return unique.sort((a, b) => compareForSort(a, b, sort));
}

/** Fatia da página N (20 títulos) do pool já ordenado. */
export function pageSlice<T>(sorted: T[], page: number): T[] {
  return sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

/**
 * Paginação do universo neutro (já ordenado) depois dos filtros pessoais.
 * Ordem: universo ordenado → remove o que o usuário pediu para não ver → fatia.
 * A ordem relativa dos elegíveis é a neutra; páginas só ficam curtas quando
 * realmente faltam elegíveis. Sem exclusões, é exatamente a paginação neutra.
 */
export function eligiblePage<T>(universe: T[], page: number, excluded: (item: T) => boolean, maxPages = ALL_MAX_PAGES) {
  const eligible = universe.filter((item) => !excluded(item));
  const totalPages = Math.max(1, Math.min(maxPages, Math.ceil(eligible.length / PAGE_SIZE)));
  const current = clampPage(page, totalPages);

  return {
    items: pageSlice(eligible, current),
    page: current,
    total_pages: totalPages,
    eligible_count: eligible.length,
    hidden: universe.length - eligible.length,
  };
}

/* ---------- totais e páginas (honestos) ---------- */
export type TypeTotal = { total_results: number; total_pages: number };

export function totalsFor(type: "all" | MediaType, perType: Partial<Record<MediaType, TypeTotal>>) {
  const entries = Object.values(perType).filter(Boolean) as TypeTotal[];
  const sum = entries.reduce((s, t) => s + t.total_results, 0);
  // o TMDB para de contar em 20.001: a partir daí só sabemos "mais de 20 mil"
  const capped = entries.some((t) => t.total_results >= 20000 || t.total_pages > TMDB_MAX_PAGES);
  const reachable = entries.reduce((s, t) => s + Math.min(t.total_results, TMDB_MAX_PAGES * PAGE_SIZE), 0);
  const maxPages =
    type === "all"
      ? Math.min(ALL_MAX_PAGES, Math.max(1, Math.ceil(reachable / PAGE_SIZE)))
      : Math.min(TMDB_MAX_PAGES, Math.max(1, Math.ceil(reachable / PAGE_SIZE)));
  const floor = entries.reduce((s, t) => s + Math.min(t.total_results, 20000), 0);

  return {
    total_results: sum,
    total_capped: capped,
    total_pages: maxPages,
    /* depth_limited: há mais títulos do que dá para paginar aqui */
    depth_limited: reachable > maxPages * PAGE_SIZE || capped,
    total_label: capped ? `Mais de ${floor.toLocaleString("pt-BR")}` : sum.toLocaleString("pt-BR"),
  };
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, totalPages));
}
