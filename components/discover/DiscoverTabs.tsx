import { Film, Layers3, Tv } from "lucide-react";

import type { DiscoverType } from "@/lib/discover/params";

const TABS: { value: DiscoverType; label: string; icon: typeof Layers3 }[] = [
  { value: "all", label: "Todos", icon: Layers3 },
  { value: "movie", label: "Filmes", icon: Film },
  { value: "tv", label: "Séries", icon: Tv },
];

export type DiscoverTabsProps = {
  value: DiscoverType;
  onChange: (value: DiscoverType) => void;
};

/**
 * Segmented control for media type. A real `role="tablist"` (not a row of
 * plain buttons styled to look active) so screen readers announce it as a
 * single control with three states, and arrow keys move between options
 * the way tabs are expected to behave.
 */
export function DiscoverTabs({ value, onChange }: DiscoverTabsProps) {
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    event.preventDefault();

    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + delta + TABS.length) % TABS.length;
    const next = TABS[nextIndex];

    onChange(next.value);

    const nextEl = document.getElementById(`discover-tab-${next.value}`);
    nextEl?.focus();
  }

  return (
    <div
      className="discover-tabs mc-discover-tabs"
      role="tablist"
      aria-label="Tipo de mídia"
    >
      {TABS.map((tab, index) => {
        const Icon = tab.icon;
        const active = value === tab.value;

        return (
          <button
            key={tab.value}
            id={`discover-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={
              "mc-discover-tab" + (active ? " mc-discover-tab--active" : "")
            }
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <Icon size={16} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
