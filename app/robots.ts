import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const siteUrl = getSiteUrl();

/*
 * ARQUIVO NOVO. Next gera /robots.txt a partir daqui.
 *
 * Estratégia: páginas de título e Descobrir são públicas e indexáveis
 * (V2.1-C). Tudo que é biblioteca, perfil, estatística ou área pessoal
 * fica fora dos buscadores.
 *
 * V2.1-C — este arquivo é uma segunda camada (crawling), não a decisão
 * final de indexação — quem decide "indexar ou não" é a meta tag
 * `robots` de cada página (root layout = noindex por padrão, overrides
 * em layout.tsx específicos). `/insights` e `/lists` (minhas listas)
 * foram adicionadas aqui por completude/coerência com `proxy.ts`
 * (PRIVATE_ROUTES/PRIVATE_EXACT_ROUTES) — antes ficavam de fora só por
 * omissão, cobertas apenas pelo noindex herdado do root.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/title/", "/discover"],
        disallow: [
          "/api/",
          "/auth/",
          "/library",
          "/favorites",
          "/profile",
          "/settings",
          "/stats",
          "/diary",
          "/calendar",
          "/ranking",
          "/retrospective",
          "/for-you",
          "/assistant",
          "/insights",
          "/lists$", // "$" = só a página exata "/lists" ("minhas listas"); "/lists/[id]" (lista pública individual) não é bloqueada aqui de propósito — continua noindex por herança do root, decisão de indexação futura documentada em docs/V2.1-C-PUBLIC-EXPERIENCE-SEO.md
          "/collection/",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
