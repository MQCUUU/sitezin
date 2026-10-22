"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { isPrivatePath } from "@/lib/private-routes";

// Mesma lista do proxy (fonte única: lib/private-routes.ts).
const isPrivate = isPrivatePath;

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
