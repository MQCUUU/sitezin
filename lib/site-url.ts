const PRODUCTION_FALLBACK_URL = "https://catalogmy.vercel.app";

/*
 * V2.1-C — hardening: o bug real observado em produção (`og:url =
 * http://localhost:3000`) foi corrigido manualmente ajustando
 * `NEXT_PUBLIC_SITE_URL` no painel da Vercel, mas o código em si nunca
 * impedia isso de voltar a acontecer — `normalizeSiteUrl` aceitava
 * `http://localhost`/`127.0.0.1` sem checar o ambiente. Se alguém
 * reconfigurasse essa env var incorretamente em Production no futuro,
 * o bug reapareceria silenciosamente.
 *
 * `isProductionRuntime()` é a fonte de verdade sobre "estou rodando em
 * produção de verdade", usando `VERCEL_ENV` (definida automaticamente
 * pela Vercel: "production" | "preview" | "development") — não
 * `NODE_ENV`, que é `"production"` também em `next build` local e não
 * distingue Preview de Production.
 */
function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production";
}

function normalizeSiteUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
      return null;
    }

    // Em produção real, uma URL local nunca é uma origem válida —
    // nunca usada em canonical/OpenGraph/sitemap/robots.
    if (isLocal && isProductionRuntime()) {
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

/**
 * Exportado só para teste unitário isolado (ver __tests__/site-url).
 * Não usar fora disso — o contrato público continua sendo getSiteUrl().
 */
export const __internal = { normalizeSiteUrl, isProductionRuntime };
