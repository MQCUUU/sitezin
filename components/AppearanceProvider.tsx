"use client";

import { useEffect } from "react";

import {
  applyPreferences,
  readPreferences,
} from "../lib/preferences";

export function AppearanceProvider() {
  useEffect(() => {
    const apply = () => {
      applyPreferences(readPreferences());
    };

    apply();

    window.addEventListener("storage", apply);

    window.addEventListener(
      "mycatalog-preferences-updated",
      apply
    );

    return () => {
      window.removeEventListener(
        "storage",
        apply
      );

      window.removeEventListener(
        "mycatalog-preferences-updated",
        apply
      );
    };
  }, []);

  return null;
}