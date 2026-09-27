import type { LooseTitleDetails } from "./types";

export type TitleTrailerProps = {
  details: LooseTitleDetails;
};

/**
 * Seleciona o melhor trailer disponível (trailer oficial do YouTube >
 * trailer não-oficial > qualquer vídeo do YouTube) e renderiza o embed.
 * Não renderiza nada quando não há nenhum vídeo do YouTube.
 */
export function TitleTrailer({ details }: TitleTrailerProps) {
  const trailer =
    details.videos?.results
      ?.filter((video: any) => video.site === "YouTube")
      ?.find(
        (video: any) => video.type === "Trailer" && video.official === true
      ) ||
    details.videos?.results
      ?.filter((video: any) => video.site === "YouTube")
      ?.find((video: any) => video.type === "Trailer") ||
    details.videos?.results?.find((video: any) => video.site === "YouTube");

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
        <div
          style={{ position: "relative", width: "100%", aspectRatio: "16 / 9" }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${trailer.key}`}
            title={trailer.name || "Trailer"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: 0,
            }}
          />
        </div>
      </div>
    </section>
  );
}
