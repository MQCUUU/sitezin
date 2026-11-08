"use client";

import { MotionConfig } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";

/*
 * Fase 3 — o app tem a própria preferência "Movimento" (html[data-motion="reduced"],
 * lib/preferences.ts) além da do sistema. MotionConfig "user" só lê a do sistema;
 * com a preferência do app ligada, vira "always". Em ambos, transform e layout
 * deixam de animar e opacidade/cor continuam (entendimento sem deslocamento).
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => observer.disconnect();
}

function appPrefersReduced() {
  return document.documentElement.dataset.motion === "reduced";
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useSyncExternalStore(subscribe, appPrefersReduced, () => false);
  return <MotionConfig reducedMotion={reduced ? "always" : "user"}>{children}</MotionConfig>;
}
