import "@/styles/features/screen-kit.css";
import { motion } from "motion/react";

import type { DiscoverType } from "@/lib/discover/params";

const TABS: { value: DiscoverType; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "movie", label: "Filmes" },
  { value: "tv", label: "Séries" },
];

export type DiscoverTabsProps = {
  value: DiscoverType;
  onChange: (value: DiscoverType) => void;
};

/**
 * Tipo de mídia em abas de texto; o traço de destaque desliza para a aba
 * escolhida (Motion `layoutId`, sem movimento com redução de movimento via
 * MotionConfig do app). `role="tablist"` com setas, como antes.
 */
export function DiscoverTabs({ value, onChange }: DiscoverTabsProps) {
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    event.preventDefault();

    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length];

    onChange(next.value);
    document.getElementById(`discover-tab-${next.value}`)?.focus();
  }

  return (
    <div className="sk-tabs" role="tablist" aria-label="Tipo de mídia">
      {TABS.map((tab, index) => {
        const active = value === tab.value;

        return (
          <button
            key={tab.value}
            id={`discover-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className="sk-tab"
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
            {active && (
              <motion.span
                layoutId="discover-tab-indicator"
                className="sk-tab-indicator"
                transition={{ type: "spring", duration: 0.32, bounce: 0 }}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
