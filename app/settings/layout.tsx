import "@/styles/features/settings.css";
import type { Metadata } from "next";

// V3.5: a página é 'use client' (não exporta metadata); o título da aba vem daqui.
export const metadata: Metadata = { title: "Configurações" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
