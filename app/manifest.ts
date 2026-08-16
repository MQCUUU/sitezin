import type { MetadataRoute } from "next";

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
  };
}