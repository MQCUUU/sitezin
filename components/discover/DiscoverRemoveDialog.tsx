"use client";

import { Loader2, Trash2 } from "lucide-react";

import { useModal } from "@/hooks/useModal";

import type { DiscoverItem } from "./types";

export type DiscoverRemoveDialogProps = {
  item: DiscoverItem;
  skipConfirm: boolean;
  isProcessing: boolean;
  onSkipConfirmChange: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: (item: DiscoverItem) => void;
};

export function DiscoverRemoveDialog({
  item,
  skipConfirm,
  isProcessing,
  onSkipConfirmChange,
  onCancel,
  onConfirm,
}: DiscoverRemoveDialogProps) {
  // Escape, laço do Tab, foco inicial/devolução e trava de rolagem (Fase 7).
  const modalRef = useModal(true, onCancel, false, ".mycatalog-confirm-actions .btn:not(.danger)");
  const title = item.title || item.name || "este título";

  return (
    <div className="mycatalog-confirm-backdrop" onClick={onCancel}>
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="mycatalog-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discover-remove-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mycatalog-confirm-icon danger">
          <Trash2 size={20} />
        </div>

        <div>
          <div className="eyebrow">Remover da biblioteca</div>
          <h3 id="discover-remove-title">Remover “{title}”?</h3>
          <p className="muted">
            O título será removido da sua biblioteca. Você poderá adicioná-lo novamente
            depois.
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

          <button
            type="button"
            className="btn danger"
            disabled={isProcessing}
            onClick={() => onConfirm(item)}
          >
            {isProcessing ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}
