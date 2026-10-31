import type { Metadata } from "next";

import { WatchlistPage } from "@/components/watchlist/WatchlistPage";

export const metadata: Metadata = { title: "Watchlist" };

/*
 * Watchlist automática: tudo que está como "Quero assistir", na ordem de
 * prioridade escolhida pelo usuário (lib/watchlist.ts).
 */
export default function Page() {
  return <WatchlistPage />;
}
