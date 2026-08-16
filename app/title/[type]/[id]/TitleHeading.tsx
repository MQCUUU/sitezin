import { Film, Tv } from "lucide-react";

/*
 * ============================================================
 * ARQUIVO NOVO — app/title/[type]/[id]/TitleHeading.tsx
 *
 * SERVER COMPONENT. Repare que NÃO tem "use client" no topo —
 * é isso que faz o HTML sair pronto do servidor.
 *
 * O QUE É
 *   Exatamente o miolo que hoje está nas linhas 1304–1381 do
 *   TitleView.tsx: tipo, ano, <h1>, título original, tagline e
 *   os fatos rápidos.
 *
 * POR QUE ISTO É O ITEM MAIS VALIOSO DO ESTÁGIO 2
 *   O <h1> é o elemento que responde "do que trata esta
 *   página". Hoje ele só existe depois que o JavaScript roda.
 *   Aqui, ele passa a estar no HTML que o servidor entrega.
 *
 * O QUE FICA DE FORA
 *   As notas (title-ratings) e os botões (title-actions)
 *   continuam no TitleView, porque dependem da biblioteca do
 *   usuário. Eles ficam LOGO ABAIXO deste bloco, dentro da
 *   mesma div .title-main — por isso este componente não abre
 *   nem fecha essa div.
 * ============================================================
 */

export function TitleHeading({
  details,
  type,
}: {
  details: any;
  type: string;
}) {
  const title = details.title || details.name;

  const year = (
    details.first_air_date ||
    details.release_date ||
    ""
  ).slice(0, 4);

  const runtime = details.runtime || null;

  const originalTitle =
    details.original_title || details.original_name;

  return (
    <>
      <div className="title-type">
        {type === "tv" ? <Tv size={15} /> : <Film size={15} />}
        {type === "tv" ? "Série" : "Filme"}
        {year && (
          <>
            <span>•</span>
            {year}
          </>
        )}
      </div>

      <h1>{title}</h1>

      {originalTitle && originalTitle !== title && (
        <div className="title-original-name">{originalTitle}</div>
      )}

      {details.tagline && (
        <p className="title-tagline">“{details.tagline}”</p>
      )}

      <div className="title-quick-facts">
        {details.status && <span>{details.status}</span>}

        {type === "movie" && runtime && (
          <span>
            {Math.floor(Number(runtime) / 60)}h{" "}
            {Number(runtime) % 60}min
          </span>
        )}

        {type === "tv" && details.number_of_seasons && (
          <span>
            {details.number_of_seasons}{" "}
            {Number(details.number_of_seasons) === 1
              ? "temporada"
              : "temporadas"}
          </span>
        )}

        {details.original_language && (
          <span>
            {String(details.original_language).toUpperCase()}
          </span>
        )}
      </div>
    </>
  );
}
