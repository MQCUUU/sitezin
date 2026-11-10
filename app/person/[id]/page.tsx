import { notFound } from "next/navigation";

import { getPersonCredits, parsePersonId, PersonCreditsError, type PersonCreditsData } from "@/lib/person/credits";

import PersonView from "./PersonView";

/*
 * Fase 6 — mesmo padrão da página de título: o servidor busca pessoa e
 * filmografia (lib/person/credits.ts) e PersonView recebe tudo pronto. O HTML
 * inicial já tem o hero com a imagem de fundo, então o navegador a descobre
 * sem esperar o JS. `key` remonta a view ao ir de uma pessoa para outra.
 */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = parsePersonId(id);

  if (!personId) notFound();

  let initialData: PersonCreditsData | null = null;

  try {
    initialData = await getPersonCredits(personId);
  } catch (error) {
    if (error instanceof PersonCreditsError && error.status === 404) notFound();
    console.error("[person] falha ao carregar do servidor:", error);
  }

  return <PersonView key={id} id={id} initialData={initialData} />;
}
