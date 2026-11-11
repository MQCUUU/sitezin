"use client";

import "@/styles/features/screen-band.css";

import { useEffect, useState } from "react";

import { Poster } from "@/components/Poster";
import { useProjectionTarget } from "@/components/screen/ProjectionProvider";
import { averageColor } from "@/lib/projection";
import { img } from "@/lib/tmdb";

/**
 * Fase 4 — faixa panorâmica (2.39:1) sobre fundo preto, como a tela de um
 * cinema. A "cortina" se abre do centro para as bordas (clip-path, CSS — roda
 * fora da thread principal). Fase 6: abre na primeira pintura, não mais quando
 * o React avisava o carregamento (esperava a hidratação e atrasava o LCP).
 *
 * Fase 5 — dentro de um ProjectionProvider a faixa projeta o título sob o
 * ponteiro: a imagem nova carrega fora da tela e entra por cima (só opacity);
 * quando o ponteiro sai, ela some e a faixa volta ao título padrão.
 * Fora do provider (página do Título) nada muda.
 */
export function TitleBand({ path }: { path?: string | null }) {
  const projection = useProjectionTarget();
  const wanted = projection?.target && projection.target !== path ? projection.target : null;
  const setRoom = projection?.setRoom;

  // Última imagem pedida: fica montada (invisível) enquanto o fade de saída roda.
  const [last, setLast] = useState<string | null>(null);
  if (wanted && wanted !== last) setLast(wanted);
  // Imagem que já terminou de carregar: só então a camada fica visível.
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => {
    if (!wanted || !setRoom) return;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setLoaded(wanted);
    };
    probe.src = img(wanted, "w780");
    // Cor média: miniatura de 92px com CORS; se o servidor não permitir, fica sem reflexo.
    const tiny = new Image();
    tiny.crossOrigin = "anonymous";
    tiny.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx?.drawImage(tiny, 0, 0, 8, 8);
        setRoom(ctx ? averageColor(ctx.getImageData(0, 0, 8, 8).data) : null);
      } catch {
        setRoom(null);
      }
    };
    tiny.src = img(wanted, "w92");
    return () => {
      cancelled = true;
    };
  }, [wanted, setRoom]);

  const ready = Boolean(wanted && loaded === wanted);

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
          {last ? (
            // eslint-disable-next-line @next/next/no-img-element -- camada de projeção: troca rápida, sem otimizador
            <img className="tt-band-projection" data-ready={ready ? "true" : "false"} src={img(last, "w780")} alt="" decoding="async" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
