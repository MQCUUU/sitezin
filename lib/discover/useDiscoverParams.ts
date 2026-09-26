"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  type DiscoverParams,
  parseDiscoverParams,
  serializeDiscoverParams,
} from "./params";

/**
 * Reads Discover's filter state straight from the URL (no mirrored
 * `useState`) and exposes a single `setParams` writer.
 *
 * `setParams` always resets `page` to 1 UNLESS the patch itself sets
 * `page` — that's what lets `goToPage(n)` change only the page while every
 * other filter/sort change collapses back to page 1, matching the old
 * `resetPage()` calls it replaces.
 *
 * Each call is a `router.push` (not `replace`): every applied filter/sort/
 * page change is a deliberate action and becomes its own Back-button step,
 * per B2's spec. A no-op patch (resulting query string identical to the
 * current one) is skipped so toggling something back off doesn't leave a
 * junk history entry.
 */
export function useDiscoverParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(
    () => parseDiscoverParams(searchParams),
    [searchParams]
  );

  const setParams = useCallback(
    (patch: Partial<DiscoverParams>) => {
      const next: DiscoverParams = { ...params, ...patch };

      if (!("page" in patch)) {
        next.page = 1;
      }

      const nextQuery = serializeDiscoverParams(next).toString();
      const currentQuery = serializeDiscoverParams(params).toString();

      if (nextQuery === currentQuery) {
        return;
      }

      router.push(`${pathname}?${nextQuery}`, { scroll: false });
    },
    [params, pathname, router]
  );

  return { params, setParams };
}
