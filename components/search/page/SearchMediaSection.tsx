import { SearchMediaCard } from "./SearchMediaCard";
import type { LibraryState, SearchItem } from "./types";

export type SearchMediaSectionProps = {
  title: string;
  items: SearchItem[];
  library: LibraryState[];
  processing: string | null;
  openLibraryMenu: string | null;
  onPreview: (item: SearchItem) => void;
  onAdd: (item: SearchItem) => void;
  onToggleStatusMenu: (key: string) => void;
  onToggleFavorite: (item: SearchItem) => void;
  onUpdateStatus: (item: SearchItem, status: string) => void;
  onRequestRemove: (item: SearchItem) => void;
};

export function SearchMediaSection({
  title,
  items,
  library,
  processing,
  openLibraryMenu,
  onPreview,
  onAdd,
  onToggleStatusMenu,
  onToggleFavorite,
  onUpdateStatus,
  onRequestRemove,
}: SearchMediaSectionProps) {
  return (
    <section className="section search-results-section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
        </div>

        <span className="muted">{items.length} resultados</span>
      </div>

      <div className="discover-grid mc-media-grid">
        {items.map((item) => {
          const key = `${item.media_type}-${item.id}`;
          const libraryItem = library.find(
            (entry) => entry.tmdb_id === Number(item.id) && entry.media_type === item.media_type
          );

          return (
            <SearchMediaCard
              key={key}
              item={item}
              libraryItem={libraryItem}
              isProcessing={processing === key}
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
  );
}
