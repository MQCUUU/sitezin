import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db/neon";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 86400; // 24h

const MAX_TITULOS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  const base: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    // V2.1-C — "/discover" passou a ser indexável (robots.ts + layout
    // próprio); sem lastModified porque o conteúdo é dinâmico/filtrável,
    // não uma entidade com data de atualização real.
    {
      url: `${siteUrl}/discover`,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT tmdb_id, media_type, updated_at
      FROM public.media
      WHERE tmdb_id IS NOT NULL
        AND media_type IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT ${MAX_TITULOS}
    `;

    const titulos: MetadataRoute.Sitemap = (rows ?? []).map((m: any) => ({
      url: `${siteUrl}/title/${m.media_type}/${m.tmdb_id}`,
      lastModified: m.updated_at ? new Date(m.updated_at) : undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

    return [...base, ...titulos];
  } catch (erro) {
    console.error("[sitemap] Falha ao ler media:", erro);
    return base;
  }
}
