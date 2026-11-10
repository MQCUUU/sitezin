import { notFound } from "next/navigation";

import { CollectionError, getCollectionDetails, parseCollectionId, type CollectionDetails } from "@/lib/collection/details";

import CollectionView from "./CollectionView";

/*
 * Fase 6 — mesmo padrão das páginas de título e pessoa: o servidor busca a
 * coleção (lib/collection/details.ts) e CollectionView recebe tudo pronto, com
 * o hero no HTML inicial. O estado pessoal (biblioteca) continua no cliente.
 */
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collectionId = parseCollectionId(id);

  if (!collectionId) notFound();

  let initialData: CollectionDetails | null = null;

  try {
    initialData = await getCollectionDetails(collectionId);
  } catch (error) {
    if (error instanceof CollectionError && error.status === 404) notFound();
    console.error("[collection] falha ao carregar do servidor:", error);
  }

  return <CollectionView key={id} id={id} initialData={initialData} />;
}
