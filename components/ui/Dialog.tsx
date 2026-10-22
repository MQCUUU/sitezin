"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import { lockScroll, trapTab } from "@/lib/modal-a11y";

import { cx } from "./cx";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  labelledBy?: string;
  describedBy?: string;
  className?: string;
};

/**
 * Generic modal primitive: portal, scroll lock, Escape, backdrop click and
 * a Tab focus trap. It renders no title/body/actions of its own — callers
 * (e.g. ConfirmProvider) supply their own content.
 */
export function Dialog({
  open,
  onClose,
  children,
  role = "dialog",
  labelledBy,
  describedBy,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const unlockScroll = lockScroll();
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      trapTab(event, panelRef.current);
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      unlockScroll();
      document.removeEventListener("keydown", handleKeyDown, true);
      previousActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="mc-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        /*
         * Without this, the browser's own default mousedown behavior (move
         * focus to <body> because the backdrop itself isn't focusable) runs
         * *after* our onClose() -> effect-cleanup -> previousActive.focus()
         * restore below, silently overwriting it back to <body>. Suppressing
         * only the default action (not the click) keeps the restore intact.
         */
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx("mc-dialog", className)}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
