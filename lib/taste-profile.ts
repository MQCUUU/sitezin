/*
 * V2.3 — "cérebro" de gosto compartilhado (puro, sem rede/banco).
 *
 * Antes cada recomendador tinha uma heurística própria e genérica
 * (TMDB popular + nota): "Escolha pra mim", "Sugerir agora" e o Assistente
 * não aprendiam com o que o usuário realmente assistiu, avaliou e abandonou.
 * Agora todos partem do mesmo perfil, calculado só da biblioteca:
 *
 *  peso do título = status + nota + favorito
 *    watched 1 · rewatched/rewatching 1,4 · watching 0,7 · want 0,25 ·
 *    paused 0 · dropped −1,2
 *    nota: (nota − 6,5) / 1,75, limitada a ±2     favorito: +1,2
 *
 *  afinidade de gênero = Σ pesos / (qtd + 3)   (amortecida: 1 título não
 *  define gosto), normalizada para −1..1.
 */

export type TasteRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  status: string;
  favorite: boolean;
  personal_rating: number | null;
  genres: string[];
};

export type TasteSeed = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  weight: number;
};

export type TasteProfile = {
  size: number;
  affinity: Record<string, number>;
  topGenres: string[];
  avoidGenres: string[];
  seeds: TasteSeed[];
  /** `${media_type}-${tmdb_id}` de TUDO que está na biblioteca. */
  owned: Set<string>;
  statusByKey: Map<string, string>;
};

const STATUS_BASE: Record<string, number> = {
  watched: 1,
  rewatched: 1.4,
  rewatching: 1.4,
  watching: 0.7,
  want: 0.25,
  paused: 0,
  dropped: -1.2,
};

export function tasteKey(type: string, id: number | string): string {
  return `${type}-${Number(id)}`;
}

export function titleWeight(row: Pick<TasteRow, "status" | "favorite" | "personal_rating">): number {
  let weight = STATUS_BASE[row.status] ?? 0;

  if (row.personal_rating !== null && row.personal_rating !== undefined && Number.isFinite(Number(row.personal_rating))) {
    weight += Math.max(-2, Math.min(2, (Number(row.personal_rating) - 6.5) / 1.75));
  }

  if (row.favorite) weight += 1.2;

  return weight;
}

export function buildTasteProfile(rows: TasteRow[]): TasteProfile {
  const sums = new Map<string, { sum: number; count: number }>();
  const owned = new Set<string>();
  const statusByKey = new Map<string, string>();
  const weighted: TasteSeed[] = [];

  for (const row of rows) {
    const key = tasteKey(row.media_type, row.tmdb_id);
    owned.add(key);
    statusByKey.set(key, row.status);

    const weight = titleWeight(row);

    if (weight >= 1.8) {
      weighted.push({ tmdb_id: row.tmdb_id, media_type: row.media_type, title: row.title, weight });
    }

    if (weight === 0) continue;

    for (const genre of new Set(row.genres ?? [])) {
      const entry = sums.get(genre) ?? { sum: 0, count: 0 };
      entry.sum += weight;
      entry.count += 1;
      sums.set(genre, entry);
    }
  }

  const raw = new Map<string, number>();
  let maxAbs = 0;

  for (const [genre, { sum, count }] of sums) {
    const value = sum / (count + 3);
    raw.set(genre, value);
    maxAbs = Math.max(maxAbs, Math.abs(value));
  }

  const affinity: Record<string, number> = {};

  if (maxAbs > 0) {
    for (const [genre, value] of raw) affinity[genre] = Number((value / maxAbs).toFixed(3));
  }

  const entries = Object.entries(affinity);

  return {
    size: rows.length,
    affinity,
    topGenres: entries
      .filter(([, v]) => v >= 0.25)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([g]) => g),
    avoidGenres: entries
      .filter(([, v]) => v <= -0.25)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 4)
      .map(([g]) => g),
    seeds: weighted.sort((a, b) => b.weight - a.weight).slice(0, 6),
    owned,
    statusByKey,
  };
}

/** Encaixe de gênero de um candidato: −1..1 (média ponderada pelos gêneros que o usuário conhece). */
export function genreFit(profile: TasteProfile, genres: string[]): number {
  const known = genres.filter((genre) => genre in profile.affinity);

  if (known.length === 0) return 0;

  const sum = known.reduce((total, genre) => total + profile.affinity[genre], 0);

  // Média, com um bônus pequeno por casar com mais de um gênero favorito.
  return Math.max(-1, Math.min(1, sum / known.length + (known.filter((g) => profile.affinity[g] > 0.25).length - 1) * 0.08));
}

export type PersonalScore = {
  /** Pontos somados ao score base do candidato. */
  points: number;
  reasons: string[];
  because: string[];
};

/**
 * Bônus pessoal de um candidato. `becauseSeeds` = títulos curtidos cujas
 * recomendações do TMDB incluíram este candidato (sinal mais forte que gênero).
 */
export function personalBonus(
  profile: TasteProfile,
  candidate: { genres: string[] },
  becauseSeeds: string[] = []
): PersonalScore {
  const reasons: string[] = [];
  const fit = genreFit(profile, candidate.genres);
  let points = 0;

  if (becauseSeeds.length > 0) {
    points += Math.min(36, 16 + (becauseSeeds.length - 1) * 10);
    const shown = becauseSeeds.slice(0, 2).join(" e ");
    reasons.push(`Parecido com ${shown}, que você curtiu`);
  }

  if (fit > 0.2) {
    points += fit * 22;
    const matched = candidate.genres.filter((genre) => (profile.affinity[genre] ?? 0) > 0.25).slice(0, 2);

    if (matched.length) reasons.push(`Combina com ${matched.join(" e ")}, gêneros que você avalia bem`);
  } else if (fit < -0.2) {
    points += fit * 26; // fit negativo = penalidade
  }

  return { points, reasons, because: becauseSeeds };
}
