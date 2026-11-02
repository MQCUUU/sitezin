"use client";

import { useEffect, useSyncExternalStore } from "react";

export const UNCENSORED_MODE_KEY = "mycatalog.uncensored_mode.v1";
export const UNCENSORED_MODE_EVENT = "mycatalog:uncensored-mode-updated";

/**
 * Verifica se o Modo Sem Censura está ativado localmente.
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
 * Salva localmente e notifica ouvintes.
 */
function storeLocally(enabled: boolean): void {
  if (typeof window === "undefined") return;
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
 * Salva na CONTA via API (persistência no banco de dados Neon).
 */
export async function saveUncensoredModeToAccount(enabled: boolean): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/profile/uncensored-mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
      keepalive: true,
    });
  } catch {
    // Falha de rede ou não autenticado: mantém local
  }
}

/**
 * Ativa ou desativa o Modo Sem Censura:
 * 1. Salva no localStorage imediatamente.
 * 2. Emite evento para a aba atual e outras abas.
 * 3. Persiste na conta do usuário no banco remoto.
 */
export function setUncensoredMode(enabled: boolean): void {
  storeLocally(enabled);
  void saveUncensoredModeToAccount(enabled);
}

/**
 * Sincroniza o estado da conta (banco remoto) com o dispositivo atual.
 */
export async function syncUncensoredModeFromAccount(): Promise<boolean | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/profile/uncensored-mode", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.authenticated && typeof data.enabled === "boolean") {
      const currentLocal = isUncensoredModeEnabled();
      if (currentLocal !== data.enabled) {
        storeLocally(data.enabled);
      }
      return data.enabled;
    }
  } catch {
    // Não autenticado ou sem rede
  }
  return null;
}

const subscribe = (callback: () => void) => {
  window.addEventListener(UNCENSORED_MODE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(UNCENSORED_MODE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
};

const getSnapshot = () => isUncensoredModeEnabled();
const getServerSnapshot = () => false;

const emptySubscribe = () => () => {};
const getMountedClient = () => true;
const getMountedServer = () => false;

/**
 * Hook reativo para ler e alterar o Modo Sem Censura.
 * Sincroniza em tempo real com eventos locais, entre abas (storage) e com a conta na nuvem.
 */
export function useUncensoredMode(): [boolean, (val: boolean) => void, boolean] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const mounted = useSyncExternalStore(emptySubscribe, getMountedClient, getMountedServer);

  useEffect(() => {
    // Sincroniza com a conta remota ao montar (ex: se ativou no PC e abriu no mobile)
    void syncUncensoredModeFromAccount();
  }, []);

  const toggle = (val: boolean) => {
    setUncensoredMode(val);
  };

  return [enabled, toggle, mounted];
}
