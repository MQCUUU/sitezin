"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

const PRIVATE_ROUTES = [
  "/library",
  "/for-you",
  "/assistant",
  "/diary",
  "/calendar",
  "/ranking",
  "/stats",
  "/retrospective",
  "/favorites",
  "/profile",
  "/settings",
  "/insights",
];

/*
 * V2.1-B — mesma ressalva de proxy.ts: "/lists" é privada (a tela
 * "Minhas listas"), mas "/lists/[id]" (lista pública individual) não
 * pode ser tratada como privada por correspondência de prefixo.
 */
const PRIVATE_EXACT_ROUTES = ["/lists"];

function isPrivate(pathname: string) {
  return (
    PRIVATE_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    ) || PRIVATE_EXACT_ROUTES.some((route) => pathname === route)
  );
}

export function SessionSync() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;

    if (!session?.user && isPrivate(pathname)) {
      const params = new URLSearchParams({
        reason: "session",
        next: pathname,
      });

      router.replace(`/login?${params.toString()}`);
      router.refresh();
    }
  }, [session, isPending, pathname, router]);

  return null;
}
