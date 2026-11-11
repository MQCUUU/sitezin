import type { Metadata } from "next";

// V3.5: título da aba ("Entrar · MyCatalog").
export const metadata: Metadata = { title: "Entrar" };

import {
  AuthPage,
} from "@/components/AuthPage";

import { loginBackdropTMDB } from "@/lib/tmdb";

export default async function LoginPage() {
  const backdrop = await loginBackdropTMDB();

  return (
    <AuthPage mode="login" backdrop={backdrop} />
  );
}