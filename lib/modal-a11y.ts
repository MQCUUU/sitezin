/*
 * Fase 7 — peças compartilhadas dos modais (Dialog, useModal e os diálogos próprios).
 *
 * lockScroll: trava a rolagem do <body> com CONTADOR. O padrão antigo
 * ("guarda o overflow anterior e restaura") deixava a página travada quando dois
 * modais fechavam fora de ordem: o segundo restaurava o "hidden" que o primeiro
 * tinha posto. Aqui só o último a soltar devolve o valor original.
 *
 * trapTab: mantém o Tab dentro do container (Shift+Tab no primeiro vai para o
 * último e vice-versa).
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

let locks = 0;
let savedOverflow = "";

/** Trava a rolagem do body. Devolve a função que solta (pode ser chamada mais de uma vez). */
export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (locks === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = savedOverflow;
  };
}

/** Elementos focáveis do container, na ordem do documento. */
export function focusableIn(container: HTMLElement | null): HTMLElement[] {
  return container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
}

/** Chame no keydown: se for Tab, mantém o foco circulando dentro do container. */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab") return;
  const focusable = focusableIn(container);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  // Foco fora do modal (ex.: o elemento focado sumiu ao trocar o conteúdo): volta para dentro.
  if (container && typeof container.contains === "function" && !container.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
