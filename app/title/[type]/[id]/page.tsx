import { notFound } from "next/navigation";

import {
  getTitleDetails,
  parseTitleParams,
  type TitleDetails,
} from "@/lib/title-details";
import TitleView from "./TitleView";

/*
 * ============================================================
 * C1.1 — fonte única de dados iniciais.
 *
 * Este Server Component busca os detalhes do título e os passa
 * como prop para TitleView. O client não refaz esse fetch no
 * mount (ver TitleView.tsx) — só busca dados do usuário
 * (biblioteca), que não podem vir do servidor sem sessão.
 *
 * `key` força TitleView a remontar ao navegar de um título para
 * outro no client (Search/Discover/recomendações), garantindo
 * que o estado inicial reflita sempre o `initialDetails` do
 * título atual, e não o de um título visitado antes.
 * ============================================================
 */

export default async function TitlePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;

  const parsed = parseTitleParams(type, id);

  if (!parsed) notFound();

  let initialDetails: TitleDetails | null = null;

  try {
    initialDetails = await getTitleDetails(parsed.type, parsed.tmdbId);
  } catch (erro) {
    console.error("[title] falha ao carregar do servidor:", erro);
  }

  return (
    <TitleView
      key={`${parsed.type}-${parsed.tmdbId}`}
      type={parsed.type}
      id={String(parsed.tmdbId)}
      initialDetails={initialDetails}
    />
  );
}
