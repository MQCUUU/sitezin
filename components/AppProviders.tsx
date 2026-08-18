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
import { UsernameGate } from "@/components/UsernameGate";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { PopoverCollisionGuard } from "@/components/PopoverCollisionGuard";
import { FollowRequestNotifier } from "@/components/FollowRequestNotifier";
import { SeriesSeasonSync } from "@/components/SeriesSeasonSync";

export function AppProviders({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <SessionSync />
        <PopoverCollisionGuard />
        <FollowRequestNotifier />
        <SeriesSeasonSync />
        <UsernameGate />
        {children}
      </ConfirmProvider>
    </ToastProvider>
  );
}
