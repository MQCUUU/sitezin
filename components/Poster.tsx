"use client";

import Image from "next/image";
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
  const src = img(path, tmdbSize);

  /*
   * O placeholder é um SVG local. Mandá-lo pelo otimizador de
   * imagens é desperdício (SVG já é vetorial e minúsculo), daí
   * o unoptimized.
   */
  const isPlaceholder = !path;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized={isPlaceholder}
      style={{ objectFit: "cover" }}
    />
  );
}
