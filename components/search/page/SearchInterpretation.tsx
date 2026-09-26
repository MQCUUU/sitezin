import Link from "next/link";
import { Clapperboard, Layers3, SlidersHorizontal, UserRound } from "lucide-react";

import { img } from "@/lib/tmdb";

import type { AdvancedMeta } from "./types";

export type PersonPanelProps = {
  person: any;
  creditsCount: number;
};

/**
 * B3 §16: the page already resolves "filmes do Nolan" / "Batman com
 * Christian Bale" server-side (advanced/person resolution) — this only
 * surfaces what was already decided, visually. No new interpretation
 * logic, no change to /api/search/advanced.
 */
export function SearchPersonPanel({ person, creditsCount }: PersonPanelProps) {
  return (
    <div className="person-search-panel panel">
      <div className="person-search-avatar">
        {person.profile_path ? (
          <img loading="lazy" decoding="async" src={img(person.profile_path, "w185")} alt={person.name} />
        ) : (
          <UserRound size={28} />
        )}
      </div>

      <div className="person-search-info">
        <div className="eyebrow">Pessoa</div>
        <h2>{person.name}</h2>
        <p className="muted">
          {person.known_for_department === "Acting"
            ? "Ator / Atriz"
            : person.known_for_department || "Cinema e TV"}
          {" · "}
          {creditsCount} créditos
        </p>
        <span className="person-search-no-ai">100% TMDB · sem uso de IA</span>
      </div>
    </div>
  );
}

export type AdvancedPanelProps = {
  meta: AdvancedMeta;
};

export function SearchAdvancedPanel({ meta }: AdvancedPanelProps) {
  return (
    <div className="search-advanced-panel panel">
      <div className="search-advanced-icon">
        {meta.mode === "collection" ? (
          <Layers3 size={19} />
        ) : meta.mode === "filters" ? (
          <SlidersHorizontal size={19} />
        ) : meta.mode === "director" ? (
          <Clapperboard size={19} />
        ) : (
          <UserRound size={19} />
        )}
      </div>

      {meta.collection?.poster_path && (
        <Link
          href={`/collection/${meta.collection.id}`}
          className="search-advanced-thumb"
          title={`Abrir ${meta.collection.name || meta.title}`}
        >
          <img
            loading="lazy"
            decoding="async"
            src={img(meta.collection.poster_path, "w185")}
            alt={meta.collection.name || meta.title}
          />
        </Link>
      )}

      {meta.person?.profile_path && (
        <Link href={`/person/${meta.person.id}`} className="search-advanced-thumb">
          <img loading="lazy" decoding="async" src={img(meta.person.profile_path, "w185")} alt={meta.person.name} />
        </Link>
      )}

      <div className="search-advanced-copy">
        <div className="search-advanced-head">
          <span className="eyebrow">BUSCA AVANÇADA</span>
          <span className="search-no-ai-badge">100% TMDB · sem IA</span>
        </div>

        <h2>{meta.title}</h2>
        <p className="muted">{meta.subtitle}</p>

        <div className="search-advanced-links">
          {meta.person && (
            <Link href={`/person/${meta.person.id}`} className="search-advanced-profile-link">
              Ver perfil de {meta.person.name}
            </Link>
          )}

          {meta.collection && (
            <Link
              href={`/collection/${meta.collection.id}`}
              className="search-advanced-profile-link search-advanced-collection-link"
            >
              <Layers3 size={14} />
              Abrir coleção completa
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
