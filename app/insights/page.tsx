"use client";

import Link from "next/link";
import { ChartNoAxesCombined, Sparkles, Trophy } from "lucide-react";

import { Search } from "@/components/Search";
import { InsightsSubNav } from "@/components/InsightsSubNav";

/*
 * V2.1-B — hub de Insights (docs/V2.1-B-PRODUCT-ARCHITECTURE.md).
 * Agrupa Estatísticas, Ranking e Retrospectiva num único destino de
 * navegação principal, sem mover nenhuma das 3 páginas — cada card
 * aqui só navega para a URL real já existente. Deliberadamente sem
 * fetch de dados (evita duplicar as APIs de /stats, /ranking e
 * /retrospective só para montar um resumo na landing).
 */

const CARDS = [
  {
    href: "/stats",
    icon: ChartNoAxesCombined,
    title: "Estatísticas",
    description: "Entenda seus hábitos — biblioteca e histórico, separados.",
  },
  {
    href: "/ranking",
    icon: Trophy,
    title: "Ranking",
    description: "Veja seus títulos mais bem avaliados.",
  },
  {
    href: "/retrospective",
    icon: Sparkles,
    title: "Retrospectiva",
    description: "Revise seus anos no MyCatalog.",
  },
] as const;

export default function InsightsPage() {
  return (
    <>
      <Search />

      <div className="section">
        <div className="eyebrow">Insights</div>
        <h1>Insights</h1>
        <p className="muted">
          Estatísticas, ranking e retrospectiva do que você catalogou
          e assistiu, num só lugar.
        </p>
      </div>

      <InsightsSubNav active="insights" />

      <div className="insights-hub-grid">
        {CARDS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="panel insights-hub-card mc-focusable">
            <div className="insights-hub-card-icon">
              <Icon size={22} strokeWidth={2} aria-hidden="true" />
            </div>

            <div>
              <strong>{title}</strong>
              <p className="muted">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
