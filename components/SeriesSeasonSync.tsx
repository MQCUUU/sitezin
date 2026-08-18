"use client";
import { useEffect } from "react";

export function SeriesSeasonSync() {
  useEffect(() => {
    const key = "mycatalog:season-sync-at";
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 6 * 60 * 60 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    fetch("/api/library/sync-seasons", { method: "POST" }).then(async (response) => {
      if (!response.ok) { localStorage.removeItem(key); return; }
      const result = await response.json();
      if (result.reopened?.length) window.dispatchEvent(new CustomEvent("mycatalog:library-updated", { detail: result }));
    }).catch(() => localStorage.removeItem(key));
  }, []);
  return null;
}
