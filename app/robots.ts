import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/*
 * ARQUIVO NOVO. Next gera /robots.txt a partir daqui.
 *
 * Estratégia: só as páginas de título são públicas. Tudo que é
 * biblioteca, perfil, estatística ou API fica fora dos
 * buscadores.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/title/"],
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