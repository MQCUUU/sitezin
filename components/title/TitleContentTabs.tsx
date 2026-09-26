"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";

import {
  CONTENT_TABS,
  getContentTabPanelIds,
  type ContentTabPanelIdsCtx,
  type ContentTabValue,
} from "./content-tabs";

export type TitleContentTabsProps = {
  contentTab: ContentTabValue;
  onContentTabChange: (value: ContentTabValue) => void;
  panelIdsCtx: ContentTabPanelIdsCtx;
};

export function TitleContentTabs({
  contentTab,
  onContentTabChange,
  panelIdsCtx,
}: TitleContentTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <nav
      className="title-content-tabs"
      role="tablist"
      aria-label="Seções do título"
    >
      {CONTENT_TABS.map(([value, label], index) => (
        <button
          key={value}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          type="button"
          role="tab"
          id={`title-tab-${value}`}
          aria-selected={contentTab === value}
          aria-controls={getContentTabPanelIds(value, panelIdsCtx)}
          tabIndex={contentTab === value ? 0 : -1}
          className={contentTab === value ? "active" : ""}
          onClick={() => onContentTabChange(value)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            let nextIndex: number | null = null;

            if (event.key === "ArrowRight") {
              nextIndex = (index + 1) % CONTENT_TABS.length;
            } else if (event.key === "ArrowLeft") {
              nextIndex =
                (index - 1 + CONTENT_TABS.length) % CONTENT_TABS.length;
            } else if (event.key === "Home") {
              nextIndex = 0;
            } else if (event.key === "End") {
              nextIndex = CONTENT_TABS.length - 1;
            }

            if (nextIndex !== null) {
              event.preventDefault();
              onContentTabChange(CONTENT_TABS[nextIndex][0]);
              tabRefs.current[nextIndex]?.focus();
            }
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
