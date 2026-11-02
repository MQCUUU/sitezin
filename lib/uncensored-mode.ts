"use client";

import { useEffect, useState } from "react";

export const UNCENSORED_MODE_KEY = "mycatalog.uncensored_mode.v1";
export const UNCENSORED_MODE_EVENT = "mycatalog:uncensored-mode-updated";

/**
 * Verifica se o Modo Sem Censura está ativado.
 * Seguro contra SSR: retorna false no servidor.
 */
export function isUncensoredModeEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem(UNCENSORED_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Ativa ou desativa o Modo Sem Censura e notifica as abas/componentes.
 */
export function setUncensoredMode(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(UNCENSORED_MODE_KEY, String(enabled));
  } catch {
    // Armazenamento local indisponível
  }
  window.dispatchEvent(
    new CustomEvent(UNCENSORED_MODE_EVENT, { detail: { enabled } })
  );
}

/**
 * Hook reativo para ler e alterar o Modo Sem Censura.
 * Sincroniza em tempo real com eventos locais e entre abas (storage).
 */
export function useUncensoredMode(): [boolean, (val: boolean) => void, boolean] {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEnabled(isUncensoredModeEnabled());

    const onUpdate = (event?: Event) => {
      if (event && "detail" in event && typeof (event as CustomEvent).detail?.enabled === "boolean") {
        setEnabled((event as CustomEvent).detail.enabled);
      } else {
        setEnabled(isUncensoredModeEnabled());
      }
    };

    window.addEventListener(UNCENSORED_MODE_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);

    return () => {
      window.removeEventListener(UNCENSORED_MODE_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const toggle = (val: boolean) => {
    setUncensoredMode(val);
    setEnabled(val);
  };

  return [enabled, toggle, mounted];
}

