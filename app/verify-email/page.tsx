import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailVerificationPage } from "@/components/EmailVerificationPage";

export const metadata: Metadata = { title: "Confirmar e-mail" };

export default function VerifyEmailRoute() {
  return <Suspense fallback={<main className="auth-page auth-centered-page" aria-busy="true" />}><EmailVerificationPage /></Suspense>;
}
