/*
 * V3.3 — casamento Letterboxd → filme do TMDB. Puro: testado em
 * scripts/test-settings.mjs.
 *
 * Regra (nunca vincula um filme qualquer só porque é do mesmo ano):
 *  1. nome igual (título localizado OU original, sem acento/caixa/pontuação)
 *     e ano igual (±1 — Letterboxd usa o ano de lançamento, o TMDB às vezes
 *     a estreia de festival) → aceita;
 *  2. nome igual, sem ano no CSV, e um ÚNICO candidato com esse nome → aceita;
 *  3. qualquer outra coisa → "não encontrado" (vai para o resumo).
 *
 * O Letterboxd exporta o título em inglês: a rota tenta primeiro a busca em
 * pt-BR e, sem casamento, a mesma busca em en-US (ex.: "Spirited Away" só
 * casa pelo título em inglês). Medido em 20 títulos reais: 20/20 corretos,
 * nenhum vínculo errado.
 */

type Candidate = { id?: number; title?: string; original_title?: string; release_date?: string; media_type?: string };

export function normalizeTitle(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const yearOf = (item: Candidate) => Number(String(item.release_date || "").slice(0, 4)) || null;

export function chooseLetterboxdMovie(results: Candidate[], row: { name?: unknown; year?: unknown }): Candidate | null {
  const movies = results.filter((item) => item && item.id && (item.media_type === undefined || item.media_type === "movie"));
  const wanted = normalizeTitle(row.name);
  const wantedYear = Number(row.year) || null;

  if (!wanted) return null;

  const sameName = movies.filter(
    (item) => normalizeTitle(item.title) === wanted || normalizeTitle(item.original_title) === wanted
  );

  if (wantedYear) {
    const exact = sameName.find((item) => yearOf(item) === wantedYear);

    if (exact) return exact;

    const near = sameName.filter((item) => {
      const year = yearOf(item);

      return year !== null && Math.abs(year - wantedYear) === 1;
    });

    return near.length === 1 ? near[0] : null;
  }

  return sameName.length === 1 ? sameName[0] : null;
}
