import type { Metadata } from "next";
import { detailsTMDB, img } from "@/lib/tmdb";

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

export default function TitleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
