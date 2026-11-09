import "@/styles/features/search-page.css";
import "@/styles/features/screen-kit.css";
import Link from "next/link";
import { UserRound } from "lucide-react";

import { img } from "@/lib/tmdb";

import type { AdvancedMeta } from "./types";

export type PersonPanelProps = {
  person: any;
  creditsCount: number;
};

/**
 * Fase 4b: o que a busca entendeu, numa linha quieta — foto, nome e uma frase.
 * Sem rótulo em caixa alta, sem selo e sem caixa. A interpretação continua
 * toda no servidor (/api/search/advanced); aqui só se mostra o que já veio.
 */
export function SearchPersonPanel({ person, creditsCount }: PersonPanelProps) {
  const role = person.known_for_department === "Acting" ? "Atuação" : person.known_for_department || "Cinema e TV";

  return (
    <div className="sp-found">
      <Link href={`/person/${person.id}`} className="sp-found-thumb sp-found-thumb--round" aria-hidden="true" tabIndex={-1}>
        {person.profile_path ? (
          <img loading="lazy" decoding="async" src={img(person.profile_path, "w185")} alt="" />
        ) : (
          <UserRound size={24} />
        )}
      </Link>

      <div className="sp-found-copy">
        <h2>{person.name}</h2>
        <p>
          {role}, {creditsCount} {creditsCount === 1 ? "crédito" : "créditos"}. Resultado direto do TMDB, sem IA.
        </p>
        <Link href={`/person/${person.id}`} className="sk-link">
          Ver perfil de {person.name}
        </Link>
      </div>
    </div>
  );
}

export type AdvancedPanelProps = {
  meta: AdvancedMeta;
};

export function SearchAdvancedPanel({ meta }: AdvancedPanelProps) {
  const thumb = meta.collection?.poster_path
    ? { href: `/collection/${meta.collection.id}`, src: img(meta.collection.poster_path, "w185"), round: false }
    : meta.person?.profile_path
      ? { href: `/person/${meta.person.id}`, src: img(meta.person.profile_path, "w185"), round: true }
      : null;

  return (
    <div className="sp-found">
      {thumb && (
        <Link
          href={thumb.href}
          className={"sp-found-thumb" + (thumb.round ? " sp-found-thumb--round" : "")}
          aria-hidden="true"
          tabIndex={-1}
        >
          <img loading="lazy" decoding="async" src={thumb.src} alt="" />
        </Link>
      )}

      <div className="sp-found-copy">
        <h2>{meta.title}</h2>
        <p>
          {meta.subtitle}
          {meta.subtitle && !/[.!?]$/.test(meta.subtitle.trim()) ? "." : ""} Resultado direto do TMDB, sem IA.
        </p>

        {(meta.person || meta.collection) && (
          <div className="sp-found-links">
            {meta.person && (
              <Link href={`/person/${meta.person.id}`} className="sk-link">
                Ver perfil de {meta.person.name}
              </Link>
            )}
            {meta.collection && (
              <Link href={`/collection/${meta.collection.id}`} className="sk-link">
                Abrir a coleção completa
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
