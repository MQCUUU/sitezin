import { Plus } from "lucide-react";

import type { MediaPreviewActionsConfig, MediaPreviewData } from "./types";

const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type MediaPreviewActionsProps = {
  data: MediaPreviewData;
  actions?: MediaPreviewActionsConfig;
};

/**
 * Renders whichever real actions the caller wired up — nothing is assumed
 * to exist. `onAdd` only shows once the title isn't already in the library;
 * `onRating` only shows once it is (mirrors all four audited surfaces).
 */
export function MediaPreviewActions({ data, actions }: MediaPreviewActionsProps) {
  if (!actions) return null;

  const { onAdd, addLabel, onRating, disabled } = actions;
  const inLibrary = Boolean(data.libraryState?.libraryId);

  return (
    <div className="mc-preview-actions">
      {onAdd && !inLibrary && (
        <button
          type="button"
          className="btn primary mc-preview-add-btn"
          onClick={() => onAdd(data)}
          disabled={disabled}
        >
          <Plus size={16} />
          {addLabel || "Adicionar à biblioteca"}
        </button>
      )}

      {onRating && inLibrary && (
        <div className="mc-preview-rating">
          <span className="mc-preview-rating-label">Minha nota</span>

          <div className="mc-preview-rating-grid">
            {RATING_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={
                  data.libraryState?.personalRating === value
                    ? "mc-preview-rating-btn mc-preview-rating-btn--active"
                    : "mc-preview-rating-btn"
                }
                onClick={() => onRating(data, value)}
                disabled={disabled}
                aria-label={`Nota ${value}`}
              >
                {value}
              </button>
            ))}

            <button
              type="button"
              className="mc-preview-rating-clear"
              onClick={() => onRating(data, null)}
              disabled={disabled}
            >
              Limpar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
