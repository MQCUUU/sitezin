/*
 * Fase 5 — utilitários das metadatas de compartilhamento (pessoa, episódio,
 * lista). Puro: testado em scripts/test-share-metadata.mjs.
 */
import { episodeCode } from "./diary/copy";

/**
 * Imagem padrão do app (app/opengraph-image.tsx). Quando o segmento define
 * `openGraph`, o Next deixa de herdar a imagem padrão; sem foto/capa própria,
 * o card usaria nenhuma imagem — então a referenciamos explicitamente.
 */
export const DEFAULT_SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "MyCatalog — seu catálogo pessoal de filmes e séries",
};

/** Recorte de ~155 caracteres, sem cortar no meio da palavra (agregadores truncam feio). */
export function clip(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Texto próprio quando existe; senão, o resumo padrão. */
export function shareDescription(text: string | null | undefined, fallback: string): string {
  const own = typeof text === "string" ? text.trim() : "";
  return clip(own || fallback);
}

export function episodeShareTitle(input: {
  showName: string;
  season: number;
  episode: number;
  episodeName?: string | null;
}): string {
  // "T1:E03" — mesma notação da Home e do Diário.
  const code = episodeCode({ season: input.season, episode: input.episode });
  const name = input.episodeName?.trim();
  // TMDB devolve "Episódio 3" quando não há título; não repete o número.
  const hasOwnName = name && !/^epis[oó]dio\s+\d+$/i.test(name);
  return hasOwnName ? `${code} — ${name} | ${input.showName}` : `${code} | ${input.showName}`;
}

export function listShareDescription(input: {
  description?: string | null;
  itemCount: number;
  ownerUsername?: string | null;
}): string {
  const count = input.itemCount === 1 ? "1 título" : `${input.itemCount} títulos`;
  const by = input.ownerUsername ? ` por @${input.ownerUsername}` : "";
  return shareDescription(input.description, `Lista com ${count}${by} no MyCatalog.`);
}
