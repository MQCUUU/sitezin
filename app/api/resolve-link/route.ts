import { NextResponse } from 'next/server';
import {
  BASE_SITE_URL,
  normalizeText,
  getCatalogEntries,
  findBestMatch,
} from '@/lib/resolve-link';

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

async function getTMDBDetails(
  id: string,
  type: string
): Promise<{ titlePt: string; titleEn: string; year?: string } | null> {
  if (!id || !TMDB_API_KEY) return null;
  try {
    const endpoint = type === 'tv' ? `tv/${id}` : `movie/${id}`;
    const resPt = await fetch(
      `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&language=pt-BR`,
      { next: { revalidate: 86400 } }
    );
    if (!resPt.ok) return null;
    const dataPt = await resPt.json();

    const titlePt = dataPt.name || dataPt.title || '';
    const titleEn = dataPt.original_name || dataPt.original_title || titlePt;
    const dateStr = dataPt.first_air_date || dataPt.release_date || '';
    const year = dateStr ? dateStr.split('-')[0] : undefined;

    return { titlePt, titleEn, year };
  } catch {
    return null;
  }
}

interface CachedEpisode {
  url: string;
  season: number;
  episode: number;
  isDubbed: boolean;
}

const seriesEpisodesCache = new Map<string, { episodes: CachedEpisode[]; timestamp: number }>();
const EPISODE_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 horas

