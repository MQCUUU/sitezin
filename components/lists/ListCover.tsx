"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";

import { img } from "@/lib/tmdb";

/*
 * Capa automática da lista, montada na UI a partir dos primeiros pôsteres (na
 * ordem da lista) — sem upload, sem imagem derivada salva. 0 → fallback do
 * MyCatalog; 1 → pôster único; 2–3 → composição; 4+ → mosaico 2×2. Miniaturas
 * w185, lazy (eager na capa do detalhe, acima da dobra), proporção fixa (sem layout shift); pôster quebrado vira bloco neutro.
 */
export function ListCover({ posters, size = "md" }: { posters: (string | null)[]; size?: "md" | "lg" | "sm" }) {
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const valid = posters.filter((p): p is string => Boolean(p)).slice(0, 4);
  const layout = valid.length >= 4 ? "four" : valid.length === 3 ? "three" : valid.length === 2 ? "two" : valid.length === 1 ? "one" : "empty";

  if (layout === "empty") {
    return (
      <div className={`lst-cover lst-cover--${size} lst-cover--empty`} aria-hidden="true">
        <Clapperboard size={size === "sm" ? 18 : 28} />
      </div>
    );
  }

  return (
    <div className={`lst-cover lst-cover--${size} lst-cover--${layout}`} aria-hidden="true">
      {valid.map((path, i) =>
        broken.has(i) ? (
          <span key={i} className="lst-cover-tile lst-cover-tile--empty" />
        ) : (
          <img
            key={`${path}-${i}`}
            className="lst-cover-tile"
            src={img(path, "w185")}
            alt=""
            loading={size === "lg" ? "eager" : "lazy"}
            decoding="async"
            onError={() => setBroken((current) => new Set(current).add(i))}
          />
        )
      )}
    </div>
  );
}
