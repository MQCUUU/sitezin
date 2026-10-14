import type { Metadata } from "next";

import { InsightsPage } from "@/components/insights/InsightsPage";

/*
 * V2.3 — Insights reconstruído como uma página única e editorial
 * (components/insights/InsightsPage.tsx). /stats redireciona para cá;
 * /ranking e /retrospective continuam como visões completas.
 */

export const metadata: Metadata = {
  title: "Insights",
};

export default function Page() {
  return <InsightsPage />;
}