function extractEpisodesFromHtml(html: string): CachedEpisode[] {
  const episodes: CachedEpisode[] = [];
  const aRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = aRegex.exec(html)) !== null) {
    const rawHref = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim();

    if (!rawHref.includes('.html') || rawHref.includes('browse-') || rawHref.includes('search.php')) {
      continue;
    }

    let decodedHref = rawHref;
    try {
      decodedHref = decodeURIComponent(rawHref);
    } catch {}

    const lower = (decodedHref + ' ' + text).toLowerCase();

    // Extrair temporada:
    let season: number | null = null;
    const sMatch =
      lower.match(/(\d+)\s*(?:a|ª|º)?-?\s*temporada/i) ||
      lower.match(/temporada\s*(?:-|_|\s)?\s*(\d+)/i) ||
      lower.match(/[st](\d{1,2})e\d{1,2}/i);

    if (sMatch) {
      season = parseInt(sMatch[1] || sMatch[2] || sMatch[3], 10);
    }

    // Extrair episódio:
    let episode: number | null = null;
    const epMatch =
      lower.match(/episodio\s*(?:-|_|\s)?\s*(\d+)/i) ||
      lower.match(/ep\s*(?:-|_|\s)?\s*(\d+)/i) ||
      lower.match(/[st]\d{1,2}e(\d{1,2})/i);

    if (epMatch) {
      episode = parseInt(epMatch[1] || epMatch[2] || epMatch[3], 10);
    }

    if (episode !== null) {
      const resolvedSeason = season !== null ? season : 1;
      const fullUrl = rawHref.startsWith('http')
        ? rawHref
        : `${BASE_SITE_URL}/${rawHref.replace(/^\/+/, '')}`;
      const isDubbed = lower.includes('dublado') || lower.includes('nacional');

      episodes.push({
        url: fullUrl,
        season: resolvedSeason,
        episode,
        isDubbed,
      });
    }
  }

  return episodes;
}

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function resolveTvEpisode(
  seriesBrowseUrl: string,
  targetSeason: number,
  targetEpisode: number
): Promise<string> {
  const cached = seriesEpisodesCache.get(seriesBrowseUrl);
  let episodes: CachedEpisode[] = [];

  if (cached && Date.now() - cached.timestamp < EPISODE_CACHE_TTL_MS) {
    episodes = cached.episodes;
  } else {
    try {
      const mainHtml = await fetchPageHtml(seriesBrowseUrl);
      if (mainHtml) {
        episodes.push(...extractEpisodesFromHtml(mainHtml));

        // Subpáginas chave: lista de episódios ou aba Dublado
        const subUrls = new Set<string>();
        const aRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = aRegex.exec(mainHtml)) !== null) {
          const href = match[1];
          const lowerHref = href.toLowerCase();
          if (
            lowerHref.includes('lista-de-episodios') ||
            (lowerHref.includes('browse-') && lowerHref.includes('dublado'))
          ) {
            const full = href.startsWith('http')
              ? href
              : `${BASE_SITE_URL}/${href.replace(/^\/+/, '')}`;
            subUrls.add(full);
          }
        }

        for (const subUrl of subUrls) {
          const subHtml = await fetchPageHtml(subUrl);
          if (subHtml) {
            episodes.push(...extractEpisodesFromHtml(subHtml));
          }
        }
      }

      if (episodes.length > 0) {
        seriesEpisodesCache.set(seriesBrowseUrl, { episodes, timestamp: Date.now() });
      }
    } catch (err) {
      console.error('[resolve-link] Erro ao buscar episódios da série:', err);
    }
  }

  const matches = episodes.filter(
    (e) => e.season === targetSeason && e.episode === targetEpisode
  );
  if (matches.length > 0) {
    const dubbed = matches.find((m) => m.isDubbed);
    return (dubbed || matches[0]).url;
  }

  return seriesBrowseUrl;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let title = searchParams.get('title') || '';
  let year = searchParams.get('year') || '';
  const type = searchParams.get('type') || 'movie';
  const id = searchParams.get('id') || '';
  const seasonRaw = searchParams.get('season');
  const episodeRaw = searchParams.get('episode');

  const targetSeason = seasonRaw ? parseInt(seasonRaw, 10) : null;
  const targetEpisode = episodeRaw ? parseInt(episodeRaw, 10) : null;
  const isSpecificEpisode =
    type === 'tv' &&
    targetSeason !== null &&
    !isNaN(targetSeason) &&
    targetEpisode !== null &&
    !isNaN(targetEpisode);

  const redirectSeriesOrEpisode = async (seriesUrl: string) => {
    if (isSpecificEpisode) {
      const episodeUrl = await resolveTvEpisode(seriesUrl, targetSeason, targetEpisode);
      return NextResponse.redirect(episodeUrl);
    }
    return NextResponse.redirect(seriesUrl);
  };

  let originalTitle: string | null = null;

  // Auto-resolução completa via TMDB se faltar dados
  if (id) {
    const tmdbData = await getTMDBDetails(id, type);
    if (tmdbData) {
      if (!title) title = tmdbData.titlePt;
      if (!year && tmdbData.year) year = tmdbData.year;
      originalTitle = tmdbData.titleEn;
    }
  }

  if (!title) {
    return NextResponse.redirect(BASE_SITE_URL);
  }

  try {
    const entries = getCatalogEntries();

    if (entries.length > 0) {
      // Isola estritamente filmes de séries
      const typeFiltered = entries.filter((e) => (type === 'tv' ? !e.isMovie : e.isMovie));
      const pool = typeFiltered.length > 0 ? typeFiltered : entries;

      // 1. Título em português
      const matchedPt = findBestMatch(pool, title, year);
      if (matchedPt) return await redirectSeriesOrEpisode(matchedPt);

      // 2. Título original em inglês (via TMDB)
      if (originalTitle && normalizeText(originalTitle) !== normalizeText(title)) {
        const matchedEn = findBestMatch(pool, originalTitle, year);
        if (matchedEn) return await redirectSeriesOrEpisode(matchedEn);
      }

      // 3. Fallback pela parte principal se houver ":" ou "-"
      if (title.includes(':') || title.includes('-')) {
        const mainPart = title.split(/[:\-]/)[0].trim();
        const matchedMain = findBestMatch(pool, mainPart, year);
        if (matchedMain) return await redirectSeriesOrEpisode(matchedMain);
      }
    }

    return NextResponse.redirect(BASE_SITE_URL);
  } catch (error) {
    console.error('[resolve-link] Erro:', error);
    return NextResponse.redirect(BASE_SITE_URL);
  }
}
