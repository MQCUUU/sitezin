import "./globals.css";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/primitives.css";
import "@/styles/overlays.css";
import "@/styles/shell.css";
import "@/styles/topbar.css";
import "@/styles/media-card.css";
import "@/styles/home-depth.css";
import "@/styles/discover.css";
import "@/styles/search.css";
import "@/styles/title.css";
import "@/styles/media-preview.css";
import "@/styles/media-unified.css";
// Fase 4: insights/calendar/diary.css vão só nas rotas que os usam (não no Login, Home, Busca…).
import "@/styles/lists.css";
import "@/styles/brand.css";
// Projeção (Fase 2): enquadramento e dobra sobre o pôster.
import "@/styles/frame.css";
// Fase 3: padrão final de controles (botões, chips, ícones, diálogos) — por último.
import "@/styles/controls.css";

import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { Suspense } from "react";

import { Nav } from "@/components/Nav";
import { AppearanceProvider } from "@/components/AppearanceProvider";
import { ScrollMemory } from "@/components/ScrollMemory";
import { AppProviders } from "@/components/AppProviders";
import { TopbarActions } from "@/components/TopbarActions";
import { getSiteUrl } from "@/lib/site-url";

/*
 * Projeção (Fase 1): uma família só — Archivo, variável em peso e largura
 * (eixo wdth 62–125): títulos condensados de cartaz e texto na largura normal.
 * next/font hospeda a fonte junto com o app (sem requisição ao Google) e ajusta
 * a fonte de reserva para não haver salto de layout; `display: swap` mostra a
 * reserva enquanto carrega.
 */
const sans = Archivo({
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth"],
  variable: "--font-sans",
});

/*
 * metadataBase é o que permite ao Next transformar caminhos
 * relativos (/og.png) em URLs absolutas nos cards de
 * compartilhamento. Sem ele, WhatsApp e Twitter não conseguem
 * resolver a imagem.
 */
const siteUrl = getSiteUrl();

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
    { media: "(prefers-color-scheme: dark)", color: "#121113" },
    { media: "(prefers-color-scheme: light)", color: "#f2f0ec" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={sans.variable}>
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

          <TopbarActions />
        </AppProviders>
      </body>
    </html>
  );
}
