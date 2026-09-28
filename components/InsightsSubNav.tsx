"use client";

import Link from "next/link";
import { ChartNoAxesCombined, LayoutGrid, Sparkles, Trophy } from "lucide-react";

/*
 * V2.1-B — Insights agrupa Estatísticas, Ranking e Retrospectiva sob
 * uma identidade visual comum, SEM mover nenhuma das 3 páginas de URL
 * (/stats, /ranking, /retrospective continuam existindo e funcionando
 * exatamente como antes — só ganharam esta subnav no topo). Quem
 * chega direto via bookmark/deep link em qualquer uma delas vê
 * claramente que está dentro da área "Insights".
 */

const TABS = [
  ["/insights", "Visão geral", LayoutGrid],
  ["/stats", "Estatísticas", ChartNoAxesCombined],
  ["/ranking", "Ranking", Trophy],
  ["/retrospective", "Retrospectiva", Sparkles],
] as const;

export type InsightsSubNavActive = "insights" | "stats" | "ranking" | "retrospective";

export function InsightsSubNav({ active }: { active: InsightsSubNavActive }) {
  return (
    <nav className="insights-subnav" aria-label="Áreas de Insights" role="tablist">
      {TABS.map(([href, label, Icon]) => {
        const key = href.replace("/", "") || "insights";
        const isActive = key === active;

        return (
          <Link
            key={href}
            href={href}
            role="tab"
            aria-selected={isActive}
            className="mc-focusable"
          >
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
