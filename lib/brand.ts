/*
 * V3.5 — FONTE ÚNICA da marca MyCatalog. Puro (sem DOM): usado pelo
 * componente BrandMark, pelo favicon dinâmico, pela imagem social (OG) e
 * pelos ícones estáticos. Testado em scripts/test-brand.mjs.
 *
 * Símbolo: monograma de moldura — um M formado por dois pôsteres verticais
 * (forma FIXA da marca) com o traço central em V. Só o traço central recebe
 * a cor de destaque do usuário; placa, pilares, proporção e silhueta nunca
 * mudam. Sem o roxo continua sendo MyCatalog (funciona em monocromia).
 */

/** Destaque oficial da marca (= padrão de Aparência): assets estáticos, OG e sem preferência. */
export const BRAND_ACCENT = "#8b5cf6";

/** Base fixa da marca: placa escura com borda sutil — visível em barra de abas clara e escura. */
export const BRAND_BASE = "#0b0d12";
export const BRAND_EDGE = "#2b313d";
export const BRAND_INK = "#f4f5f8";

/** Geometria (viewBox 0 0 64 64). */
export const BRAND_VIEWBOX = "0 0 64 64";
export const BRAND_PILLARS = [
  { x: 13, y: 15, width: 10, height: 34, rx: 3 },
  { x: 41, y: 15, width: 10, height: 34, rx: 3 },
] as const;
/** O traço central (o ÚNICO elemento personalizável). */
export const BRAND_STROKE_PATH = "M23 18 L32 33 L41 18";
export const BRAND_STROKE_WIDTH = 8;

const HEX = /^#[0-9a-f]{6}$/i;

/** Só aceita #rrggbb; qualquer outra coisa vira o destaque oficial (nunca injeta texto no SVG). */
export function brandAccent(value: unknown): string {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : BRAND_ACCENT;
}

export type BrandMarkOptions = {
  accent?: unknown;
  /** "color" (padrão), "mono-light" (preto sobre branco) ou "mono-dark" (branco sobre preto). */
  variant?: "color" | "mono-light" | "mono-dark";
  /** Sem a placa: só pilares + traço (para fundos já escuros, ex.: cartão OG). */
  bare?: boolean;
  /** Margem interna extra (ícone "maskable": desenho dentro da zona segura). */
  safeZone?: boolean;
  size?: number;
};

export function brandMarkSvg(options: BrandMarkOptions = {}): string {
  const variant = options.variant ?? "color";
  const accent = variant === "color" ? brandAccent(options.accent) : variant === "mono-light" ? "#000000" : "#ffffff";
  const base = variant === "mono-light" ? "#ffffff" : variant === "mono-dark" ? "#000000" : BRAND_BASE;
  const edge = variant === "mono-light" ? "#000000" : variant === "mono-dark" ? "#000000" : BRAND_EDGE;
  const ink = variant === "mono-light" ? "#000000" : variant === "mono-dark" ? "#ffffff" : BRAND_INK;
  const size = options.size ?? 64;
  // Zona segura do ícone maskable: o desenho encolhe para ~70% no centro; a placa cobre tudo.
  const glyph = options.safeZone ? `<g transform="translate(9.6 9.6) scale(.7)">` : "<g>";
  const tile = options.bare
    ? ""
    : options.safeZone
      ? `<rect width="64" height="64" fill="${base}"/>`
      : `<rect x="1" y="1" width="62" height="62" rx="15" fill="${base}" stroke="${edge}" stroke-width="2"/>`;
  const pillars = BRAND_PILLARS.map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${p.rx}" fill="${ink}"/>`).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${BRAND_VIEWBOX}">` +
    tile +
    glyph +
    pillars +
    `<path d="${BRAND_STROKE_PATH}" fill="none" stroke="${accent}" stroke-width="${BRAND_STROKE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `</g></svg>`
  );
}

/** data: URL do favicon para um destaque (SVG pequeno, ~700 bytes). */
export function brandFaviconHref(accent: unknown): string {
  return `data:image/svg+xml,${encodeURIComponent(brandMarkSvg({ accent }))}`;
}

/** Destaque oficial → o favicon estático (/icon.svg) já serve; nada a trocar. */
export function needsDynamicFavicon(accent: unknown): boolean {
  return brandAccent(accent) !== BRAND_ACCENT;
}
