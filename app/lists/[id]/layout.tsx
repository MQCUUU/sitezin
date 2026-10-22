import type { Metadata } from "next";

import { getDb } from "@/lib/db/neon";
import { isUuid } from "@/lib/lists/validate";
import { DEFAULT_SHARE_IMAGE, listShareDescription } from "@/lib/share-metadata";
import { img } from "@/lib/tmdb";

/*
 * Fase 5 (P2-09) — metadata de compartilhamento da lista (a página é
 * 'use client'; o layout do segmento exporta generateMetadata sem tocá-la).
 *
 * Privacidade: só lista PÚBLICA gera nome/descrição/capa/dono — os mesmos
 * campos que a API (/api/lists/items) já entrega a qualquer visitante. Lista
 * privada recebe um título neutro, sem nada dela, para qualquer pessoa
 * (inclusive o dono: a metadata não depende de sessão, então não há como
 * vazar por cache ou por engano). Visitante nem chega aqui: o proxy responde
 * 404 ("privada ≡ inexistente", a política da API).
 *
 * Indexação: continua noindex (decisão já documentada no robots.ts). Lista é
 * conteúdo do usuário, curto e mutável; o objetivo aqui é o link compartilhado
 * identificar a lista, não ranquear. Sem JSON-LD (ItemList sem os itens no
 * HTML inicial seria um schema vazio).
 */

type Props = { params: Promise<{ id: string }> };

type ListRow = {
  name: string;
  description: string | null;
  is_public: boolean;
  owner_username: string | null;
  item_count: number;
  cover: string | null;
};

const PRIVATE_METADATA: Metadata = {
  title: "Lista privada",
  robots: { index: false, follow: false },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Lista não encontrada" };

  try {
    const rows = (await getDb()`
      SELECT cl.name, cl.description, cl.is_public, p.username AS owner_username,
             (SELECT count(*)::int FROM public.custom_list_items i WHERE i.list_id = cl.id) AS item_count,
             (
               SELECT m.poster_path
               FROM public.custom_list_items i
               JOIN public.media m ON m.id = i.media_id
               WHERE i.list_id = cl.id AND m.poster_path IS NOT NULL
               ORDER BY i.position, i.added_at, i.media_id
               LIMIT 1
             ) AS cover
      FROM public.custom_lists cl
      LEFT JOIN public.profiles p ON p.id = cl.user_id
      WHERE cl.id = ${id}
      LIMIT 1
    `) as ListRow[];

    const list = rows[0];
    if (!list) return { title: "Lista não encontrada" };
    if (!list.is_public) return PRIVATE_METADATA;

    const title = list.name;
    const description = listShareDescription({
      description: list.description,
      itemCount: Number(list.item_count) || 0,
      ownerUsername: list.owner_username,
    });
    const image = list.cover ? img(list.cover, "w500") : undefined;
    const url = `/lists/${id}`;

    return {
      title,
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: url },
      openGraph: {
        type: "website",
        title,
        description,
        url,
        images: [image ? { url: image, width: 500, alt: title } : DEFAULT_SHARE_IMAGE],
      },
      twitter: { card: "summary", title, description, images: [image ?? DEFAULT_SHARE_IMAGE.url] },
    };
  } catch {
    // Banco fora: nada da lista (nem pública) — metadata padrão do app.
    return {};
  }
}

export default function ListLayout({ children }: { children: React.ReactNode }) {
  return children;
}
