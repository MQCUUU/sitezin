"use client";

import { useEffect, useRef } from "react";

/*
 * ============================================================
 * ARQUIVO NOVO — hooks/useModal.ts
 *
 * O PROBLEMA
 *   Nenhum modal do projeto prende o foco. Com Tab, o foco
 *   escapa do modal e vai para os links da barra lateral que
 *   estão ATRÁS do overlay escuro. Quem navega por teclado fica
 *   percorrendo elementos que não consegue ver.
 *
 *   Dois modais (PickForMe e WatchHistory) também não têm
 *   role="dialog", aria-modal nem Escape — para um leitor de
 *   tela eles não são modais, são só um trecho que apareceu no
 *   meio da página.
 *
 * O QUE ESTE HOOK FAZ
 *   1. Fecha no Escape
 *   2. Prende o Tab dentro do modal (foco circula)
 *   3. Foca o primeiro elemento ao abrir
 *   4. Devolve o foco a quem abriu, ao fechar
 *   5. Trava a rolagem do fundo
 *
 * COMO USAR
 *   const ref = useModal(aberto, fechar);
 *   ...
 *   <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="x">
 *
 *   Para bloquear o Escape em momentos críticos (o sorteio do
 *   PickForMe, por exemplo), passe `travado`:
 *
 *   const ref = useModal(open, () => setOpen(false), step === "spinning");
 * ============================================================
 */

/* Tudo que pode receber foco por teclado. */
const FOCAVEIS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useModal(
  aberto: boolean,
  aoFechar: () => void,
  travado = false
) {
  const ref = useRef<HTMLElement>(null);

  /* Guarda quem tinha o foco antes de abrir. */
  const anterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aberto) return;

    anterior.current = document.activeElement as HTMLElement | null;

    /*
     * Trava a rolagem do fundo. Sem isso, rolar dentro do modal
     * e chegar ao fim continua rolando a página atrás — o
     * "scroll chaining".
     */
    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* Foca o primeiro elemento do modal. */
    const focarPrimeiro = () => {
      const alvos = ref.current?.querySelectorAll<HTMLElement>(FOCAVEIS);
      alvos?.[0]?.focus();
    };

    /* requestAnimationFrame: espera o modal existir no DOM. */
    const raf = requestAnimationFrame(focarPrimeiro);

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !travado) {
        evento.preventDefault();
        aoFechar();
        return;
      }

      if (evento.key !== "Tab") return;

      const alvos = ref.current?.querySelectorAll<HTMLElement>(FOCAVEIS);
      if (!alvos || alvos.length === 0) return;

      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];

      /*
       * O laço: Shift+Tab no primeiro volta para o último, e
       * Tab no último volta para o primeiro. É isso que impede
       * o foco de vazar para trás do overlay.
       */
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowOriginal;

      /*
       * Devolve o foco ao botão que abriu o modal. Sem isso, ao
       * fechar o foco volta para o início da página e o usuário
       * de teclado perde o lugar.
       */
      anterior.current?.focus?.();
    };
  }, [aberto, aoFechar, travado]);

  return ref;
}