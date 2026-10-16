"use client";

import { EpisodeBrowser } from "@/components/EpisodeBrowser";
import { SeriesSchedule } from "@/components/SeriesSchedule";
import type { LibraryItem, LibraryItemUpdate, LooseTitleDetails } from "./types";

export type TitleTvSectionsProps = {
  details: LooseTitleDetails;
  libraryItem: LibraryItem | null;
  onLibraryChange: (item: LibraryItemUpdate) => void;
};

/**
 * Blocos exclusivos de série na aba "info": próximos episódios
 * (SeriesSchedule) e o navegador de temporadas/episódios (EpisodeBrowser).
 * V3.1: o "próximo episódio" vive no painel "Seu progresso" (barra lateral,
 * TitleSeriesProgress) — mesma verdade da Biblioteca/Home, sem callout
 * paralelo aqui.
 */
export function TitleTvSections({ details, libraryItem, onLibraryChange }: TitleTvSectionsProps) {
  return (
    <>
      <SeriesSchedule tvId={details.id} inProduction={Boolean(details.in_production)} />

      <section className="section mc-title-section">
        <EpisodeBrowser
          tvId={Number(details.id)}
          libraryItem={libraryItem}
          seasons={details.seasons}
          totalSeasons={Number(details.number_of_seasons || 1)}
          onLibraryChange={onLibraryChange}
        />
      </section>
    </>
  );
}
