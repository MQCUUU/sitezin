import type { Metadata } from "next";

// V3.5: título da aba ("Entrar · MyCatalog").
export const metadata: Metadata = { title: "Entrar" };

import {
  AuthPage,
} from "@/components/AuthPage";

export default function LoginPage() {
  return (
    <AuthPage mode="login" />
  );
}