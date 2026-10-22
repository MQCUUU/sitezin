import "@/styles/diary.css";
import type { Metadata } from "next";

// V3.5: título da aba ("Biblioteca · MyCatalog").
export const metadata: Metadata = { title: "Biblioteca" };

import { LibraryPage } from "@/components/library/LibraryPage";

/*
 * Biblioteca V2.6 — a coleção ATUAL (estado), não o histórico (Diário/Insights).
 * Estado navegável na URL, progresso real de séries, Curtidos ortogonal ao status.
 * Implementação em components/library e lib/library; auditoria em docs/V2.6-LIBRARY.md.
 */
export default function Page() {
  return <LibraryPage />;
}
