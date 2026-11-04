"use client";

import { fetchProfileMe } from "@/lib/profile-me";
import { useEffect } from "react";

export function FollowRequestNotifier() {
  useEffect(() => {
    let cancelled = false;
    let authenticated = false;

    const refresh = async () => {
      try {
        const response = await fetch("/api/follows", { cache: "no-store" });
        if (cancelled || !response.ok) return;
        const summary = await response.json();
        window.dispatchEvent(new CustomEvent("mycatalog:follows-updated", { detail: summary }));
      } catch {
        // Falha isolada de conexão; a próxima atualização tenta novamente.
      }
    };

    fetchProfileMe()
      .then((data) => {
        if (cancelled || !data?.authenticated) return;
        authenticated = true;
        void refresh();
      })
      .catch((error) => console.warn("[FollowRequestNotifier]", error instanceof Error ? error.message : error));

    const timer = setInterval(() => {
      if (authenticated && document.visibilityState === "visible" && navigator.onLine && !cancelled) void refresh();
    }, 30 * 1000);
    const handleVisibility = () => {
      if (authenticated && document.visibilityState === "visible" && navigator.onLine && !cancelled) void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
