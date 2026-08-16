"use client";

import {
  type ReactNode,
} from "react";

import {
  ToastProvider,
} from "@/components/ToastProvider";

import {
  SessionSync,
} from "@/components/SessionSync";

export function AppProviders({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <ToastProvider>
      <SessionSync />

      {children}
    </ToastProvider>
  );
}