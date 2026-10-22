import "@/styles/features/person.css";
import type { Metadata } from "next";

import { DEFAULT_SHARE_IMAGE, shareDescription } from "@/lib/share-metadata";
import { img, personTMDB } from "@/lib/tmdb";

/*
 * Fase 5 (P2-09) — metadata de compartilhamento da pessoa. Mesmo padrão de
 * app/title/[type]/[id]/layout.tsx: a página é 'use client', então o layout
 * do segmento exporta generateMetadata sem tocar nela.
 *
 * Indexação: continua noindex (decisão consciente). A página é montada no
 * cliente a partir do TMDB, sem conteúdo próprio do MyCatalog — indexar seria
 * só duplicar o TMDB. Compartilhar (OG) não depende de indexar.
 * Sem JSON-LD: Person exigiria dados que a página não mostra no HTML inicial.
 */

const DEPARTMENT: Record<string, string> = {
  Acting: "Atuação",
  Directing: "Direção",
  Writing: "Roteiro",
  Production: "Produção",
  Creator: "Criação",
  Sound: "Trilha sonora",
  Camera: "Fotografia",
  Editing: "Montagem",
};

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const person = (await personTMDB(id)) as {
      name?: string;
      biography?: string;
      known_for_department?: string;
      profile_path?: string | null;
    };
    if (!person?.name) return {};

    const name = person.name;
    const role = person.known_for_department ? DEPARTMENT[person.known_for_department] : undefined;
    const description = shareDescription(
      person.biography,
      role ? `${name} · ${role}. Filmes e séries no MyCatalog.` : `Filmes e séries de ${name} no MyCatalog.`
    );
    const image = person.profile_path ? img(person.profile_path, "w500") : undefined;
    const url = `/person/${id}`;

    return {
      title: name,
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: url },
      openGraph: {
        type: "profile",
        title: name,
        description,
        url,
        images: [image ? { url: image, width: 500, alt: name } : DEFAULT_SHARE_IMAGE],
      },
      twitter: { card: "summary", title: name, description, images: [image ?? DEFAULT_SHARE_IMAGE.url] },
    };
  } catch {
    // TMDB fora/pessoa inexistente: o proxy já responde 404 no segundo caso; aqui só não derruba a página.
    return {};
  }
}

export default function PersonLayout({ children }: { children: React.ReactNode }) {
  return children;
}
