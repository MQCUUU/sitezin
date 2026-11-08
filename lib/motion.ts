/*
 * Fase 3 — linguagem de movimento para Motion (motion/react).
 * Mesmos valores dos tokens --mc-ease-* / --mc-duration-* em styles/tokens.css.
 * Movimento só responde a uma ação ou mostra mudança de estado.
 */
import type { Transition } from "motion/react";

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** Menus e painéis ancorados (conta, notificações): 160ms. */
export const popoverTransition: Transition = { duration: 0.16, ease: EASE_OUT };

/** Folha inferior do celular ("Mais"): entra em 300ms, sai mais rápido. */
export const sheetTransition: Transition = { duration: 0.3, ease: EASE_DRAWER };
export const sheetExitTransition: Transition = { duration: 0.2, ease: EASE_DRAWER };

/** Indicador do item ativo da navegação: desliza sem quicar. */
export const navIndicatorTransition: Transition = { type: "spring", visualDuration: 0.28, bounce: 0 };
