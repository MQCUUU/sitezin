"use client";

import { useEffect } from "react";
import { bumpLibraryVersion, isLibraryMutation } from "@/lib/library-cache";

/*
 * V2.2-A (gate) — observa mutações bem-sucedidas de Library/ocultos/progresso
 * e sobe a versão global (lib/library-cache.ts). Não altera nenhuma resposta:
 * o wrapper de `fetch` só repassa a Response original.
 */
export function LibraryMutationWatcher() {
  useEffect(() => {
    const flag = "__mycatalogLibraryWatcher";
    const globalWindow = window as unknown as Record<string, unknown>;

    if (!globalWindow[flag]) {
      globalWindow[flag] = true;

      const original = window.fetch.bind(window);

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await original(input, init);

        try {
          if (response.ok && isLibraryMutation(input, init)) bumpLibraryVersion();
        } catch {
          /* nunca interfere na requisição original */
        }

        return response;
      };
    }

    // sync-seasons reabriu séries (evento já existente do produto).
    window.addEventListener("mycatalog:library-updated", bumpLibraryVersion);

    return () => window.removeEventListener("mycatalog:library-updated", bumpLibraryVersion);
  }, []);

  return null;
}
