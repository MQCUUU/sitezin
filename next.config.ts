import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

/*
 * CSP estatica: preserva o prerender/cache do App Router e bloqueia fontes
 * de conteudo que o site nao usa. O bootstrap do Next e estilos dinamicos
 * exigem unsafe-inline; unsafe-eval fica limitado ao desenvolvimento.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  [
    "img-src 'self' data: blob:",
    "https://image.tmdb.org",
    "https://qjjwbprpvtltvszoeojx.supabase.co",
    "https://cdn.discordapp.com",
    "https://lh3.googleusercontent.com",
    "https://avatars.githubusercontent.com",
    "https://secure.gravatar.com",
  ].join(" "),
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    ...(isDevelopment ? ["http://localhost:*", "ws://localhost:*"] : []),
  ].join(" "),
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
].join("; ");
 
const nextConfig: NextConfig = {
  poweredByHeader: false,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
    ],
 
    /*
     * AVIF e WebP no lugar do JPEG que o TMDB entrega.
     * Redução típica de 40-60% no peso, sem perda visível.
     * A ordem importa: o navegador recebe o primeiro que
     * suportar.
     */
    formats: ["image/avif", "image/webp"],
 
    /*
     * Larguras que o next/image pode gerar. Ajustadas à sua
     * grade real: pôsteres pequenos (~150px) na grid, médios
     * na lista, grande só na página de título.
     */
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 160, 200, 256, 384],
 
    /*
     * Cache mínimo de 24h para as imagens otimizadas. Capas de
     * filme não mudam.
     */
    minimumCacheTTL: 86400,
  },
 
  /*
   * Headers de segurança.
   *
   * Aplicados a todas as rotas. Nenhum deles quebra
   * funcionalidade existente — são todos restrições que o app
   * já respeita na prática.
   *
   * A CSP foi calibrada para o App Router, Supabase, imagens externas
   * e trailers do YouTube sem desativar o prerender das páginas.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            /*
             * Impede o navegador de "adivinhar" o tipo de um
             * arquivo. Fecha uma classe de ataque onde um
             * upload é interpretado como script.
             */
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            /*
             * Impede que o site seja embutido em iframe de
             * outro domínio — proteção contra clickjacking.
             */
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            /*
             * Não vaza a URL completa (que pode conter id de
             * título, filtros) para sites externos.
             */
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            /*
             * Desliga APIs que o app não usa. Se um dia você
             * adicionar upload de foto pela câmera, remova
             * "camera" daqui.
             */
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            /*
             * Força HTTPS por 2 anos. Só tem efeito em
             * produção com HTTPS; em localhost é ignorado.
             */
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
