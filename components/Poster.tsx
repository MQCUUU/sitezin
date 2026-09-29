"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { img } from "@/lib/tmdb";

/*
 * ============================================================
 * ARQUIVO NOVO — nada é substituído por enquanto.
 *
 * POR QUE ELE EXISTE
 *   O projeto tem 45 tags <img> cruas em 18 arquivos, todas
 *   pedindo w500 do TMDB independente do tamanho em que a
 *   imagem aparece na tela. Um pôster de 150px na grade baixa
 *   uma imagem de 500px de largura, em JPEG.
 *
 *   Converter as 45 de uma vez seria a mudança mais arriscada
 *   possível: o CSS depende de seletores como
 *   `.poster img { width:100%; height:100% }`, e um erro
 *   quebraria a grade inteira.
 *
 *   Este componente permite trocar UMA de cada vez, testando.
 *
 * COMO USAR
 *   Antes:
 *     <img src={img(item.poster_path)} alt={item.title} loading="lazy" />
 *
 *   Depois:
 *     <Poster path={item.poster_path} alt={item.title} sizes="150px" />
 *
 * IMPORTANTE SOBRE O CSS
 *   next/image renderiza um <img> de verdade no final, então
 *   `.poster img { ... }` continua valendo. O `fill` exige que
 *   o elemento pai tenha position relative — e `.poster` já tem
 *   (`isolation:isolate; position:relative` no globals.css).
 *
 * SOBRE O `sizes`
 *   É o que informa ao navegador a largura real de exibição,
 *   para ele escolher a variante certa. Passar errado anula o
 *   ganho. Valores da sua grade atual:
 *     grade padrão (6 col)  -> "(max-width:700px) 45vw, 170px"
 *     grade compacta        -> "(max-width:700px) 45vw, 130px"
 *     lista da biblioteca   -> "80px"
 *     pôster do título      -> "(max-width:700px) 150px, 245px"
 *     logo de streaming     -> "40px"
 * ============================================================
 */

type PosterProps = {
  /** poster_path ou backdrop_path cru do TMDB. */
  path?: string | null;
  alt: string;
  sizes: string;
  /** Tamanho pedido ao TMDB. O otimizador reduz a partir daí. */
  tmdbSize?: string;
  className?: string;
  /**
   * true apenas para a imagem principal acima da dobra (o
   * pôster da página de título). Nunca em itens de grade —
   * priorizar tudo é o mesmo que não priorizar nada.
   */
  priority?: boolean;
};

export function Poster({
  path,
  alt,
  sizes,
  tmdbSize = "w500",
  className,
  priority = false,
}: PosterProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Novo poster (ex.: troca de página/filtro): recomeça o ciclo de carregamento.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [path]);

  // Imagem que já estava em cache/hidratada antes do onLoad do React.
  useEffect(() => {
    const element = imageRef.current;

    if (element?.complete && element.naturalWidth > 0) setLoaded(true);
  });

  /*
   * V2.2-A — dois problemas percebidos pelo usuário:
   *  1. o poster "aparecia aos pedaços" (imagem entra de uma vez sobre o
   *     fundo do card): agora entra com fade curto (`mc-poster-fade`,
   *     sem transição em reduced-motion). O espaço já é reservado pelo
   *     container (aspect-ratio) — não há layout shift;
   *  2. poster inexistente no TMDB (404) mostrava imagem quebrada: cai no
   *     mesmo placeholder local usado quando não há `poster_path`.
   */
  const usePlaceholder = !path || failed;
  const src = usePlaceholder ? img(null, tmdbSize) : img(path, tmdbSize);

  return (
    <Image
      ref={imageRef}
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={`mc-poster-fade${className ? ` ${className}` : ""}`}
      priority={priority}
      unoptimized={usePlaceholder}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      style={{ objectFit: "cover", opacity: loaded || usePlaceholder || priority ? 1 : 0 }}
    />
  );
}
