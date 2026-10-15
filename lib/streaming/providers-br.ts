/*
 * Streaming relevantes no Brasil — regra única para "Para você" e "Descobrir".
 *
 * O TMDB devolve ~90 provedores para BR, com variantes que só repetem o
 * serviço ("Amazon Channel", "Apple TV Channel", "with Ads"). Fica: ordem de
 * relevância do próprio TMDB para o Brasil (display_priorities.BR), sem
 * variantes, até 40. O provedor já escolhido (vindo da URL) nunca some da lista.
 */
export type RawProvider = {
  provider_id?: unknown;
  provider_name?: unknown;
  logo_path?: unknown;
  display_priority?: unknown;
  display_priorities?: Record<string, number>;
};

export type BrProvider = { provider_id: number; provider_name: string; logo_path: string | null };

const VARIANT = /amazon channel|apple tv channel|plex channel|roku premium channel|with ads/i;
export const MAX_PROVIDERS = 40;

const brPriority = (p: RawProvider) => Number(p.display_priorities?.BR ?? p.display_priority ?? 999);

export function relevantBrProviders(raw: RawProvider[], keepId?: string | number | null): BrProvider[] {
  const valid = raw
    .map((p) => ({ raw: p, provider_id: Number(p.provider_id), provider_name: String(p.provider_name || "") }))
    .filter((p) => p.provider_id > 0 && p.provider_name);
  const toOut = (p: (typeof valid)[number]): BrProvider => ({
    provider_id: p.provider_id,
    provider_name: p.provider_name,
    logo_path: typeof p.raw.logo_path === "string" ? p.raw.logo_path : null,
  });
  const out = valid
    .filter((p) => !VARIANT.test(p.provider_name))
    .sort((a, b) => brPriority(a.raw) - brPriority(b.raw) || a.provider_name.localeCompare(b.provider_name))
    .slice(0, MAX_PROVIDERS)
    .map(toOut);
  const keep = keepId === null || keepId === undefined ? NaN : Number(keepId);

  if (Number.isFinite(keep) && !out.some((p) => p.provider_id === keep)) {
    const chosen = valid.find((p) => p.provider_id === keep);

    if (chosen) out.push(toOut(chosen));
  }

  return out;
}
