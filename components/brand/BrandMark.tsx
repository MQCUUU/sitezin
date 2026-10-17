import {
  BRAND_BASE,
  BRAND_EDGE,
  BRAND_INK,
  BRAND_PILLARS,
  BRAND_STROKE_PATH,
  BRAND_STROKE_WIDTH,
  BRAND_VIEWBOX,
} from "@/lib/brand";

/*
 * V3.5 — símbolo MyCatalog na interface (geometria única: lib/brand.ts).
 * O traço central usa var(--accent): acompanha a cor de destaque e o tema
 * na hora, sem JS. Decorativo por padrão (aria-hidden) — quem o usa sozinho
 * como controle precisa dar nome acessível ao controle.
 */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className ? `brand-mark ${className}` : "brand-mark"}
      width={size}
      height={size}
      viewBox={BRAND_VIEWBOX}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="62" height="62" rx="15" fill={BRAND_BASE} stroke={BRAND_EDGE} strokeWidth="2" />
      {BRAND_PILLARS.map((pillar) => (
        <rect key={pillar.x} {...pillar} fill={BRAND_INK} />
      ))}
      <path
        d={BRAND_STROKE_PATH}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={BRAND_STROKE_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Lockup oficial: [símbolo] MyCatalog. O nome tem cor fixa; a personalização fica no traço do símbolo. */
export function BrandLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={className ? `brand-logo ${className}` : "brand-logo"}>
      <BrandMark size={size} />
      <span className="brand-wordmark">MyCatalog</span>
    </span>
  );
}
