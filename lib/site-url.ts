const PRODUCTION_FALLBACK_URL = "https://catalogmy.vercel.app";

function normalizeSiteUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

/**
 * URL canonica usada por metadata, robots e sitemap.
 * NEXT_PUBLIC_SITE_URL continua tendo prioridade para permitir dominio proprio.
 */
export function getSiteUrl() {
  const configured = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const vercelProductionUrl = normalizeSiteUrl(
    vercelProductionHost ? `https://${vercelProductionHost}` : undefined
  );

  return vercelProductionUrl || PRODUCTION_FALLBACK_URL;
}
