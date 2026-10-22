import type { Metadata } from "next";

import { DEFAULT_SHARE_IMAGE, episodeShareTitle, shareDescription } from "@/lib/share-metadata";
import { img, lightweightDetailsTMDB, seasonTMDB } from "@/lib/tmdb";

/*
 * Fase 5 (P2-09) — metadata de compartilhamento do episódio (a página é
 * 'use client'; o layout do segmento exporta generateMetadata sem tocá-la).
 *
 * Indexação: continua noindex (decisão consciente). O conteúdo é o do TMDB
 * montado no cliente; a página indexável da série é /title/tv/{id}, que já
 * tem SSR, canonical e JSON-LD. Sem JSON-LD de TVEpisode aqui pelo mesmo
 * motivo — preferimos nenhum schema a um schema sem conteúdo no HTML.
 */

type Props = { params: Promise<{ id: string; season: string; episode: string }> };

type Episode = { episode_number?: number; name?: string; overview?: string; still_path?: string | null };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, season, episode } = await params;
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  if (!/^\d+$/.test(id) || !Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) return {};

  try {
    const [show, seasonData] = (await Promise.all([
      lightweightDetailsTMDB("tv", id),
      seasonTMDB(id, seasonNumber),
    ])) as [{ name?: string; backdrop_path?: string | null }, { episodes?: Episode[] }];

    const showName = show?.name;
    const item = seasonData?.episodes?.find((entry) => Number(entry?.episode_number) === episodeNumber);
    if (!showName || !item) return {};

    const title = episodeShareTitle({ showName, season: seasonNumber, episode: episodeNumber, episodeName: item.name });
    const description = shareDescription(
      item.overview,
      `Temporada ${seasonNumber}, episódio ${episodeNumber} de ${showName} no MyCatalog.`
    );
    // Imagem do episódio (horizontal); sem ela, o fundo da série.
    const imagePath = item.still_path || show.backdrop_path;
    const image = imagePath ? img(imagePath, "w780") : undefined;
    const url = `/title/tv/${id}/season/${seasonNumber}/episode/${episodeNumber}`;

    return {
      title,
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: url },
      openGraph: {
        type: "video.episode",
        title,
        description,
        url,
        images: [image ? { url: image, width: 780, alt: title } : DEFAULT_SHARE_IMAGE],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [image ?? DEFAULT_SHARE_IMAGE.url],
      },
    };
  } catch {
    // TMDB fora: metadata padrão do app; a página mostra o próprio estado de erro.
    return {};
  }
}

export default function EpisodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
