"use client";

import "@/styles/features/home-smart.css";

import { BandSkeleton } from "@/components/AsyncState";

/*
 * Skeleton do Início com o MESMO formato da composição real (Fase 4: faixa
 * panorâmica, título, fileira de pôsteres) — o conteúdo chega sem empurrar a
 * página. O destaque, as seções e as linhas vivem em HomeFeature/HomeSections.
 */
export function HomeSkeleton() {
  return (
    <div className="home-skeleton hm-skeleton" role="status" aria-live="polite" aria-label="Carregando seu Início">
      <BandSkeleton />
      <div className="mc-skeleton hm-skel-title" />
      <div className="mc-skeleton hm-skel-text" />
      <div className="home-skel-rail">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="mc-skeleton home-skel-poster" />
        ))}
      </div>
    </div>
  );
}
