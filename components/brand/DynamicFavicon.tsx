"use client";

import { useEffect } from "react";

import { brandFaviconHref, needsDynamicFavicon } from "@/lib/brand";
import { readPreferences } from "@/lib/preferences";

/*
 * V3.5 — favicon com o traço central na cor de destaque do usuário.
 *
 * Primeiro paint: o favicon oficial estático (app/icon.svg, destaque
 * padrão) — nunca vazio. Depois de hidratar, se o destaque for outro, um
 * <link rel="icon"> próprio (SVG gerado de lib/brand.ts, data: URL) entra
 * por último no <head> e passa a valer. Atualiza:
 *  - na mesma aba, quando Aparência muda (evento "mycatalog-preferences-updated");
 *  - nas outras abas, pelo evento "storage" (a preferência fica no localStorage);
 *  - só quando o destaque realmente muda (nada a cada render).
 * Destaque padrão/ inválido → remove o link próprio e volta ao estático.
 */
const LINK_ID = "mc-dynamic-favicon";

export function DynamicFavicon() {
  useEffect(() => {
    let current: string | null = null;

    const apply = () => {
      const accent = readPreferences().accent;

      if (accent === current) return;
      current = accent;

      const existing = document.getElementById(LINK_ID);

      if (!needsDynamicFavicon(accent)) {
        existing?.remove();
        return;
      }

      const link = (existing as HTMLLinkElement | null) ?? document.createElement("link");

      link.id = LINK_ID;
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.setAttribute("sizes", "any");
      link.href = brandFaviconHref(accent);
      // Sempre por último: navegadores usam o último ícone equivalente declarado.
      document.head.appendChild(link);
    };

    apply();
    window.addEventListener("mycatalog-preferences-updated", apply);
    window.addEventListener("storage", apply);

    return () => {
      window.removeEventListener("mycatalog-preferences-updated", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);

  return null;
}
