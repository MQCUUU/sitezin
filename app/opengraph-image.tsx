import { ImageResponse } from "next/og";

/*
 * V2.1-C — imagem OG de marca para páginas que não têm uma própria
 * (Home, Discover). Título/coleção/perfil já têm `images` dinâmicas
 * reais (pôster/backdrop do TMDB) no próprio `openGraph`, então não
 * usam este fallback. Gerada via `next/og` (nativo do Next, sem
 * dependência nova) — não reutiliza pôster de filme aleatório como
 * imagem de marca, como o enunciado pediu para evitar.
 */
export const runtime = "edge";
export const alt = "MyCatalog — Filmes, séries e seu histórico em um só lugar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          background: "#090b10",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <svg width="96" height="96" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="#11151d" />
            <path d="M24 18 L46 32 L24 46 Z" fill="#8b5cf6" />
          </svg>

          <div style={{ display: "flex", fontSize: 72, fontWeight: 900, color: "#f6f7fb" }}>
            My<span style={{ color: "#8b5cf6" }}>Catalog</span>
          </div>
        </div>

        <div style={{ marginTop: 28, fontSize: 28, color: "#929aaa" }}>
          Filmes, séries e seu histórico em um só lugar
        </div>
      </div>
    ),
    { ...size }
  );
}
