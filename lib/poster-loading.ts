/*
 * Fase 4 (P2-07) — prioridade de carregamento dos pôsteres de uma grade.
 *
 * O LCP do Descobrir/Busca/Biblioteca era um pôster com loading="lazy": o
 * navegador só começava a baixá-lo depois do layout. Regra (Next 16: em grade
 * o LCP muda com a tela, então `loading`/`fetchPriority`, não `preload`):
 *   1º pôster        → eager + fetchPriority "high" (o candidato a LCP)
 *   resto da 1ª linha → eager (até 6, a linha mais larga no desktop)
 *   demais           → lazy (como antes; nada de baixar a grade inteira)
 */
export const EAGER_POSTERS = 6;

export type PosterLoading = { loading: "eager" | "lazy"; fetchPriority?: "high" };

export function posterLoading(position: number | undefined): PosterLoading {
  if (position === undefined || position < 0 || position >= EAGER_POSTERS) return { loading: "lazy" };
  return position === 0 ? { loading: "eager", fetchPriority: "high" } : { loading: "eager" };
}
