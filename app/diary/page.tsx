import type { Metadata } from "next";

// V3.5: título da aba ("Diário · MyCatalog").
export const metadata: Metadata = { title: "Diário" };

import { DiaryPage } from "@/components/diary/DiaryPage";

/*
 * Diário V2.5 — memória pessoal do que você assistiu: momentos (não eventos
 * crus), um mês por vez, filtros mínimos. Implementação em components/diary
 * e lib/diary; auditoria e regras em docs/V2.5-DIARY.md.
 */
export default function Page() {
  return <DiaryPage />;
}
