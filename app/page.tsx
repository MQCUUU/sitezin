import type { Metadata } from "next";

import HomeClient from "@/components/HomeClient";

/*
 * V2.1-C — a Home inteira (guest + autenticada) era "use client" desde
 * a primeira linha; Client Component não pode exportar `metadata`, e
 * "/" acabava herdando o `robots: {index:false}` do root layout mesmo
 * sendo a página mais pública do produto. Mesmo padrão já usado em
 * app/title/[type]/[id]/layout.tsx e app/discover/layout.tsx: a
 * implementação inteira (toda a lógica, guest e autenticada, nada
 * alterado além do nome do export) virou components/HomeClient.tsx,
 * e este arquivo é só a casca de metadata — Server Component, sem
 * nenhuma lógica própria.
 */
export const metadata: Metadata = {
  title: "MyCatalog — Filmes, séries e seu histórico em um só lugar",
  description:
    "Organize o que você assiste, acompanhe episódios e temporadas, avalie títulos e descubra o que ver a seguir.",
  robots: { index: true, follow: true },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    title: "MyCatalog — Filmes, séries e seu histórico em um só lugar",
    description:
      "Organize o que você assiste, acompanhe episódios e temporadas, avalie títulos e descubra o que ver a seguir.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "MyCatalog — Filmes, séries e seu histórico em um só lugar",
    description:
      "Organize o que você assiste, acompanhe episódios e temporadas, avalie títulos e descubra o que ver a seguir.",
  },
};

export default function Home() {
  return <HomeClient />;
}
