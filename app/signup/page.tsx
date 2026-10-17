import type { Metadata } from "next";

// V3.5: título da aba ("Criar conta · MyCatalog").
export const metadata: Metadata = { title: "Criar conta" };

import {
  AuthPage,
} from "@/components/AuthPage";

export default function SignupPage() {
  return (
    <AuthPage mode="signup" />
  );
}