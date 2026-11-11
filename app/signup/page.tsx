import type { Metadata } from "next";

// V3.5: título da aba ("Criar conta · MyCatalog").
export const metadata: Metadata = { title: "Criar conta" };

import {
  AuthPage,
} from "@/components/AuthPage";

import { loginBackdropTMDB } from "@/lib/tmdb";

export default async function SignupPage() {
  const backdrop = await loginBackdropTMDB();

  return (
    <AuthPage mode="signup" backdrop={backdrop} />
  );
}