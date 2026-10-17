import type { Metadata } from "next";

// V3.5: título da aba ("Calendário · MyCatalog").
export const metadata: Metadata = { title: "Calendário" };

import { CalendarPage } from "@/components/calendar/CalendarPage";

/*
 * Calendário V2 — Agenda (padrão), Semana e Mês, com prioridade para o que é
 * pessoal (séries que você acompanha, watchlist, biblioteca) sem esconder os
 * lançamentos gerais. Implementação em components/calendar e lib/calendar.
 */
export default function Page() {
  return <CalendarPage />;
}
