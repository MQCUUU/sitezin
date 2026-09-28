import type { MetadataRoute } from "next";

/*
 * V2.1-C — "icons" estava ausente (nenhum asset de marca existia no
 * projeto). "app/icon.svg" (novo) é um monograma geométrico simples
 * — quadrado arredondado + triângulo de "play", nas cores da marca —
 * que o Next já usa automaticamente para o favicon; referenciado aqui
 * também para o manifest do PWA. SVG único, sem gerar PNGs em
 * múltiplos tamanhos (evita instalar ferramenta de imagem só para
 * isso) — navegadores modernos aceitam SVG em `icons` do manifest.
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
    theme_color: "#8b5cf6",
    lang: "pt-BR",
    orientation: "any",
    categories: [
      "entertainment",
      "lifestyle",
    ],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}