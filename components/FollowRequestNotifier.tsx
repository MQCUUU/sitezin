"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { createClient } from "@/lib/supabase/client";

export function FollowRequestNotifier() {
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const incomingSeen = new Set<string>();
    const acceptedSeen = new Set<string>();
    const refresh = async (notify: boolean) => {
      const [followsResponse, profileResponse] = await Promise.all([fetch("/api/follows", { cache: "no-store" }), fetch("/api/profile/username", { cache: "no-store" })]);
      if (cancelled || !followsResponse.ok || !profileResponse.ok) return;
      const [connections, profile] = await Promise.all([followsResponse.json(), profileResponse.json()]);
      const incoming = Array.isArray(connections.incoming) ? connections.incoming : [];
      const accepted = Array.isArray(connections.following) ? connections.following : [];
      const freshIncoming = incoming.filter((row: any) => !incomingSeen.has(row.follower_id));
      const freshAccepted = accepted.filter((row: any) => !acceptedSeen.has(row.following_id));
      incoming.forEach((row: any) => incomingSeen.add(row.follower_id));
      accepted.forEach((row: any) => acceptedSeen.add(row.following_id));
      window.dispatchEvent(new CustomEvent("mycatalog:follows-updated", { detail: connections }));
      if (notify && freshIncoming.length && profile.username) toast.info("Nova solicitação para seguir você", { description: `@${freshIncoming[0]?.profile?.username || "alguém"} quer seguir seu perfil.`, duration: 12000, actionLabel: "Ver solicitação", onAction: () => router.push(`/u/${profile.username}?tab=connections`) });
      if (notify && freshAccepted.length) toast.success("Solicitação aceita", { description: `Agora você segue @${freshAccepted[0]?.profile?.username || "este perfil"}.` });
    };
    supabase.auth.getUser().then((result: any) => {
      const data = result.data;
      if (cancelled || !data.user) return;
      void refresh(false).then(() => {
        channel = supabase.channel(`follows:${data.user!.id}`).on("postgres_changes", { event: "*", schema: "public", table: "follows" }, (payload: any) => {
          const row = payload.new?.follower_id ? payload.new : payload.old;
          if (row?.follower_id === data.user!.id || row?.following_id === data.user!.id) void refresh(true);
        }).subscribe();
        timer = setInterval(() => void refresh(true), 30000);
      });
    }).catch(() => null);
    return () => { cancelled = true; if (timer) clearInterval(timer); if (channel) void supabase.removeChannel(channel); };
  }, [router, toast]);
  return null;
}
