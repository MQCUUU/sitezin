"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * Fase 5 — lugar do selo de status sobre o pôster. Quando o status muda (ou o
 * título entra/sai da biblioteca), o selo novo aparece com um fade e uma
 * escala curtos (180ms): confirma que a ação pegou, no lugar onde se olhou.
 * `initial={false}`: na carga da grade nada anima — só mudanças.
 * Redução de movimento: o MotionConfig deixa só a opacidade.
 */
export function PosterStatusSlot({ statusKey, children }: { statusKey: string | null; children: ReactNode }) {
  return (
    <span className="mc-tag-slot mc-tag-slot--bottom">
      <AnimatePresence initial={false} mode="popLayout">
        {statusKey ? (
          <motion.span
            key={statusKey}
            className="mc-status-anim"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: EASE_OUT } }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12, ease: EASE_OUT } }}
          >
            {children}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
