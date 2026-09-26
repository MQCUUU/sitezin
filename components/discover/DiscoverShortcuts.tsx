import { Film, Flame, Sparkles, Star, Tv } from "lucide-react";

import type { DiscoverParams } from "@/lib/discover/params";

export type DiscoverShortcut = {
  key: string;
  label: string;
  icon: typeof Flame;
  patch: Partial<DiscoverParams>;
};

const SHORTCUTS: DiscoverShortcut[] = [
  { key: "popular", label: "Mais populares", icon: Flame, patch: { sort: "popular" } },
  { key: "rating", label: "Mais bem avaliados", icon: Star, patch: { sort: "rating" } },
  { key: "newest", label: "Lançamentos", icon: Sparkles, patch: { sort: "newest" } },
  { key: "movies", label: "Filmes", icon: Film, patch: { type: "movie" } },
  { key: "tv", label: "Séries", icon: Tv, patch: { type: "tv" } },
];

function isShortcutActive(shortcut: DiscoverShortcut, params: DiscoverParams) {
  return Object.entries(shortcut.patch).every(
    ([key, value]) => params[key as keyof DiscoverParams] === value
  );
}

export type DiscoverShortcutsProps = {
  params: DiscoverParams;
  onApply: (patch: Partial<DiscoverParams>) => void;
};

/**
 * Quick-discovery layer explicitly scoped to combinations the existing
 * `/api/discover` already supports (type + sort). No new filter vocabulary,
 * no backend call — a shortcut just applies the same `sort`/`type` values
 * the sort select and tabs already write to the URL.
 */
export function DiscoverShortcuts({ params, onApply }: DiscoverShortcutsProps) {
  return (
    <div className="mc-discover-shortcuts" role="group" aria-label="Atalhos de descoberta">
      {SHORTCUTS.map((shortcut) => {
        const Icon = shortcut.icon;
        const active = isShortcutActive(shortcut, params);

        return (
          <button
            key={shortcut.key}
            type="button"
            className={
              "mc-discover-shortcut" + (active ? " mc-discover-shortcut--active" : "")
            }
            aria-pressed={active}
            onClick={() => onApply(shortcut.patch)}
          >
            <Icon size={14} />
            {shortcut.label}
          </button>
        );
      })}
    </div>
  );
}
