'use client';

import "@/styles/features/for-you.css";
import "@/styles/features/recommend.css";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { BandPageSkeleton } from "@/components/AsyncState";
import { RowsSkeleton } from "@/components/for-you/FriendsInbox";

/*
 * Para você abre com a Tela e a grade; "Dos amigos" e "Que você indicou" são
 * linhas, sem faixa. O HTML estático não conhece ?view, então mostra o padrão.
 */
function ForYouLoadingByView() {
  const view = useSearchParams().get("view");
  if (view !== "amigos" && view !== "enviadas") return <BandPageSkeleton />;
  return (
    <div className="fy-page rc-page" role="status" aria-label="Carregando">
      <div className="mc-sk-head" aria-hidden="true">
        <div className="mc-skeleton mc-sk-page-title" />
        <div className="mc-skeleton mc-sk-copy" />
        <div className="mc-sk-tabs">
          <div className="mc-skeleton" />
          <div className="mc-skeleton" />
          <div className="mc-skeleton" />
        </div>
      </div>
      <div style={{ marginTop: 28 }}>
        <RowsSkeleton />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <Suspense fallback={<BandPageSkeleton />}>
      <ForYouLoadingByView />
    </Suspense>
  );
}
