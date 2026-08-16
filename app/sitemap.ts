import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

/*
 * SUBSTITUI app/sitemap.ts
 *
 * A versão anterior declarava só a home. As páginas de título
 * são as ÚNICAS públicas e indexáveis do app (o robots.txt
 * bloqueia biblioteca, perfil, estatísticas e o resto) — então
 * são justamente elas que precisam estar aqui.
 *
 * A validação de NEXT_PUBLIC_SITE_URL da versão anterior foi
 * mantida integralmente.
 *
 * POR QUE service_role
 *   A tabela `media` não é legível sem sessão, e o sitemap é
 *   requisitado por buscadores, sem usuário nenhum. A chave de
 *   serviço ignora o RLS. Ela roda só no servidor — este
 *   arquivo nunca vai para o navegador.
 *
 * POR QUE revalidate
 *   O sitemap é regerado no máximo uma vez por dia, em vez de a
 *   cada visita de robô. Evita consulta ao banco a cada
 *   rastreamento.
 */

export const revalidate = 86400; // 24h

const DEFAULT_SITE_URL = "http://localhost:3000";

/** Teto de URLs. O limite do protocolo é 50.000. */
const MAX_TITULOS = 5000;

function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  try {
    return new URL(configured || DEFAULT_SITE_URL).origin;
  } catch {
    console.error(
      "[sitemap] NEXT_PUBLIC_SITE_URL inválida; usando localhost."
    );

    return DEFAULT_SITE_URL;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  const base: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  /*
   * Sem credenciais, devolve só a home em vez de quebrar a
   * rota. Um sitemap incompleto é bem melhor que um 500.
   */
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[sitemap] Credenciais do Supabase ausentes; publicando só a home."
    );

    return base;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("media")
      .select("tmdb_id, media_type, updated_at")
      .not("tmdb_id", "is", null)
      .not("media_type", "is", null)
      .order("updated_at", { ascending: false })
      .limit(MAX_TITULOS);

    if (error) throw error;

    const titulos: MetadataRoute.Sitemap = (data ?? []).map((m) => ({
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