import type { Metadata } from "next";
import { detailsTMDB, img } from "@/lib/tmdb";
import { getSiteUrl } from "@/lib/site-url";

/*
 * ============================================================
 * ARQUIVO NOVO — não substitui nada.
 *
 * O PROBLEMA
 *   app/title/[type]/[id]/page.tsx tem 2.644 linhas e é
 *   'use client'. Client Component não pode exportar
 *   generateMetadata. Resultado: a principal página pública do
 *   app compartilha o <title> genérico "MyCatalog" com todas
 *   as outras, e um link colado no WhatsApp mostra card vazio.
 *
 * A SOLUÇÃO SEM RISCO
 *   Um layout.tsx no mesmo segmento de rota. Layouts SÃO
 *   Server Components por padrão e PODEM exportar
 *   generateMetadata — que se aplica à página que eles
 *   envolvem.
 *
 *   Ou seja: a página de título ganha SEO completo sem que
 *   uma única linha das 2.644 seja tocada.
 *
 *   O `children` passa direto. Este layout não renderiza
 *   nenhum elemento próprio, então o HTML final e o CSS
 *   continuam exatamente iguais.
 *
 * O QUE ISTO **NÃO** RESOLVE
 *   O conteúdo da página continua sendo renderizado no
 *   cliente. O Google lê o <title> e o Open Graph daqui, mas
 *   o corpo da página ainda chega vazio no HTML inicial.
 *   Converter a página em Server Component é o Lote 3.
 * ============================================================
 */

type Props = {
  params: Promise<{ type: string; id: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { type, id } = await params;

  if (type !== "movie" && type !== "tv") {
    return { title: "Título não encontrado" };
  }

  try {
    const data = await detailsTMDB(type, id);

    const name: string =
      data?.title || data?.name || "Título";

    const year = String(
      data?.release_date || data?.first_air_date || ""
    ).slice(0, 4);

    const heading = year ? `${name} (${year})` : name;

    const overview: string =
      data?.overview?.trim() ||
      `Veja detalhes, elenco e onde assistir ${name} no MyCatalog.`;

    /*
     * Recorte curto: descrições longas são truncadas pelos
     * agregadores de forma feia, no meio de uma palavra.
     */
    const description =
      overview.length > 155
        ? `${overview.slice(0, 152).trimEnd()}...`
        : overview;

    /*
     * w780 é o tamanho recomendado para card social. O backdrop
     * (horizontal) funciona melhor que o pôster (vertical) no
     * formato summary_large_image.
     */
    const image = data?.backdrop_path
      ? img(data.backdrop_path, "w780")
      : data?.poster_path
        ? img(data.poster_path, "w500")
        : undefined;

    return {
      title: heading,
      description,

      /*
       * Páginas de título SÃO públicas e devem ser indexadas —
       * ao contrário do resto do app, bloqueado no layout raiz.
       */
      robots: { index: true, follow: true },

      alternates: {
        canonical: `/title/${type}/${id}`,
      },

      openGraph: {
        type: type === "movie" ? "video.movie" : "video.tv_show",
        title: heading,
        description,
        url: `/title/${type}/${id}`,
        images: image
          ? [{ url: image, width: 780, alt: name }]
          : undefined,
      },

      twitter: {
        card: image ? "summary_large_image" : "summary",
        title: heading,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    /*
     * TMDB fora do ar ou id inválido não pode derrubar a
     * página — cai no metadata do layout raiz.
     */
    return {};
  }
}

/*
 * V2.1-C — JSON-LD (schema.org Movie/TVSeries), server-rendered.
 *
 * Só campos com dado real do TMDB — nada inventado:
 * - `aggregateRating` usa `vote_average`/`vote_count` do TMDB (nota e
 *   contagem PÚBLICAS do TMDB, nunca a nota pessoal do usuário
 *   logado, que nem chega a este componente). Só emitido quando
 *   `vote_count > 0` — sem isso seria um AggregateRating vazio/
 *   enganoso.
 * - `sameAs` só quando dá para montar a URL real do TMDB (sempre dá,
 *   já que `type`/`id` vêm da própria rota).
 * - `actor`/`director`/`creator` só com os nomes que o TMDB retornou
 *   em `credits` (já buscado por `detailsTMDB`, sem fetch extra).
 */
type JsonLdMovieOrSeries = Record<string, unknown>;

function buildJsonLd(
  type: "movie" | "tv",
  id: string,
  data: any
): JsonLdMovieOrSeries | null {
  if (!data) return null;

  const name: string = data.title || data.name || "";
  if (!name) return null;

  const siteUrl = getSiteUrl();
  const image = data.poster_path
    ? img(data.poster_path, "w500")
    : data.backdrop_path
      ? img(data.backdrop_path, "w780")
      : undefined;

  const cast = Array.isArray(data.credits?.cast)
    ? data.credits.cast
        .slice(0, 10)
        .map((person: any) => person?.name)
        .filter(Boolean)
    : [];

  const jsonLd: JsonLdMovieOrSeries = {
    "@context": "https://schema.org",
    "@type": type === "movie" ? "Movie" : "TVSeries",
    name,
    url: `${siteUrl}/title/${type}/${id}`,
    sameAs: `https://www.themoviedb.org/${type}/${id}`,
  };

  if (data.overview?.trim()) jsonLd.description = data.overview.trim();
  if (image) jsonLd.image = image;

  const dateField = type === "movie" ? data.release_date : data.first_air_date;
  if (dateField) jsonLd.datePublished = dateField;

  if (Array.isArray(data.genres) && data.genres.length > 0) {
    jsonLd.genre = data.genres.map((genre: any) => genre?.name).filter(Boolean);
  }

  if (cast.length > 0) {
    jsonLd.actor = cast.map((personName: string) => ({
      "@type": "Person",
      name: personName,
    }));
  }

  if (type === "movie") {
    const director = Array.isArray(data.credits?.crew)
      ? data.credits.crew.find((person: any) => person?.job === "Director")
      : null;
    if (director?.name) {
      jsonLd.director = { "@type": "Person", name: director.name };
    }
  } else {
    const creators = Array.isArray(data.created_by)
      ? data.created_by.map((person: any) => person?.name).filter(Boolean)
      : [];
    if (creators.length > 0) {
      jsonLd.creator = creators.map((personName: string) => ({
        "@type": "Person",
        name: personName,
      }));
    }
  }

  // Nota pública do TMDB, nunca a nota pessoal do usuário — só emitida
  // com contagem real (vote_count > 0), documentando a origem.
  const voteAverage = Number(data.vote_average || 0);
  const voteCount = Number(data.vote_count || 0);
  if (voteAverage > 0 && voteCount > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: voteAverage,
      ratingCount: voteCount,
      bestRating: 10,
      worstRating: 0,
    };
  }

  return jsonLd;
}

/**
 * Serialização segura: escapa `<` para que um `overview`/nome contendo
 * literalmente "</script>" não feche a tag e injete HTML/JS arbitrário
 * (o JSON em si já teria as aspas escapadas pelo JSON.stringify — o
 * risco real é só essa sequência de fechamento de tag).
 */
function safeJsonLdString(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function TitleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  let jsonLd: JsonLdMovieOrSeries | null = null;

  if (type === "movie" || type === "tv") {
    try {
      const data = await detailsTMDB(type, id);
      jsonLd = buildJsonLd(type, id, data);
    } catch {
      jsonLd = null;
    }
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdString(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
