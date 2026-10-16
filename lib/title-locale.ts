/*
 * Página de título — apresentação PT-BR de dados do TMDB (V3.1).
 *
 * O TMDB devolve alguns campos só em inglês/código, mesmo com language=pt-BR:
 *   status               "Released", "Returning Series", "Ended", "Canceled"…
 *   original_language    código ISO 639-1 ("en") — é o IDIOMA ORIGINAL da obra,
 *                        não classificação etária
 *   production_countries nome em inglês ("United States of America") + iso_3166_1
 * Aqui só traduzimos a APRESENTAÇÃO; o dado cru não é alterado. Sem dado
 * confiável, nada é inventado (ex.: certificação etária não é buscada).
 * Puro: testado em scripts/test-title.mjs.
 */

/**
 * Situação da OBRA no TMDB (não é o status pessoal do usuário: uma série pode
 * estar "Cancelada" e você "Assistindo").
 */
const WORK_STATUS: Record<string, { movie: string; tv: string }> = {
  Released: { movie: "Lançado", tv: "Lançada" },
  "Returning Series": { movie: "Em exibição", tv: "Em exibição" },
  Ended: { movie: "Encerrado", tv: "Encerrada" },
  Canceled: { movie: "Cancelado", tv: "Cancelada" },
  "In Production": { movie: "Em produção", tv: "Em produção" },
  "Post Production": { movie: "Em pós-produção", tv: "Em pós-produção" },
  Planned: { movie: "Planejado", tv: "Planejada" },
  Rumored: { movie: "Anunciado", tv: "Anunciada" },
  Pilot: { movie: "Piloto", tv: "Piloto" },
};

export function workStatusLabel(status: unknown, type: "movie" | "tv"): string | null {
  if (typeof status !== "string" || !status.trim()) return null;

  return WORK_STATUS[status]?.[type] ?? null;
}

function displayName(code: string, kind: "language" | "region"): string | null {
  try {
    const name = new Intl.DisplayNames(["pt-BR"], { type: kind }).of(code);

    if (!name || name.toLowerCase() === code.toLowerCase()) return null;

    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

/** "en" → "Inglês"; código desconhecido/ausente → null (nunca mostra o código cru). */
export function languageName(code: unknown): string | null {
  if (typeof code !== "string" || !/^[a-z]{2,3}$/i.test(code)) return null;

  return displayName(code.toLowerCase(), "language");
}

/** production_countries → nomes em PT-BR pelo código ISO; sem código, mantém o nome do TMDB. */
export function countryNames(countries: unknown): string[] {
  if (!Array.isArray(countries)) return [];

  const out: string[] = [];

  for (const country of countries) {
    const record = (country ?? {}) as { iso_3166_1?: unknown; name?: unknown };
    const iso = typeof record.iso_3166_1 === "string" && /^[A-Z]{2}$/i.test(record.iso_3166_1) ? record.iso_3166_1.toUpperCase() : null;
    const name = (iso && displayName(iso, "region")) || (typeof record.name === "string" ? record.name : null);

    if (name && !out.includes(name)) out.push(name);
  }

  return out;
}

/** Duração de filme: 135 → "2h 15min"; 45 → "45min". */
export function runtimeLabel(minutes: unknown): string | null {
  const m = Number(minutes);

  if (!Number.isFinite(m) || m <= 0) return null;

  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);

  return h > 0 ? `${h}h ${rest}min` : `${rest}min`;
}

/* --------------------------------------------------------------- sinopse */

type Translation = { iso_639_1?: unknown; iso_3166_1?: unknown; data?: { overview?: unknown } };

/**
 * Sinopse quando a pt-BR vem vazia: pt-PT → inglês (EUA primeiro) → idioma
 * original. Devolve o texto e o idioma (para a UI dizer em que idioma está).
 * Nada encontrado → null (melhor "Sem sinopse" do que inventar/traduzir).
 */
export function pickOverviewFallback(translations: unknown, originalLanguage: unknown): { overview: string; language: string } | null {
  const list = (Array.isArray((translations as { translations?: unknown })?.translations) ? (translations as { translations: Translation[] }).translations : [])
    .map((t) => ({
      lang: typeof t?.iso_639_1 === "string" ? t.iso_639_1 : "",
      region: typeof t?.iso_3166_1 === "string" ? t.iso_3166_1 : "",
      overview: typeof t?.data?.overview === "string" ? t.data.overview.trim() : "",
    }))
    .filter((t) => t.overview);
  const find = (lang: string, region?: string) => list.find((t) => t.lang === lang && (!region || t.region === region));
  const original = typeof originalLanguage === "string" ? originalLanguage : "";
  const hit = find("pt", "BR") || find("pt", "PT") || find("pt") || find("en", "US") || find("en") || (original ? find(original) : undefined);

  return hit ? { overview: hit.overview, language: hit.lang } : null;
}

/* --------------------------------------------------------------- trailer */

type Video = { site?: unknown; type?: unknown; official?: unknown; key?: unknown; name?: unknown; iso_639_1?: unknown };

/**
 * Melhor vídeo do YouTube: trailer oficial > trailer > teaser > qualquer;
 * dentro de cada nível, PT-BR (pt) antes de inglês, antes do resto.
 */
export function pickTrailer(videos: unknown): { key: string; name: string } | null {
  const list = (Array.isArray((videos as { results?: unknown })?.results) ? (videos as { results: Video[] }).results : [])
    .filter((v) => v && v.site === "YouTube" && typeof v.key === "string" && v.key);

  if (!list.length) return null;

  const tier = (v: Video) => (v.type === "Trailer" && v.official === true ? 0 : v.type === "Trailer" ? 1 : v.type === "Teaser" ? 2 : 3);
  const lang = (v: Video) => (v.iso_639_1 === "pt" ? 0 : v.iso_639_1 === "en" ? 1 : 2);
  const best = [...list].sort((a, b) => tier(a) - tier(b) || lang(a) - lang(b))[0];

  return { key: String(best.key), name: typeof best.name === "string" && best.name ? best.name : "Trailer" };
}
