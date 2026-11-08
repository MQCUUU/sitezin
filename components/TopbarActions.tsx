"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { AccountMenu } from "@/components/AccountMenu";
import { NotificationCenter } from "@/components/NotificationCenter";

/**
 * Single fixed-position anchor for the top-right global actions
 * (notifications + account/auth). Previously NotificationCenter and
 * AccountMenu each had their own independent `position: fixed` with
 * hardcoded coordinates — two unrelated components fighting over the
 * same screen region. Consolidating them here means there is exactly
 * one place that owns that corner, and in-page content (Home's topbar,
 * Search, ...) can reserve space for it via `--mc-topbar-reserved-width`,
 * which this component keeps in sync with its own measured width.
 */
/*
 * Fase 3: telas de autenticação têm layout próprio (o Nav também some nelas).
 * Antes o canto mostrava "Entrar"/"Criar conta" por cima do próprio formulário.
 */
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];

export function TopbarActions() {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    function updateReservedWidth() {
      if (!node) return;
      const width = Math.ceil(node.getBoundingClientRect().width);
      document.documentElement.style.setProperty(
        "--mc-topbar-reserved-width",
        `${width}px`
      );
    }

    updateReservedWidth();

    const observer = new ResizeObserver(updateReservedWidth);
    observer.observe(node);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--mc-topbar-reserved-width");
    };
  }, [isAuthPage]);

  if (isAuthPage) return null;

  return (
    <div className="mc-topbar-actions" ref={ref}>
      <NotificationCenter />
      <AccountMenu />
    </div>
  );
}
