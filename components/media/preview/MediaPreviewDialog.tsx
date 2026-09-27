"use client";

import { useId } from "react";
import { X } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { MediaPreviewContent } from "./MediaPreviewContent";
import type { MediaPreviewActionsConfig, MediaPreviewData, MediaPreviewProvidersSlot } from "./types";

export type MediaPreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  data: MediaPreviewData | null;
  actions?: MediaPreviewActionsConfig;
  /**
   * Watch-providers area. Discover/Search can keep passing
   * `<WatchProviderList details={details} loading={detailsLoading} />` as-is —
   * the core never fetches or knows about providers itself (C2.1 spec §10, §28).
   */
  providers?: MediaPreviewProvidersSlot;
};

/**
 * Shared Quick Peek shell — built on the existing `Dialog` primitive
 * (portal, focus trap, Escape, backdrop click, scroll lock and focus
 * restore all come from there unchanged; see C2.1 audit). This component
 * only adds the Quick Peek's own chrome: close button + the
 * aria-labelledby wiring Dialog needs but doesn't generate itself.
 *
 * No surface has been migrated onto this yet — it's the foundation only.
 */
export function MediaPreviewDialog({ open, onClose, data, actions, providers }: MediaPreviewDialogProps) {
  const titleId = useId();

  if (!data) return null;

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} className="mc-preview-dialog">
      <button type="button" className="mc-preview-close" onClick={onClose} aria-label="Fechar" title="Fechar">
        <X size={18} />
      </button>

      <MediaPreviewContent data={data} actions={actions} providers={providers} titleId={titleId} />
    </Dialog>
  );
}
