"use client";

import { useEffect, useRef } from "react";

import { focusableIn, lockScroll, trapTab } from "@/lib/modal-a11y";

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

/* Fase 7: trava de rolagem e laço do Tab vêm de lib/modal-a11y (iguais ao Dialog). */

export function useModal(
  aberto: boolean,
  aoFechar: () => void,
  travado = false,
  /** Seletor do elemento que recebe o foco ao abrir (ex.: o campo de busca); padrão: o primeiro focável. */
  focoInicial?: string
) {
  const ref = useRef<HTMLElement>(null);

  /* Guarda quem tinha o foco antes de abrir. */
  const anterior = useRef<HTMLElement | null>(null);

  /*
   * aoFechar por ref: com callback inline do pai, cada re-render refazia o
   * efeito (devolvia o foco e focava o primeiro de novo — o foco "pulava").
   */
  const fecharRef = useRef(aoFechar);
  /*
   * travado e focoInicial também por ref (Fase 7): quando `travado` mudava, o efeito
   * reiniciava e guardava como "quem abriu" um elemento de DENTRO do modal — ao
   * fechar, o foco ia para um elemento que já não existe.
   */
  const travadoRef = useRef(travado);
  const focoInicialRef = useRef(focoInicial);
  useEffect(() => {
    fecharRef.current = aoFechar;
    travadoRef.current = travado;
    focoInicialRef.current = focoInicial;
  }, [aoFechar, travado, focoInicial]);

  useEffect(() => {
    if (!aberto) return;

    anterior.current = document.activeElement as HTMLElement | null;

    /*
     * Trava a rolagem do fundo. Sem isso, rolar dentro do modal
     * e chegar ao fim continua rolando a página atrás — o
     * "scroll chaining".
     */
    const soltarRolagem = lockScroll();

    /* Foca o primeiro elemento do modal (rAF: espera o modal existir no DOM). */
    const raf = requestAnimationFrame(() => {
      const caixa = ref.current;
      if (!caixa || caixa.contains(document.activeElement)) return;
      const alvo = focoInicialRef.current ? caixa.querySelector<HTMLElement>(focoInicialRef.current) : null;
      (alvo ?? focusableIn(caixa)[0] ?? caixa)?.focus();
    });

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !travadoRef.current) {
        evento.preventDefault();
        fecharRef.current();
        return;
      }
      /* O laço do Tab impede o foco de vazar para trás do overlay. */
      trapTab(evento, ref.current);
    };

    document.addEventListener("keydown", aoTeclar);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", aoTeclar);
      soltarRolagem();

      /*
       * Devolve o foco ao botão que abriu o modal. Sem isso, ao
       * fechar o foco volta para o início da página e o usuário
       * de teclado perde o lugar.
       */
      anterior.current?.focus?.();
    };
  }, [aberto]);

  return ref;
}