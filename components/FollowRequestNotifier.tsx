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
    const incomingSeen = new Set<string>();
    const acceptedSeen = new Set<string>();

    const refresh = async (notify: boolean) => {
      try {
        const response = await fetch("/api/follows", { cache: "no-store" });
        if (cancelled || !response.ok) return;

        const connections = await response.json();
        const incoming = Array.isArray(connections.incoming)
          ? connections.incoming
          : [];
        const accepted = Array.isArray(connections.following)
          ? connections.following
          : [];

        const freshIncoming = incoming.filter(
          (row: any) => !incomingSeen.has(row.follower_id)
        );
        const freshAccepted = accepted.filter(
          (row: any) => !acceptedSeen.has(row.following_id)
        );

        incoming.forEach((row: any) => incomingSeen.add(row.follower_id));
        accepted.forEach((row: any) => acceptedSeen.add(row.following_id));

        window.dispatchEvent(
          new CustomEvent("mycatalog:follows-updated", { detail: connections })
        );

        if (notify && freshIncoming.length && profileUsername) {
          toast.info("Nova solicitação para seguir você", {
            description: `@${
              freshIncoming[0]?.profile?.username || "alguém"
            } quer seguir seu perfil.`,
            duration: 12000,
            actionLabel: "Ver solicitação",
            onAction: () => router.push(`/u/${profileUsername}?tab=connections`),
          });
        }

        if (notify && freshAccepted.length) {
          toast.success("Solicitação aceita", {
            description: `Agora você segue @${
              freshAccepted[0]?.profile?.username || "este perfil"
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
