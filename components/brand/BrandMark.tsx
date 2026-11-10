import { BRAND_AMBER, BRAND_AMBER_BACK, BRAND_FACES, BRAND_VIEWBOX } from "@/lib/brand";

/*
 * Símbolo MyCatalog — Dobra (geometria única: lib/brand.ts). Cor fixa da marca.
 * Decorativo por padrão (aria-hidden): quem o usa sozinho como controle dá o
 * nome acessível ao controle.
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
      {BRAND_FACES.back.map((points) => (
        <polygon key={points} points={points} fill={BRAND_AMBER_BACK} />
      ))}
      {BRAND_FACES.front.map((points) => (
        <polygon key={points} points={points} fill={BRAND_AMBER} />
      ))}
    </svg>
  );
}

/**
 * Logotipo: o símbolo é o M da palavra — [M]yCatalog. `size` é o tamanho da
 * fonte do nome em px; o símbolo acompanha a altura da maiúscula (styles/brand.css).
 */
export function BrandLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className ? `brand-logo ${className}` : "brand-logo"}
      role="img"
      aria-label="MyCatalog"
      style={{ fontSize: size }}
    >
      <BrandMark className="brand-logo-mark" />
      <span className="brand-wordmark" aria-hidden="true">
        yCatalog
      </span>
    </span>
  );
}
