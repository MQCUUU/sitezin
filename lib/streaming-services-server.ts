import { getDb } from "@/lib/db/neon";
import { providersToTmdbFilter } from "@/lib/streaming-services";

/*
 * V2.1-E — Só servidor. Resolve o sentinela `provider=mine` (Discover /
 * Para você) para o filtro do TMDB (`id|id`), sempre escopado ao usuário
 * da sessão. Uma query; string vazia = usuário sem serviços configurados.
 * Depende da tabela `user_streaming_services`: se a migration
 * (supabase/v2.1-e-streaming-services.sql) não foi aplicada, o erro de
 * schema propaga (500) — NÃO é mascarado como "sem serviços".
 */
export const MY_SERVICES_SENTINEL = "mine";

export async function getUserProviderFilter(userId: string): Promise<string> {
  // Sem try/catch de propósito: schema ausente (migration não aplicada)
  // deve falhar de forma visível, não virar "sem serviços" em silêncio.
  const sql = getDb();
  const rows = await sql`
    SELECT provider_id
    FROM public.user_streaming_services
    WHERE user_id = ${userId}
    ORDER BY provider_id
  `;

  return providersToTmdbFilter(rows as { provider_id: number }[]);
}
