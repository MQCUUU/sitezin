"use client";

import { useEffect } from "react";
import type { HTMLAttributes, ReactNode, RefObject } from "react";

import { cx } from "./cx";

export type PopoverProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  open: boolean;
  onClose: () => void;
  /** Ref of the element that contains BOTH the trigger and this panel. */
  containerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/**
 * Lightweight anchored panel: closes on outside pointerdown and Escape.
 * It renders a plain positioned `div` — positioning/sizing stays with
 * whatever CSS already targets the caller's own className (e.g.
 * `.account-dropdown`, `.notification-dropdown`); this primitive only
 * centralizes the dismiss behavior and adds shared entrance motion.
 */
export function Popover({
  open,
  onClose,
  containerRef,
  className,
  children,
  ...rest
}: PopoverProps) {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, containerRef]);

  if (!open) return null;

  return (
    <div className={cx("mc-popover", className)} {...rest}>
      {children}
    </div>
  );
}
