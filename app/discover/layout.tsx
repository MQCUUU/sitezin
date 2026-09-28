import type { Metadata } from "next";

/*
 * V2.1-C — "app/discover/page.tsx" é 'use client' (não pode exportar
 * metadata), mesmo padrão já usado em app/title/[type]/[id]/layout.tsx.
 * "/discover" passa a ser indexável (era noindex por herança do root).
 *
 * Canonical fixo em "/discover", sem query string: os filtros (gênero,
 * ano, provider, etc.) mudam o conteúdo renderizado no client, mas não
 * devem virar milhares de URLs indexáveis separadas — uma única URL
 * canônica evita conteúdo duplicado/thin content aos olhos do Google.
 */
export const metadata: Metadata = {
  title: "Descobrir filmes e séries",
  description:
    "Explore catálogos de filmes e séries por gênero, ano e onde assistir, e descubra o que ver a seguir.",
  robots: { index: true, follow: true },
  alternates: {
    canonical: "/discover",
  },
  openGraph: {
    type: "website",
    title: "Descobrir filmes e séries · MyCatalog",
    description:
      "Explore catálogos de filmes e séries por gênero, ano e onde assistir.",
    url: "/discover",
  },
  twitter: {
    card: "summary",
    title: "Descobrir filmes e séries · MyCatalog",
    description:
      "Explore catálogos de filmes e séries por gênero, ano e onde assistir.",
  },
};

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
