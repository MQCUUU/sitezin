import { redirect } from "next/navigation";

/*
 * V2.3 — "Estatísticas" virou parte da página Insights (mesmos dados,
 * Biblioteca × Histórico preservados nas definições do motor). Links e
 * favoritos antigos para /stats continuam funcionando.
 */
export default function StatsRedirect() {
  redirect("/insights");
}
