"use client";

import {
  useEffect,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/client";

import type {
  Session,
  AuthChangeEvent,
} from "@supabase/supabase-js";

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
];

function isPrivate(
  pathname:
    string
) {
  return PRIVATE_ROUTES.some(
    (
      route
    ) =>
      pathname ===
        route ||
      pathname.startsWith(
        `${route}/`
      )
  );
}

export function SessionSync() {
  const router =
    useRouter();

  const pathname =
    usePathname();

  useEffect(() => {
    const supabase =
      createClient();

    const {
      data:
        subscription,
    } =
      supabase.auth
        .onAuthStateChange(
          (
            event: AuthChangeEvent,
            session: Session | null
          ): void | null | undefined => {
            /*
             * Mantém Server Components, AccountMenu,
             * Home e layouts sincronizados quando a
             * sessão muda no browser.
             */
            if (
              event ===
                "SIGNED_IN" ||
              event ===
                "TOKEN_REFRESHED" ||
              event ===
                "USER_UPDATED"
            ) {
              router.refresh();

              window.dispatchEvent(
                new Event(
                  "mycatalog:session-updated"
                )
              );

              return;
            }

            if (
              event ===
                "SIGNED_OUT" ||
              (
                !session &&
                event ===
                  "INITIAL_SESSION"
              )
            ) {
              window.dispatchEvent(
                new Event(
                  "mycatalog:session-updated"
                )
              );

              /*
               * Se a sessão morrer enquanto o usuário
               * está em uma página privada, não deixamos
               * a UI continuar fingindo que está logada.
               */
              if (
                isPrivate(
                  pathname
                )
              ) {
                const params =
                  new URLSearchParams({
                    reason:
                      "session",

                    next:
                      pathname,
                  });

                router.replace(
                  `/login?${params.toString()}`
                );

                router.refresh();
              }
            }
          }
        );

    return () => {
      subscription
        .subscription
        .unsubscribe();
    };
  }, [
    pathname,
    router,
  ]);

  return null;
}