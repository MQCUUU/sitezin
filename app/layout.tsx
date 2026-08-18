import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";

import { Nav } from "@/components/Nav";
import { AppearanceProvider } from "@/components/AppearanceProvider";
import { ScrollMemory } from "@/components/ScrollMemory";
import { AppProviders } from "@/components/AppProviders";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationCenter } from "@/components/NotificationCenter";

/*
 * O globals.css pede `font-family: Inter, ...` desde sempre,
 * mas a fonte nunca era carregada — ninguém via Inter, só o
 * fallback do sistema.
 *
 * next/font baixa e hospeda a fonte junto com o app: sem
 * requisição ao Google, sem flash de fonte trocando, sem
 * layout shift. `display: swap` mostra o texto no fallback
 * enquanto a fonte carrega.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/*
 * metadataBase é o que permite ao Next transformar caminhos
 * relativos (/og.png) em URLs absolutas nos cards de
 * compartilhamento. Sem ele, WhatsApp e Twitter não conseguem
 * resolver a imagem.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: "MyCatalog",
    /*
     * Páginas filhas que definirem `title` viram
     * "Nome do filme · MyCatalog" automaticamente.
     */
    template: "%s · MyCatalog",
  },

  description:
    "Seu catálogo pessoal de filmes e séries: organize o que assistiu, " +
    "acompanhe temporadas em andamento e avalie por categorias.",

  applicationName: "MyCatalog",

manifest: "/manifest.webmanifest",

formatDetection: {
  telephone: false,
  email: false,
  address: false,
},

appleWebApp: {
  capable: true,
  title: "MyCatalog",
  statusBarStyle:
    "black-translucent",
},

  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "MyCatalog",
    title: "MyCatalog",
    description:
      "Seu catálogo pessoal de filmes e séries.",
    url: siteUrl,
  },

  twitter: {
    card: "summary_large_image",
    title: "MyCatalog",
    description:
      "Seu catálogo pessoal de filmes e séries.",
  },

  /*
   * A biblioteca de alguém não deve aparecer no Google. As
   * páginas públicas (/title/...) sobrescrevem isto no próprio
   * layout delas.
   */
  robots: {
    index: false,
    follow: true,
  },
};

/*
 * viewport e themeColor são export separado desde o Next 14 —
 * dentro de `metadata` eles são ignorados com aviso no build.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090b10" },
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
  <a
    className="skip-link"
    href="#conteudo-principal"
  >
    Pular para o conteúdo principal
  </a>

  <AppProviders>
          <AppearanceProvider />

          <Suspense fallback={null}>
            <ScrollMemory />
          </Suspense>

          <div className="app">
            <Nav />

            <main
  id="conteudo-principal"
  className="main"
  tabIndex={-1}
>
  {children}
</main>
          </div>

          <NotificationCenter />
          <AccountMenu />
        </AppProviders>
      </body>
    </html>
  );
}
