"use client";


import "@/styles/features/account-menu.css";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import type { HTMLAttributes, ReactNode, RefObject } from "react";

import { EASE_OUT, popoverTransition } from "@/lib/motion";

import { cx } from "./cx";

type MotionConflicts = "children" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration" | "onDrag" | "onDragStart" | "onDragEnd";

export type PopoverProps = Omit<HTMLAttributes<HTMLDivElement>, MotionConflicts> & {
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
 *
 * Fase 3: entra e sai (antes sumia de uma vez) — escala a partir do canto do
 * gatilho (topo direito), 160ms, curva forte. Sem transform em movimento reduzido.
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

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="popover"
          className={cx("mc-popover", className)}
          style={{ transformOrigin: "top right" }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -2, transition: { duration: 0.12, ease: EASE_OUT } }}
          transition={popoverTransition}
          {...rest}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
