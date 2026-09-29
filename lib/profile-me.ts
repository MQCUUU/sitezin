/*
 * V2.2-A — leitura compartilhada de GET /api/profile/username.
 *
 * Antes, AccountMenu, FollowRequestNotifier e UsernameGate faziam cada um o
 * seu próprio fetch dessa rota (e o UsernameGate refazia a cada mudança de
 * página): 3+ idas ao banco por carregamento e 1 por navegação, para a mesma
 * informação. Agora: uma promessa em voo compartilhada + cache curto
 * (TTL 30 s) só em memória do aba, invalidado quando o perfil/conta muda.
 */

export type ProfileMe = {
  authenticated: boolean;
  username: string | null;
  avatar_url: string | null;
  display_name: string | null;
};

const TTL_MS = 30_000;

let inflight: Promise<ProfileMe | null> | null = null;
let cached: { at: number; data: ProfileMe | null } | null = null;

export function invalidateProfileMe(): void {
  cached = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("mycatalog:account-updated", invalidateProfileMe);
  window.addEventListener("mycatalog:profile-updated", invalidateProfileMe);
}

export function fetchProfileMe(): Promise<ProfileMe | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.data);
  if (inflight) return inflight;

  inflight = fetch("/api/profile/username", { cache: "no-store" })
    .then(async (response) => {
      const data = response.ok ? ((await response.json()) as ProfileMe) : null;
      // Só guarda resposta autenticada: "não logado" nunca fica preso no cache
      // (o login acontece sem recarregar o módulo).
      cached = data?.authenticated ? { at: Date.now(), data } : null;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
