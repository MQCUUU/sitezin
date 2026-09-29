/*
 * V2.1-E — serviços de streaming do usuário.
 *
 * Só guardamos "eu tenho este serviço": ID canônico do TMDB (região BR,
 * a mesma que Discover/Para Você já usam) + nome/logo para exibir com
 * fallback textual. Nenhuma credencial.
 */
export const MAX_STREAMING_SERVICES = 40;

export type StreamingService = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

/** Valida/normaliza o payload do PUT. Retorna null se inválido. */
export function parseStreamingServices(input: unknown): StreamingService[] | null {
  if (!Array.isArray(input) || input.length > MAX_STREAMING_SERVICES) return null;

  const seen = new Set<number>();
  const result: StreamingService[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;

    const item = raw as Record<string, unknown>;
    const id = Number(item.provider_id);
    const name = typeof item.provider_name === "string" ? item.provider_name.trim() : "";

    if (!Number.isInteger(id) || id <= 0 || name.length < 1 || name.length > 80) return null;

    const logo =
      typeof item.logo_path === "string" && /^\/[A-Za-z0-9._-]+$/.test(item.logo_path)
        ? item.logo_path
        : null;

    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ provider_id: id, provider_name: name, logo_path: logo });
  }

  return result;
}

/** Valor de `with_watch_providers` do TMDB (OR por "|"). */
export function providersToTmdbFilter(services: Pick<StreamingService, "provider_id">[]): string {
  return services.map((service) => service.provider_id).join("|");
}
