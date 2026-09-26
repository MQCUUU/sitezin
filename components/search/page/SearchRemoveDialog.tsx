import { Trash2 } from "lucide-react";

import { getTitle, type SearchItem } from "./types";

export type SearchRemoveDialogProps = {
  item: SearchItem;
  skipConfirm: boolean;
  isProcessing: boolean;
  onSkipConfirmChange: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: (item: SearchItem) => void;
};

export function SearchRemoveDialog({
  item,
  skipConfirm,
  isProcessing,
  onSkipConfirmChange,
  onCancel,
  onConfirm,
}: SearchRemoveDialogProps) {
  const title = getTitle(item);

  return (
    <div className="mycatalog-confirm-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <div
        className="mycatalog-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="search-remove-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mycatalog-confirm-icon danger">
          <Trash2 size={20} />
        </div>

        <div>
          <div className="eyebrow">Remover da biblioteca</div>
          <h3 id="search-remove-title">Remover “{title}”?</h3>
          <p className="muted">
            O título será removido da sua biblioteca. Você poderá adicioná-lo novamente depois.
          </p>
        </div>

        <label className="mycatalog-confirm-option">
          <input
            type="checkbox"
            checked={skipConfirm}
            onChange={(event) => onSkipConfirmChange(event.target.checked)}
          />
          <span>Não mostrar novamente</span>
        </label>

        <div className="mycatalog-confirm-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>

          <button type="button" className="btn danger" disabled={isProcessing} onClick={() => onConfirm(item)}>
            <Trash2 size={16} />
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}
