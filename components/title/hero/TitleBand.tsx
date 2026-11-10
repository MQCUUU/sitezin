"use client";

import "@/styles/features/screen-band.css";

import { Poster } from "@/components/Poster";

/**
 * Fase 4 — faixa panorâmica (2.39:1) sobre fundo preto, como a tela de um
 * cinema. A "cortina" se abre do centro para as bordas (clip-path, CSS — roda
 * fora da thread principal). Fase 6: abre na primeira pintura, não mais quando
 * o React avisava o carregamento (esperava a hidratação e atrasava o LCP).
 */
export function TitleBand({ path }: { path?: string | null }) {
  return (
    <div className="tt-band">
      {path ? (
        <div className="tt-band-screen">
          <Poster
            path={path}
            alt=""
            sizes="(max-width: 1440px) 100vw, 1440px"
            tmdbSize="w1280"
            priority
          />
        </div>
      ) : null}
    </div>
  );
}
