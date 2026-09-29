"use client";

import { useCallback, useState } from "react";
import { NextEpisodeCallout } from "./NextEpisodeCallout";
import { EpisodeBrowser } from "@/components/EpisodeBrowser";
import { SeriesSchedule } from "@/components/SeriesSchedule";
import type { LibraryItem, LibraryItemUpdate, LooseTitleDetails } from "./types";

export type TitleTvSectionsProps = {
  details: LooseTitleDetails;
  libraryItem: LibraryItem | null;
  onProgressChange: (value: {
    season: number;
    watched: number;
    released: number;
  }) => void;
  onLibraryChange: (item: LibraryItemUpdate) => void;
};

/**
 * Composição dos blocos exclusivos de série na aba "info": próximos
 * episódios (SeriesSchedule) e o navegador de temporadas/episódios
 * (EpisodeBrowser). O container só monta isto quando `type === "tv"`.
 */
export function TitleTvSections({
  details,
  libraryItem,
  onProgressChange,
  onLibraryChange,
}: TitleTvSectionsProps) {
  const [progressTick, setProgressTick] = useState(0);

  /*
   * Identidade ESTÁVEL: o EpisodeBrowser dispara `onProgressChange` num
   * efeito que depende dela — um arrow inline aqui causaria um laço
   * (callback novo → efeito → tick → render → callback novo…).
   */
  const handleProgressChange = useCallback(
    (value: { season: number; watched: number; released: number }) => {
      setProgressTick((tick) => tick + 1);
      onProgressChange(value);
    },
    [onProgressChange]
  );

  return (
    <>
      <section className="section mc-title-section title-series-schedule-section">
        <SeriesSchedule tvId={details.id} libraryItem={libraryItem} />
      </section>

      <section className="section mc-title-section">
        {libraryItem && (
          <NextEpisodeCallout tvId={Number(details.id)} refreshKey={progressTick} />
        )}

        <EpisodeBrowser
          tvId={Number(details.id)}
          libraryItem={libraryItem}
          seasons={details.seasons}
          totalSeasons={Number(details.number_of_seasons || 1)}
          onProgressChange={handleProgressChange}
          onLibraryChange={onLibraryChange}
        />
      </section>
    </>
  );
}
