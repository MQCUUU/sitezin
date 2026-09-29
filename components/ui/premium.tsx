"use client";

import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

/*
 * V2.2-B — primitivas de "profundidade" (2 padrões, reutilizados com
 * consistência; nenhuma dependência nova).
 *
 * 1. useSpotlight — brilho que segue o ponteiro numa superfície especial
 *    (hero, cards-resumo, CTA). Padrão popularizado pelo "SpotlightCard" do
 *    React Bits; implementado aqui em ~15 linhas (sem copiar código nem puxar
 *    `motion`/`gsap`): só grava duas CSS vars (`--spot-x/--spot-y`) por
 *    requestAnimationFrame, SEM setState (zero re-render). O desenho é CSS
 *    (`.mc-spot::after`) e só existe com hover real + sem reduced-motion.
 *
 * 2. Reveal — entrada suave (fade + 10px) de seções ABAIXO da dobra, uma vez.
 *    Nada esconde conteúdo antes da hidratação e nada acima da dobra anima
 *    (não afeta LCP/CLS: só opacity/transform).
 */

export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );

  function onPointerMove(event: PointerEvent<T>) {
    // Só mouse/caneta (toque não tem "hover").
    if (event.pointerType === "touch") return;

    const element = ref.current;

    if (!element || frame.current !== null) return;

    const { clientX, clientY } = event;

    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const rect = element.getBoundingClientRect();
      element.style.setProperty("--spot-x", `${clientX - rect.left}px`);
      element.style.setProperty("--spot-y", `${clientY - rect.top}px`);
    });
  }

  return { ref, onPointerMove };
}

export function Reveal({
  as,
  className = "",
  children,
  style,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const Tag = (as || "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"visible" | "pending" | "in">("visible");

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Já na tela (ou sem suporte / reduced-motion): fica como está, sem animar.
    if (
      reduce ||
      typeof IntersectionObserver === "undefined" ||
      element.getBoundingClientRect().top < window.innerHeight * 0.95
    ) {
      return;
    }

    setState("pending");

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("in");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`${className}${state === "pending" ? " mc-reveal" : state === "in" ? " mc-reveal is-in" : ""}`.trim()}
      style={style}
    >
      {children}
    </Tag>
  );
}
