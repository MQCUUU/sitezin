/*
 * FONTE ÚNICA da marca MyCatalog (Projeção, Fase 1 — símbolo Dobra). Puro (sem
 * DOM): usado pelo componente BrandMark, pela imagem social (OG) e pelos ícones
 * estáticos. Testado em scripts/test-brand.mjs.
 *
 * Símbolo: o M é uma fita só, dobrada três vezes — quatro faces planas que
 * alternam frente (âmbar MyCatalog) e verso (âmbar fechado). Sem degradê. No
 * logotipo ele é o M da palavra: [M]yCatalog. A cor é FIXA (não existe mais
 * cor escolhida pelo usuário). Estudo completo no artifact de marca.
 */

/** Âmbar MyCatalog (frente da fita) — também o --accent do tema escuro. */
export const BRAND_AMBER = "#f39a2b";
/** Verso da fita: o mesmo âmbar, mais fechado. */
export const BRAND_AMBER_BACK = "#b7630e";
/** Sala: fundo da marca (placa do ícone, tema do app instalado). */
export const BRAND_ROOM = "#121113";

/** Geometria na grade da maiúscula (viewBox 0 0 100 100). Ordem de pintura: verso, depois frente. */
export const BRAND_VIEWBOX = "0 0 100 100";
export const BRAND_FACES = {
  back: ["0,0 24,0 63,72 39,72", "76,0 100,0 100,100 76,100"],
  front: ["0,0 24,0 24,100 0,100", "76,0 100,0 61,72 37,72"],
} as const;

/** Favicon: desenho próprio na grade de 16 px (faces presas aos pixels). */
const FAVICON_FACES = {
  back: ["2,2 5,2 9.6,10.5 6.6,10.5", "11,2 14,2 14,14 11,14"],
  front: ["2,2 5,2 5,14 2,14", "11,2 14,2 9.4,10.5 6.4,10.5"],
} as const;

const polys = (points: readonly string[], fill: string, extra = "") =>
  points.map((p) => `<polygon points="${p}" fill="${fill}"${extra}/>`).join("");

export type BrandMarkOptions = {
  /** "color" (padrão), "mono-light" (preto sobre branco) ou "mono-dark" (branco sobre preto). */
  variant?: "color" | "mono-light" | "mono-dark";
  /** Placa Sala com cantos arredondados (ícone de app). */
  tile?: boolean;
  /** Placa sem cantos e símbolo menor (ícone "maskable": desenho dentro da zona segura). */
  safeZone?: boolean;
  size?: number;
};

/**
 * SVG do símbolo. Nas variantes de uma cor, a dobra aparece por um corte: as
 * faces da frente ganham um contorno na cor do fundo que as separa do verso.
 */
export function brandMarkSvg(options: BrandMarkOptions = {}): string {
  const variant = options.variant ?? "color";
  const size = options.size ?? 64;
  const ink = variant === "mono-light" ? "#000000" : "#ffffff";
  const paper = variant === "mono-light" ? "#ffffff" : "#000000";

  const faces =
    variant === "color"
      ? polys(BRAND_FACES.back, BRAND_AMBER_BACK) + polys(BRAND_FACES.front, BRAND_AMBER)
      : polys(BRAND_FACES.back, ink) + polys(BRAND_FACES.front, ink, ` stroke="${paper}" stroke-width="7" paint-order="stroke"`);

  if (!options.tile && !options.safeZone) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-4 -4 108 108">${faces}</svg>`;
  }

  const plate = variant === "color" ? BRAND_ROOM : paper;
  const tile = options.safeZone
    ? `<rect width="64" height="64" fill="${plate}"/>`
    : `<rect width="64" height="64" rx="14" fill="${plate}"/>`;
  // Ícone: o símbolo ocupa ~53% da placa (maskable: ~44%, dentro do círculo seguro).
  const scale = options.safeZone ? 0.28 : 0.34;
  const offset = (64 - 100 * scale) / 2;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">` +
    tile +
    `<g transform="translate(${offset} ${offset}) scale(${scale})">${faces}</g></svg>`
  );
}

/** Favicon estático (app/icon.svg): placa Sala + Dobra na grade de 16 px. */
export function brandFaviconSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16">` +
    `<rect width="16" height="16" rx="3.5" fill="${BRAND_ROOM}"/>` +
    polys(FAVICON_FACES.back, BRAND_AMBER_BACK) +
    polys(FAVICON_FACES.front, BRAND_AMBER) +
    `</svg>`
  );
}
