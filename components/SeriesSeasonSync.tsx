"use client";
import { useEffect } from "react";
import { useAuthState } from "@/hooks/useLibraryAuth";

/*
 * Fase 1 (P2-03): só sincroniza com sessão confirmada. Antes rodava para
 * visitantes e, no 401, apagava a trava de 30 min — um POST inútil (401) a cada
 * carregamento de página. Agora 401 mantém a trava; só falha transitória
 * (rede/5xx) libera nova tentativa.
 */
export function SeriesSeasonSync() {
  const authState = useAuthState();

  useEffect(() => {
    if (authState !== "authenticated") return;
    const key = "mycatalog:season-sync-at";
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 30 * 60 * 1000) return;
    if (!navigator.onLine || (navigator as any).connection?.saveData) return;
    const run = () => { localStorage.setItem(key, String(Date.now()));
    fetch("/api/library/sync-seasons", { method: "POST", keepalive: true }).then(async (response) => {
      if (!response.ok) { if (response.status !== 401) localStorage.removeItem(key); return; }
      const result = await response.json();
      if (result.reopened?.length) window.dispatchEvent(new CustomEvent("mycatalog:library-updated", { detail: result }));
      if (result.generated?.length) window.dispatchEvent(new CustomEvent("mycatalog:notifications-updated", { detail: result }));
    }).catch(() => localStorage.removeItem(key)); };
    const idle = window.requestIdleCallback?.(run, { timeout: 5000 });
    const fallback = idle == null ? window.setTimeout(run, 1800) : null;
    return () => { if (idle != null) window.cancelIdleCallback?.(idle); if (fallback != null) clearTimeout(fallback); };
  }, [authState]);
  return null;
}
