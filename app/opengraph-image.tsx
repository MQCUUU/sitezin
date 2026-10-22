import { ImageResponse } from "next/og";

import { BRAND_ACCENT, brandMarkSvg } from "@/lib/brand";

/*
 * Imagem social oficial (V2.1-C; marca V3.5) para páginas sem imagem
 * própria (Home, Descobrir…). Título, coleção e perfil continuam com
 * imagens reais (pôster/backdrop) no próprio openGraph.
 *
 * V3.5: símbolo da fonte única (lib/brand.ts — antes um SVG duplicado aqui),
 * nome em cor fixa, uma frase, e um brilho discreto no destaque oficial.
 * Tudo centralizado: sobrevive ao corte quadrado de WhatsApp/Telegram.
 */
// Fase 7: runtime Node (padrão). O Edge está obsoleto e impedia a geração estática da imagem.
export const alt = "MyCatalog — seu catálogo pessoal de filmes e séries";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const mark = `data:image/svg+xml;base64,${btoa(brandMarkSvg({ size: 176 }))}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `radial-gradient(circle at 50% 38%, ${BRAND_ACCENT}33 0%, #090b10 58%)`,
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark} width={176} height={176} alt="" />

        <div style={{ display: "flex", marginTop: 34, fontSize: 84, fontWeight: 800, letterSpacing: -2, color: "#f6f7fb" }}>
          MyCatalog
        </div>

        <div style={{ display: "flex", marginTop: 14, fontSize: 32, color: "#a3abba" }}>
          Seu catálogo pessoal de filmes e séries.
        </div>
      </div>
    ),
    { ...size }
  );
}
