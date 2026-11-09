"use client";

import "@/styles/features/screen-band.css";
import { useState } from "react";

import { Poster } from "@/components/Poster";

/**
 * Fase 4 — faixa panorâmica (2.39:1) sobre fundo preto, como a tela de um
 * cinema. Enquanto a imagem carrega a faixa fica preta; quando ela chega, a
 * "cortina" se abre do centro para as bordas (clip-path, CSS — roda fora da
 * thread principal). Sem isso a imagem surgia de repente por cima da página.
 */
export function TitleBand({ path }: { path?: string | null }) {
  const [ready, setReady] = useState(false);

  return (
    <div className="tt-band" data-ready={ready || !path ? "true" : "false"}>
      {path ? (
        <div className="tt-band-screen">
          <Poster
            path={path}
            alt=""
            sizes="(max-width: 1440px) 100vw, 1440px"
            tmdbSize="w1280"
            priority
            onLoadComplete={() => setReady(true)}
          />
        </div>
      ) : null}
    </div>
  );
}
