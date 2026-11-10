"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import type { ComponentProps } from "react";

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
 *
 * Fase 5: entra e sai com Motion (antes só entrava, por @keyframes, e sumia de
 * uma vez ao fechar). Modal centralizado: sobe 8px e cresce de 0,98 em 200ms;
 * sai mais rápido (150ms). Redução de movimento: o MotionProvider desliga o
 * deslocamento e a escala e deixa só a opacidade.
 */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
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

  /*
   * Fase 6: o elemento que recebe o foco de volta é lido no render em que o
   * diálogo abre — antes do commit. Lido no efeito, um `autoFocus` do conteúdo
   * já teria levado o foco para dentro do painel, e ao fechar o foco voltava
   * para um botão que some (caía no <body>).
   */
  const [wasOpen, setWasOpen] = useState(open);
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(() =>
    open && typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null
  );
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && typeof document !== "undefined") setReturnTo(document.activeElement as HTMLElement | null);
  }

  useEffect(() => {
    if (!open) return;

    const previousActive = returnTo;
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
  }, [open, onClose, returnTo]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <Backdrop
          key="dialog"
          className="mc-dialog-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
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
          <motion.div
            ref={panelRef}
            className={cx("mc-dialog", className)}
            role={role}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            tabIndex={-1}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: 4, scale: 0.99, transition: { duration: 0.15, ease: EASE_OUT } }}
          >
            {children}
          </motion.div>
        </Backdrop>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/** Fundo do modal: enquanto anima a saída, já não recebe cliques (não bloqueia a página). */
function Backdrop({ style, ...rest }: ComponentProps<typeof motion.div>) {
  const isPresent = useIsPresent();
  return <motion.div {...rest} style={{ ...style, pointerEvents: isPresent ? undefined : "none" }} />;
}
