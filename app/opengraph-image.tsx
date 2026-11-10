import { ImageResponse } from "next/og";

import { BRAND_ROOM, brandMarkSvg } from "@/lib/brand";

/*
 * Imagem social oficial para páginas sem imagem própria (Início, Descobrir…).
 * Título, coleção e perfil continuam com imagens reais (pôster/backdrop).
 *
 * Projeção (Fase 1): símbolo Dobra da fonte única (lib/brand.ts) como o M do
 * nome, sobre a Sala, sem brilho nem degradê. Tudo centralizado: sobrevive ao
 * corte quadrado de WhatsApp/Telegram.
 */
// Runtime Node (padrão): o Edge está obsoleto e impedia a geração estática da imagem.
export const alt = "MyCatalog — seu catálogo pessoal de filmes e séries";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const mark = `data:image/svg+xml;base64,${btoa(brandMarkSvg({ size: 200 }))}`;

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
          background: BRAND_ROOM,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={76} height={76} alt="" style={{ marginBottom: 14, marginRight: 4 }} />
          <div style={{ display: "flex", fontSize: 104, fontWeight: 800, letterSpacing: -3, color: "#eeeae3", lineHeight: 1 }}>
            yCatalog
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 26, fontSize: 32, color: "#a29d95" }}>
          Seu catálogo pessoal de filmes e séries.
        </div>
      </div>
    ),
    { ...size }
  );
}
