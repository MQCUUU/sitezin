"use client";

import { useCallback, useEffect, useRef } from "react";

/*
 * Foco dos diálogos de Listas sobre o primitivo Dialog:
 * - onClose estável: o Dialog refaz o efeito quando onClose muda; com callback
 *   inline do pai, cada re-render (ex.: adicionar um título) devolvia o foco ao
 *   painel e o campo de busca perdia o foco.
 * - foco inicial por efeito (não autoFocus): autoFocus roda antes de o Dialog
 *   guardar o elemento anterior, que virava o próprio input — ao fechar, o foco
 *   caía no <body> em vez de voltar ao botão que abriu o diálogo.
 */
export function useDialogFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  const fieldRef = useRef<T>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Efeito do componente pai roda depois do efeito do Dialog (filho).
  useEffect(() => {
    if (open) fieldRef.current?.focus();
  }, [open]);

  const close = useCallback(() => closeRef.current(), []);

  return { close, fieldRef };
}
