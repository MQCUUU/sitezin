"use client";

import { Play } from "lucide-react";
import { useState } from "react";

import { Poster } from "@/components/Poster";
import { pickTrailer } from "@/lib/title-locale";
import { TrailerFrame } from "./TrailerFrame";
import type { LooseTitleDetails } from "./types";

export type TitleTrailerProps = {
  details: LooseTitleDetails;
};

/**
 * Melhor vídeo do YouTube (lib/title-locale.ts → pickTrailer). Projeção
 * (Fase 4): começa como uma capa (a imagem larga do título + "Assistir o
 * trailer"); o player do YouTube — e todo o JavaScript dele — só carrega no
 * clique, já tocando. Antes carregava ao chegar perto da tela, mesmo para
 * quem não ia assistir. Sem vídeo → nada.
 */
export function TitleTrailer({ details }: TitleTrailerProps) {
  const trailer = pickTrailer(details.videos);
  const [playing, setPlaying] = useState(false);

  if (!trailer) return null;

  const image = details.backdrop_path || details.poster_path;

  return (
    <section className="section mc-title-section tt-trailer">
      <div className="title-section-heading">
        <h2>Trailer</h2>
      </div>

      <div className="tt-trailer-screen">
        {playing ? (
          <TrailerFrame videoKey={trailer.key} title={trailer.name} autoplay />
        ) : (
          <button type="button" className="tt-trailer-cover" onClick={() => setPlaying(true)}>
            {image ? (
              <Poster path={image} alt="" tmdbSize="w780" sizes="(max-width: 1100px) 100vw, 860px" />
            ) : null}
            <span className="tt-trailer-play">
              <Play size={15} fill="currentColor" aria-hidden="true" />
              Assistir o trailer
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
