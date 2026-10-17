import type { Metadata } from "next";

// V3.5: título da aba ("Listas · MyCatalog").
export const metadata: Metadata = { title: "Listas" };

import { ListsPage } from "@/components/lists/ListsPage";

/*
 * Listas V2.7 — seleções intencionais de títulos, independentes da Biblioteca.
 * Implementação em components/lists e lib/lists; auditoria em docs/V2.7-LISTS.md.
 */
export default function Page() {
  return <ListsPage />;
}
