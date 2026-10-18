"use client";

import { useEffect } from "react";

import { brandFaviconHref, needsDynamicFavicon } from "@/lib/brand";
import { readPreferences } from "@/lib/preferences";

/*
 * V3.5 — favicon com o traço central na cor de destaque do usuário.
 *
 * Primeiro paint: o favicon oficial estático (app/icon.svg, destaque
 * padrão) — nunca vazio. Depois de hidratar, se o destaque for outro, UM
 * <link rel="icon"> próprio (SVG gerado de lib/brand.ts, data: URL) fica por
 * último no <head> e passa a valer (navegadores usam o último ícone
 * equivalente declarado). Atualiza:
 *  - na mesma aba, quando Aparência muda (evento "mycatalog-preferences-updated");
 *  - nas outras abas, pelo evento "storage" (a preferência fica no localStorage);
 *  - quando o Next refaz o head de metadata (ver abaixo).
 * Destaque padrão/ inválido → remove o link próprio e volta ao estático.
 *
 * Hotfix: a cada navegação o App Router remove e reinsere os <link> de
 * metadata (icon.svg, apple-icon) no FIM do <head> — o estático voltava a
 * valer. Isso acontece também sem troca de pathname (?tab=, voltar/avançar)
 * e, em rotas com metadata assíncrona (título, perfil), num commit posterior
 * ao da página; nenhum efeito de rota pega todos os casos. Por isso um
 * MutationObserver só nos filhos diretos do <head>, ligado só enquanto há
 * destaque personalizado, devolve o nosso link para o fim quando entra outro
 * ícone. O SVG/href só é gerado de novo quando o destaque muda.
 */
const LINK_ID = "mc-dynamic-favicon";

export function DynamicFavicon() {
  useEffect(() => {
    let accent: string | null = null;
    let link: HTMLLinkElement | null = null;

    const keepLast = () => {
      if (!link) return;
      const icons = document.head.querySelectorAll('link[rel~="icon"]');
      if (icons[icons.length - 1] !== link) document.head.appendChild(link);
    };

    const observer = new MutationObserver((mutations) => {
      const otherIcon = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) => node !== link && node instanceof HTMLLinkElement && /\bicon\b/.test(node.rel)
        )
      );
      if (otherIcon) keepLast();
    });

    const apply = () => {
      const next = readPreferences().accent;

      if (next === accent) return;
      accent = next;

      if (!needsDynamicFavicon(next)) {
        observer.disconnect();
        link?.remove();
        link = null;
        return;
      }

      if (!link) {
        link = (document.getElementById(LINK_ID) as HTMLLinkElement | null) ?? document.createElement("link");
        link.id = LINK_ID;
        link.rel = "icon";
        link.type = "image/svg+xml";
        link.setAttribute("sizes", "any");
        observer.observe(document.head, { childList: true });
      }

      link.href = brandFaviconHref(next);
      keepLast();
    };

    apply();
    window.addEventListener("mycatalog-preferences-updated", apply);
    window.addEventListener("storage", apply);

    return () => {
      observer.disconnect();
      window.removeEventListener("mycatalog-preferences-updated", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);

  return null;
}
