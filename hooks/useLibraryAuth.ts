"use client";

/*
 * Fase 1 — estado de autenticação e tratamento de 401 nas ações de biblioteca.
 *
 * Uma única fonte de sessão (authClient.useSession, a mesma do menu da conta),
 * com quatro estados que NÃO são equivalentes:
 *  - "loading"       → ainda não se sabe; nada de UI de visitante nem requisição pessoal;
 *  - "guest"         → visitante confirmado: ações pedem login (sem chamar a API);
 *  - "authenticated" → segue para a API;
 *  - "unknown"       → a consulta da sessão falhou: segue para a API, que decide.
 *
 * 401 numa mutação = "precisa entrar" (visitante) ou "sessão expirou" (o cliente
 * achava que havia sessão). Nunca vira toast técnico ("Não autenticado"/401).
 */
import { useCallback, useMemo } from "react";

import { authClient } from "@/lib/auth/client";
import { ApiError, errorMessage } from "@/lib/api-client";
import {
  clearPendingAction,
  describeIntent,
  loginHref,
  savePendingAction,
  type LibraryIntent,
} from "@/lib/auth/pending-action";
import { mediaStatusLabel } from "@/lib/media-status";
import { useToast } from "@/components/ToastProvider";

export type AuthState = "loading" | "guest" | "authenticated" | "unknown";

export function useAuthState(): AuthState {
  const { data, isPending, error } = authClient.useSession();

  if (isPending) return "loading";
  if (data?.user) return "authenticated";
  if (error) return "unknown";
  return "guest";
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function useLibraryAuth() {
  const state = useAuthState();
  const toast = useToast();

  const promptLogin = useCallback(
    (reason: "guest" | "expired", intent?: LibraryIntent) => {
      const what = intent ? describeIntent(intent, mediaStatusLabel) : null;

      toast.info(reason === "guest" ? "Entre para salvar" : "Sua sessão expirou", {
        description:
          reason === "guest"
            ? what
              ? `Entre ou crie uma conta para ${what}. Depois do login você volta para esta página e a ação é concluída.`
              : "Entre ou crie uma conta para salvar títulos na sua biblioteca."
            : what
              ? `Entre novamente para ${what}. Nada foi salvo ainda; depois do login a ação é concluída.`
              : "Entre novamente para continuar de onde parou.",
        actionLabel: "Entrar",
        duration: 10000,
        onAction: async () => {
          const here = `${window.location.pathname}${window.location.search}`;

          if (intent) savePendingAction(intent, here);
          else clearPendingAction();

          // Sessão expirada: o cookie antigo ainda parece válido para o proxy, que
          // devolveria o usuário da tela de login para cá. Sai primeiro.
          if (reason === "expired") await authClient.signOut().catch(() => undefined);

          window.location.href = loginHref(here, reason === "expired" ? "session" : "action");
        },
      });
    },
    [toast]
  );

  /** Visitante confirmado → convida a entrar e devolve false (a API não é chamada). */
  const requireUser = useCallback(
    (intent?: LibraryIntent) => {
      if (state !== "guest") return true;
      promptLogin("guest", intent);
      return false;
    },
    [state, promptLogin]
  );

  /** Erro de uma ação: 401 vira convite para entrar; o resto, mensagem amigável. */
  const handleError = useCallback(
    (error: unknown, intent?: LibraryIntent, fallback = "Não foi possível salvar") => {
      if (isUnauthorized(error)) {
        promptLogin(state === "guest" ? "guest" : "expired", intent);
        return;
      }

      toast.error(fallback, { description: errorMessage(error, "Tente novamente em instantes.") });
    },
    [state, promptLogin, toast]
  );

  return useMemo(() => ({ state, requireUser, handleError, promptLogin }), [state, requireUser, handleError, promptLogin]);
}
