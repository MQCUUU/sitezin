export const CONTENT_TABS = [
  ["info", "Visão geral"],
  ["cast", "Elenco e equipe"],
  ["reviews", "Avaliações e resenhas"],
  ["related", "Relacionados e mídia"],
] as const;

export type ContentTabValue = (typeof CONTENT_TABS)[number][0];

export interface ContentTabPanelIdsCtx {
  hasDirectorsOrCreators: boolean;
  hasCast: boolean;
  hasCompanies: boolean;
  hasLibraryItem: boolean;
  hasRecommendations: boolean;
}

/*
 * O conteúdo de cada aba ainda está espalhado em múltiplas seções
 * top-level fisicamente intercaladas entre si (histórico da
 * B2/B3 — ex. o painel de histórico de "reviews" fica, no JSX,
 * entre dois painéis de "cast"). Reagrupar isso num único
 * wrapper por aba exigiria mover blocos grandes, fora do escopo
 * da C1.1.6/C1.2.
 *
 * C1.1.6: em vez de uma lista estática de ids (alguns dos quais
 * nunca chegam a existir no DOM, a depender de guest/auth/dados),
 * `aria-controls` é computado a cada render com base nas mesmas
 * condições que decidem o que é de fato renderizado — contém só
 * ids que existem naquele momento. Nenhuma referência órfã.
 */
export function getContentTabPanelIds(
  value: ContentTabValue,
  ctx: ContentTabPanelIdsCtx
): string {
  switch (value) {
    case "info":
      return "title-tabpanel-info";
    case "cast": {
      const ids: string[] = [];
      if (ctx.hasDirectorsOrCreators) ids.push("title-tabpanel-cast-1");
      if (ctx.hasCast) ids.push("title-tabpanel-cast-2");
      if (ctx.hasCompanies) ids.push("title-tabpanel-cast-3");
      /*
       * Espelha exatamente a condição do painel cast-4 no JSX:
       * ele aparece quando não há elenco/diretores/criadores,
       * independente de haver produtoras — os dois painéis
       * podem coexistir.
       */
      if (!ctx.hasCast && !ctx.hasDirectorsOrCreators) {
        ids.push("title-tabpanel-cast-4");
      }
      return ids.join(" ");
    }
    case "reviews":
      return ctx.hasLibraryItem
        ? "title-tabpanel-reviews-1 title-tabpanel-reviews-3"
        : "title-tabpanel-reviews-2";
    case "related":
      return ctx.hasRecommendations
        ? "title-tabpanel-related-2"
        : "title-tabpanel-related-1";
    default:
      return "";
  }
}
