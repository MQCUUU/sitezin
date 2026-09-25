"use client";

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
export function TopbarActions() {
  const ref = useRef<HTMLDivElement>(null);

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

    return () => observer.disconnect();
  }, []);

  return (
    <div className="mc-topbar-actions" ref={ref}>
      <NotificationCenter />
      <AccountMenu />
    </div>
  );
}
