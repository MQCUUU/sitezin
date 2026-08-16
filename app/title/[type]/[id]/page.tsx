import { notFound } from "next/navigation";

import { getTitleDetails, parseTitleParams } from "@/lib/title-details";
import TitleView from "./TitleView";
import { TitleHeading } from "./TitleHeading";
import { TitleAbout } from "./TitleAbout";

/*
 * ============================================================
 * SUBSTITUI o page.tsx do Estágio 1
 *
 * A NOVIDADE DO ESTÁGIO 2
 *   Além de passar os dados prontos, este arquivo agora
 *   renderiza NO SERVIDOR dois pedaços da página e os entrega
 *   ao TitleView como props.
 *
 *   Isso funciona porque, no App Router, um Server Component
 *   pode passar JSX já renderizado para um Client Component. O
 *   React entende os slots como conteúdo pronto — o cliente
 *   não re-executa esse código, só o encaixa no lugar.
 *
 *   Resultado: o <h1>, a sinopse e os gêneros passam a existir
 *   no HTML entregue pelo servidor, sem que o TitleView deixe
 *   de ser Client Component.
 *
 * COMO CONFERIR
 *   Ctrl+U na página e procure a sinopse do filme. Se aparecer
 *   no código-fonte, funcionou.
 * ============================================================
 */

export default async function TitlePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;

  const parsed = parseTitleParams(type, id);

  if (!parsed) notFound();

  let initialDetails: Record<string, unknown> | null = null;

  try {
    initialDetails = await getTitleDetails(parsed.type, parsed.tmdbId);
  } catch (erro) {
    console.error("[title] falha ao carregar do servidor:", erro);
  }

  const titleViewProps = {
    type: parsed.type,
    id: String(parsed.tmdbId),
    initialDetails,
    /*
     * Os slots só existem quando o servidor conseguiu os
     * dados. Sem eles (TMDB fora do ar), o TitleView usa o
     * markup próprio dele — o caminho antigo continua vivo.
     */
    slotCabecalho: initialDetails ? (
      <TitleHeading details={initialDetails} type={parsed.type} />
    ) : null,
    slotSobre: initialDetails ? (
      <TitleAbout details={initialDetails} type={parsed.type} />
    ) : null,
  } as any;

  return <TitleView {...titleViewProps} />;
}
