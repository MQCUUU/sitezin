import { DiscoverCard } from "./DiscoverCard";
import type { DiscoverItem } from "./types";

export type DiscoverGridProps = {
  items: DiscoverItem[];
  personalFiltersNote: boolean;
  perPage?: number;
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
      {personalFiltersNote && (
        <div className="discover-personal-note mc-discover-personal-note muted">
          {perPage
            ? `Filtros pessoais podem esconder alguns dos ${perPage} resultados desta página.`
            : "Filtros pessoais podem esconder alguns dos resultados desta página."}
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
