import type { Metadata } from "next";

import { getDb } from "@/lib/db/neon";

/*
 * I1 — mesmo padrão de app/title/[type]/[id]/layout.tsx: a página em si
 * é 'use client' (não pode exportar generateMetadata), então um layout
 * no mesmo segmento resolve isso sem tocar a página. Achado da I0 (§14):
 * link de perfil colado em WhatsApp/Twitter mostrava card genérico do
 * app, e a página ficava fora de indexação por padrão mesmo sendo
 * pública por natureza.
 *
 * Privacidade: só usa campos já seguros para visitante anônimo (o mesmo
 * corte de "público" que a API de perfil público aplica antes de
 * qualquer sessão/follow) — nunca expõe bio nem indexa perfil que não
 * seja explicitamente público.
 */

type Props = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT display_name, username, bio, avatar_url, visibility, is_public
      FROM public.profiles
      WHERE lower(username) = lower(${username})
      LIMIT 1
    `;

    const profile = rows[0];
    if (!profile) {
      return { title: "Perfil não encontrado" };
    }

    const isPublic = profile.visibility === "public" || profile.is_public === true;
    const name = profile.display_name || `@${profile.username}`;
    const heading = `${name} (@${profile.username})`;

    const description = isPublic
      ? (profile.bio?.trim()
          ? (profile.bio.trim().length > 155
              ? `${profile.bio.trim().slice(0, 152).trimEnd()}...`
              : profile.bio.trim())
          : `Veja o catálogo de filmes e séries de ${name} no MyCatalog.`)
      : "Este perfil é privado.";

    return {
      title: heading,
      description,
      robots: isPublic ? { index: true, follow: true } : { index: false, follow: false },
      alternates: { canonical: `/u/${profile.username}` },
      openGraph: {
        type: "profile",
        title: heading,
        description,
        url: `/u/${profile.username}`,
        images: profile.avatar_url ? [{ url: profile.avatar_url, alt: name }] : undefined,
      },
      twitter: {
        card: profile.avatar_url ? "summary" : "summary",
        title: heading,
        description,
        images: profile.avatar_url ? [profile.avatar_url] : undefined,
      },
    };
  } catch {
    // Banco fora do ar não pode derrubar a página — cai no metadata do layout raiz.
    return {};
  }
}

export default function PublicProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
