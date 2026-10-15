import { DiscoverCard } from "./DiscoverCard";
import type { DiscoverItem } from "./types";

export type DiscoverGridProps = {
  items: DiscoverItem[];
  personalFiltersNote: boolean;
  perPage?: number;
  hiddenCount?: number;
  processingKey: string | null;
  openLibraryMenu: string | null;
  onPreview: (item: DiscoverItem) => void;
  onAdd: (item: DiscoverItem) => void;
  onToggleStatusMenu: (key: string) => void;
  onToggleFavorite: (item: DiscoverItem) => void;
  onUpdateStatus: (item: DiscoverItem, status: string) => void;
  onRequestRemove: (item: DiscoverItem) => void;
};

export function DiscoverGrid({
  items,
  personalFiltersNote,
  perPage,
  hiddenCount = 0,
  processingKey,
  openLibraryMenu,
  onPreview,
  onAdd,
  onToggleStatusMenu,
  onToggleFavorite,
  onUpdateStatus,
  onRequestRemove,
}: DiscoverGridProps) {
  return (
    <>
      {personalFiltersNote && hiddenCount > 0 && (
        <div className="discover-personal-note mc-discover-personal-note muted" role="note">
          {hiddenCount === 1
            ? "1 título foi ocultado pelos seus filtros pessoais."
            : `${hiddenCount} títulos foram ocultados pelos seus filtros pessoais.`}
        </div>
      )}

      <section className="section">
        <div className="discover-grid mc-media-grid">
          {items.map((item) => {
            const key = `${item.media_type}-${item.id}`;

            return (
              <DiscoverCard
                key={key}
                item={item}
                isProcessing={processingKey === key}
                isMenuOpen={openLibraryMenu === key}
                onPreview={onPreview}
                onAdd={onAdd}
                onToggleStatusMenu={onToggleStatusMenu}
                onToggleFavorite={onToggleFavorite}
                onUpdateStatus={onUpdateStatus}
                onRequestRemove={onRequestRemove}
              />
            );
          })}
        </div>
      </section>
    </>
  );
}
