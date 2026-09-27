"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

export function FollowRequestNotifier() {
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    let profileUsername = "";
    /*
     * E1 — antes baixava o grafo INTEIRO de follows a cada 30s só para
     * fazer diff de sets em memória (E0 §22/§27/§29, HIGH). Agora usa o
     * modo resumo de `GET /api/follows` (sem `type`): contagens via
     * COUNT + só o item mais recente de incoming/accepted — nunca o
     * grafo completo. A detecção de "é novo" passa a comparar o ID do
     * item mais recente (não um Set de todos os IDs já vistos), o que
     * é suficiente para notificar sobre o pedido/aceite mais recente.
     */
    let lastIncomingId: string | null = null;
    let lastAcceptedId: string | null = null;

    const refresh = async (notify: boolean) => {
      try {
        const response = await fetch("/api/follows", { cache: "no-store" });
        if (cancelled || !response.ok) return;

        const summary = await response.json();
        const latestIncoming = summary.latest_incoming;
        const latestAccepted = summary.latest_accepted;

        const isNewIncoming =
          latestIncoming && latestIncoming.follower_id !== lastIncomingId;
        const isNewAccepted =
          latestAccepted && latestAccepted.following_id !== lastAcceptedId;

        if (latestIncoming) lastIncomingId = latestIncoming.follower_id;
        if (latestAccepted) lastAcceptedId = latestAccepted.following_id;

        window.dispatchEvent(
          new CustomEvent("mycatalog:follows-updated", { detail: summary })
        );

        if (notify && isNewIncoming && profileUsername) {
          toast.info("Nova solicitação para seguir você", {
            description: `@${
              latestIncoming?.profile?.username || "alguém"
            } quer seguir seu perfil.`,
            duration: 12000,
            actionLabel: "Ver solicitação",
            onAction: () => router.push(`/u/${profileUsername}?tab=connections`),
          });
        }

        if (notify && isNewAccepted) {
          toast.success("Solicitação aceita", {
            description: `Agora você segue @${
              latestAccepted?.profile?.username || "este perfil"
            }.`,
          });
        }
      } catch {
        // Falha isolada silenciosa de conexão
      }
    };

    // Verificar se usuário está logado e obter o username do perfil
    fetch("/api/profile/username", { cache: "force-cache" })
      .then(async (response) => {
        if (cancelled || !response.ok) return;
        const data = await response.json();
        if (!data?.authenticated) return;
        profileUsername = data.username || "";

        // Carga inicial
        void refresh(false);
      })
      .catch(() => null);

    // Polling inteligente: a cada 30 segundos enquanto a página estiver visível
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && !cancelled) {
        void refresh(true);
      }
    }, 30 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !cancelled) {
        void refresh(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router, toast]);

  return null;
}
