import type { Metadata } from "next";

/*
 * I1 — mesmo padrão de app/title/[type]/[id]/layout.tsx. Usa só o
 * endpoint leve `/collection/{id}` do TMDB (nome/overview/poster), não a
 * rota interna `/api/collection/[id]` (que resolve N+1 de cada filme da
 * coleção — pesada demais só para gerar metadata).
 */

const TMDB_BASE = "https://api.themoviedb.org/3";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return { title: "Coleção não encontrada" };
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return {};

  try {
    const language = process.env.TMDB_LANGUAGE || "pt-BR";
    const response = await fetch(
      `${TMDB_BASE}/collection/${id}?language=${encodeURIComponent(language)}&api_key=${encodeURIComponent(apiKey)}`,
      { next: { revalidate: 21600 } }
    );

    if (!response.ok) return { title: "Coleção não encontrada" };
    const data = await response.json();

    const name: string = data?.name || "Coleção";
    const overview: string =
      data?.overview?.trim() || `Veja todos os filmes de ${name} no MyCatalog.`;
    const description =
      overview.length > 155 ? `${overview.slice(0, 152).trimEnd()}...` : overview;

    const image = data?.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}`
      : data?.poster_path
        ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
        : undefined;

    return {
      title: name,
      description,
      // app/robots.ts já bloqueia /collection/ explicitamente — mantém
      // noindex aqui também, coerente com essa decisão já tomada.
      robots: { index: false, follow: true },
      alternates: { canonical: `/collection/${id}` },
      openGraph: {
        type: "website",
        title: name,
        description,
        url: `/collection/${id}`,
        images: image ? [{ url: image, width: 780, alt: name }] : undefined,
      },
      twitter: {
        card: image ? "summary_large_image" : "summary",
        title: name,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return {};
  }
}

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
