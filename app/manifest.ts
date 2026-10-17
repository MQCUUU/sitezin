import type { MetadataRoute } from "next";

/*
 * V3.5 — ícones oficiais da marca (gerados de lib/brand.ts, em public/brand/):
 * SVG para "any" (nítido em qualquer tamanho), PNG 192/512 para quem não lê
 * SVG no manifest e um PNG "maskable" próprio, com o desenho dentro da zona
 * segura (antes o mesmo SVG servia de maskable e era cortado no Android).
 *
 * theme_color = base escura da marca (a mesma do tema padrão), não o
 * destaque: a barra do app instalado não deve mudar de cor por usuário.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyCatalog — Filmes e Séries",
    short_name: "MyCatalog",
    description:
      "Organize sua biblioteca de filmes e séries, acompanhe o que assistiu e descubra novos títulos.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#090b10",
    lang: "pt-BR",
    orientation: "any",
    categories: [
      "entertainment",
      "lifestyle",
    ],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
