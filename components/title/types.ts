import type { TitleDetails, TitleType } from "@/lib/title-details";
import type { CastCredit, CrewCredit, PersonCredit, TitleCreditsData } from "@/lib/title-credits";
import type { CollectionRef, RelatedItem } from "@/lib/title-related";
import type { Status } from "@/lib/types";

export type { TitleDetails, TitleType };
export type { CastCredit, CrewCredit, PersonCredit, TitleCreditsData };
export type { CollectionRef, RelatedItem };

/**
 * TitleDetails é o formato real vindo do servidor, mas os campos TMDB
 * (genres, credits, production_companies, videos, watch_providers, etc.)
 * não são modelados campo a campo — isso pertence a um esforço separado de
 * tipagem do TMDB, fora do escopo da C1.2. Este alias evita reintroduzir
 * `any` cru nos componentes extraídos, mantendo o mesmo acesso solto que o
 * container já fazia antes da decomposição.
 */
export type LooseTitleDetails = TitleDetails & Record<string, any>;

export interface LibraryItem {
  id: string;
  media: {
    tmdb_id: number;
    media_type: string;
    seasons_count?: number;
    [key: string]: any;
  };
  status: Status;
  favorite: boolean;
  personal_rating: number | null;
  review: string;
  [key: string]: any;
}

export interface LibraryItemUpdate {
  status?: Status;
  [key: string]: any;
}
