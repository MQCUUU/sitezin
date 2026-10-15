"use client";

import { useEffect, useRef } from "react";

import { authClient } from "@/lib/auth/client";
import { PREFERENCES_KEY, applyAccountPreferences, readPreferences, saveToAccount } from "@/lib/preferences";

/*
 * Aparência que acompanha a CONTA. Ao identificar o usuário (login, refresh,
 * outro aparelho): a versão salva na conta vence e é aplicada; se a conta ainda
 * não tem nenhuma e este navegador já foi personalizado, esta personalização
 * vira a da conta (ninguém perde o que já tinha escolhido). Sem sessão: nada.
 */
export function PreferencesSync() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || synced.current === userId) return;

    synced.current = userId;

    fetch("/api/profile/preferences", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;

        const data = (await response.json()) as { appearance: unknown };

        if (data.appearance) {
          if (JSON.stringify(data.appearance) !== JSON.stringify(readPreferences())) applyAccountPreferences(data.appearance);
          return;
        }

        let customized = false;

        try {
          customized = Boolean(localStorage.getItem(PREFERENCES_KEY));
        } catch {
          customized = false;
        }

        if (customized) saveToAccount(readPreferences());
      })
      .catch(() => {});
  }, [userId]);

  return null;
}
