/*
 * Watchlist: rolagem automática enquanto uma linha é arrastada.
 *
 * O arrastar nativo do navegador só rola a página quando o ponteiro encosta nos
 * últimos pixels da janela — e no celular essa faixa fica sob a barra de baixo.
 * Aqui a faixa é larga (EDGE_ZONE), começa logo abaixo/acima das barras fixas e a
 * velocidade cresce conforme o ponteiro se aproxima da borda.
 */

export const EDGE_ZONE = 96;
export const EDGE_MAX_STEP = 24;

export type EdgeView = {
  /** Altura da janela visível (innerHeight). */
  height: number;
  /** Parte de cima coberta por barra fixa (px). */
  top: number;
  /** Parte de baixo coberta por barra fixa (px). */
  bottom: number;
};

/** Pixels a rolar neste quadro: negativo sobe, positivo desce, 0 fica. */
export function edgeScrollStep(y: number, view: EdgeView): number {
  const topEdge = view.top;
  const bottomEdge = view.height - view.bottom;

  if (y < topEdge + EDGE_ZONE) {
    const depth = Math.min(1, (topEdge + EDGE_ZONE - y) / EDGE_ZONE);
    return -Math.max(1, Math.round(EDGE_MAX_STEP * depth * depth));
  }
  if (y > bottomEdge - EDGE_ZONE) {
    const depth = Math.min(1, (y - (bottomEdge - EDGE_ZONE)) / EDGE_ZONE);
    return Math.max(1, Math.round(EDGE_MAX_STEP * depth * depth));
  }
  return 0;
}
