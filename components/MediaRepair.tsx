"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { bumpLibraryVersion } from "@/lib/library-cache";

/*
 * V2.3 — completa em segundo plano (1x por aba/sessão) títulos da biblioteca
 * sem pôster/gêneros. Silencioso: se algo foi reparado, invalida os caches
 * de sessão e pede ao app para recarregar a biblioteca.
 */
export function MediaRepair() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (isPending || !userId) return;

    const flag = `mycatalog:media-repair:${userId}`;

    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, "1");
    } catch {
      return;
    }

    const timer = window.setTimeout(() => {
      fetch("/api/library/repair-media", { method: "POST" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data?.repaired > 0) {
            bumpLibraryVersion();
            window.dispatchEvent(new CustomEvent("mycatalog:library-updated", { detail: data }));
          }
        })
        // Auxiliar e em segundo plano: tenta de novo na próxima visita.
        .catch((error) => console.warn("[MediaRepair]", error instanceof Error ? error.message : error));
    }, 4000); // não disputa com a carga inicial da tela

    return () => window.clearTimeout(timer);
  }, [isPending, userId]);

  return null;
}
