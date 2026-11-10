import { pickTrailer } from "@/lib/title-locale";
import { TrailerFrame } from "./TrailerFrame";
import type { LooseTitleDetails } from "./types";

export type TitleTrailerProps = {
  details: LooseTitleDetails;
};

/**
 * Melhor vídeo do YouTube (lib/title-locale.ts → pickTrailer: trailer oficial
 * > trailer > teaser > qualquer; PT antes de EN). V3.1: o player só carrega
 * quando chega perto da tela (`loading="lazy"`), sem autoplay, pelo domínio
 * sem cookies do YouTube. Sem vídeo → nada.
 */
export function TitleTrailer({ details }: TitleTrailerProps) {
  const trailer = pickTrailer(details.videos);

  if (!trailer) return null;

  return (
    <section className="section mc-title-section">
      <div className="title-section-heading">
        <span>Vídeo</span>

        <h2>Trailer</h2>
      </div>

      <div
        className="panel"
        style={{
          overflow: "hidden",
          padding: 0,
          borderRadius: "var(--mc-radius-lg)",
        }}
      >
        <TrailerFrame videoKey={trailer.key} title={trailer.name} />
      </div>
    </section>
  );
}
