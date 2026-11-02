import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_SITE_URL = 'https://redecanais.by';
const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

interface CatalogEntry {
  title: string;
  pureName: string;
  subNames: string[];
  tokens: string[];
  url: string;
  isMovie: boolean;
  isDubbed: boolean;
  year?: string;
}

let cachedEntries: CatalogEntry[] | null = null;

const STOP_WORDS = new Set([
  'e', 'and', 'the', 'o', 'a', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'of', 'in',
  'dublado', 'legendado', 'nacional', 'original', 'completo', 'hd', 'fhd', '4k', '1080p', '720p', 'filme'
]);

const ROMAN_NUMERALS = ['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', '2', '3', '4', '5'];

const DERIVATIVES = [
  'toronto', 'intencao-criminal', 'criminal-intent',
  'crimes-premeditados', 'organized-crime', 'crime-organizado',
  'true-crime', 'uk', 'vitimas-especiais', 'unidade-de-vitimas-especiais', 'svu',
  'trial-by-jury', 'los-angeles'
];

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/c\.s\.i\./gi, 'csi')
    .replace(/\bnova york\b/gi, 'ny')
    .replace(/&amp;?/gi, ' ')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getTokens(text: string): string[] {
  const clean = text.replace(/\s*\([^)]*\)/g, '');
  return normalizeText(clean)
    .split('-')
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

function extractPureName(rawTitle: string): string {
  const withoutParentheses = rawTitle.replace(/\s*\([^)]*\)/g, '');
  const withoutYear = withoutParentheses.replace(/\s*-\s*\d{4}.*$/, '');
  return normalizeText(withoutYear);
}

function getCatalogEntries(): CatalogEntry[] {
  if (cachedEntries && cachedEntries.length > 0) {
    return cachedEntries;
  }

  const publicDir = path.join(process.cwd(), 'public');
  const entries: CatalogEntry[] = [];
  const itemRegex = /<span[^>]*>([\s\S]*?)<\/span>\s*-\s*<a\s+href=["']([^"']+)["']/gi;

  const filesConfig = [
    { file: 'mapafilmes.html', isMovieFile: true },
    { file: 'mapa.html', isMovieFile: false }
  ];

  for (const cfg of filesConfig) {
    const filePath = path.join(publicDir, cfg.file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let match;
        while ((match = itemRegex.exec(content)) !== null) {
          const rawTitle = match[1].trim();
          const rawHref = match[2].trim();
          const fullUrl = rawHref.startsWith('http')
            ? rawHref
            : `${BASE_SITE_URL}/${rawHref.replace(/^\/+/, '')}`;

          // Captura ano com precisão: dentro de parênteses "(2023)" ou entre traços "- 2023 -" ou no final
          const yearMatch = rawTitle.match(/\b(19\d\d|20\d\d)\b/) || rawHref.match(/-(19\d\d|20\d\d)-/);
          const foundYear = yearMatch ? yearMatch[1] : undefined;

          // Se veio de mapafilmes.html, é 100% filme
          const isMovie = cfg.isMovieFile;

          const lowerCheck = (rawTitle + ' ' + fullUrl).toLowerCase();
          const isDubbed = lowerCheck.includes('dublado') || lowerCheck.includes('nacional');

          const cleanTitle = rawTitle.replace(/\s*\([^)]*\)/g, '');
          const parts = cleanTitle.split(/[/:]/).map((p) => normalizeText(p)).filter(Boolean);

          entries.push({
            title: rawTitle,
            pureName: extractPureName(rawTitle),
            subNames: parts,
            tokens: getTokens(rawTitle),
            url: fullUrl,
            isMovie,
            isDubbed,
            year: foundYear,
          });
        }
      } catch (err) {
        console.error(`[resolve-link] Erro ao ler ${cfg.file}:`, err);
      }
    }
  }

  if (entries.length > 0) {
    cachedEntries = entries;
  }

  return entries;
}

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

function pickBestDubbed(matches: CatalogEntry[]): string {
  const dubbed = matches.find((e) => e.isDubbed);
  return (dubbed || matches[0]).url;
}

function findBestMatch(pool: CatalogEntry[], targetTitle: string, year?: string): string | null {
  const normTarget = normalizeText(targetTitle);
  const targetTokens = getTokens(targetTitle);

  if (targetTokens.length === 0) return null;

  // 1. Suporte específico para Law & Order
  const isLO = (targetTokens.includes('lei') && targetTokens.includes('ordem')) ||
               (targetTokens.includes('law') && targetTokens.includes('order'));

  if (isLO) {
    const targetSub = DERIVATIVES.find((sub) => normTarget.includes(sub));
    if (targetSub) {
      const derivMatches = pool.filter((e) => {
        const hasCore = e.tokens.includes('lei') || e.tokens.includes('law');
        return hasCore && e.pureName.includes(targetSub);
      });
      if (derivMatches.length > 0) return pickBestDubbed(derivMatches);
    } else {
      const classicMatches = pool.filter((e) => {
        const hasCore = (e.tokens.includes('lei') && e.tokens.includes('ordem')) ||
                        (e.tokens.includes('law') && e.tokens.includes('order'));
        const hasNoDerivatives = !DERIVATIVES.some((sub) => e.pureName.includes(sub));
        return hasCore && hasNoDerivatives;
      });
      if (classicMatches.length > 0) return pickBestDubbed(classicMatches);
    }
  }

  // 2. Descarte de sequências (impede que sem numeral caia em Parte II, 2, etc.)
  const targetHasRoman = ROMAN_NUMERALS.some((r) => targetTokens.includes(r));
  const candidatePool = pool.filter((e) => {
    if (!targetHasRoman) {
      const entryHasRoman = ROMAN_NUMERALS.some((r) => e.tokens.includes(r) || e.pureName.includes(`parte-${r}`));
      if (entryHasRoman) return false;
    }
    return true;
  });

  // 3. PRIORIDADE ABSOLUTA: ANO + CASAMENTO DE TOKENS (Resolve Flash 2023, Duna 2021, etc.)
  if (year) {
    const exactTokensAndYear = candidatePool.filter((e) =>
      e.year === String(year) &&
      e.tokens.length === targetTokens.length &&
      targetTokens.every((t) => e.tokens.includes(t))
    );
    if (exactTokensAndYear.length > 0) return pickBestDubbed(exactTokensAndYear);

    // Se tiver os mesmos tokens e o mesmo ano mesmo com títulos bilingues
    const containsTokensAndYear = candidatePool.filter((e) =>
      e.year === String(year) &&
      targetTokens.every((t) => e.tokens.includes(t)) &&
      (e.tokens.length - targetTokens.length <= 2)
    );
    if (containsTokensAndYear.length > 0) return pickBestDubbed(containsTokensAndYear);
  }

  // 4. PALAVRA ÚNICA FLEXÍVEL (Trata "The Flash" -> tokens ["flash"])
  if (targetTokens.length === 1) {
    const singleWord = targetTokens[0];
    const singleMatches = candidatePool.filter((e) => {
      // Bate com tokens exatos: apenas ["flash"]
      if (e.tokens.length === 1 && e.tokens[0] === singleWord) return true;
      // Bate se pureName terminar com a palavra (ex: "the-flash" termina com "flash")
      if (e.pureName === singleWord || e.pureName === `the-${singleWord}` || e.pureName === `o-${singleWord}`) return true;
      if (e.subNames.some((sub) => sub === singleWord || sub === `the-${singleWord}`)) return true;
      return false;
    });

    if (singleMatches.length > 0) {
      if (year) {
        const byYear = singleMatches.filter((e) => e.year === String(year));
        if (byYear.length > 0) return pickBestDubbed(byYear);
      }
      return pickBestDubbed(singleMatches);
    }
  }

  // 5. Comparação por sub-nomes divididos por "/" ou ":"
  const subNameMatches = candidatePool.filter((e) =>
    e.subNames.some((sub) => {
      if (sub === normTarget) return true;
      const strippedSub = sub.replace(/-(a|o|the)-/g, '-').replace(/^(a|o|the)-/, '');
      const strippedTarget = normTarget.replace(/-(a|o|the)-/g, '-').replace(/^(a|o|the)-/, '');
      return strippedSub === strippedTarget;
    })
  );
  if (subNameMatches.length > 0) {
    if (year) {
      const byYear = subNameMatches.filter((e) => e.year === String(year));
      if (byYear.length > 0) return pickBestDubbed(byYear);
    }
    return pickBestDubbed(subNameMatches);
  }

  // 6. Correspondência exata dos tokens
  const exactTokensMatches = candidatePool.filter((e) => {
    for (const sub of e.subNames) {
      const subTokens = getTokens(sub);
      if (subTokens.length === targetTokens.length && targetTokens.every((t) => subTokens.includes(t))) {
        return true;
      }
    }
    if (e.tokens.length === targetTokens.length) {
      return targetTokens.every((t) => e.tokens.includes(t));
    }
    return false;
  });

  if (exactTokensMatches.length > 0) {
    if (year) {
      const byYear = exactTokensMatches.filter((e) => e.year === String(year));
      if (byYear.length > 0) return pickBestDubbed(byYear);
    }
    return pickBestDubbed(exactTokensMatches);
  }

  // 7. Sistema de pontuação geral
  let bestEntry: CatalogEntry | null = null;
  let highestScore = -999;

  for (const entry of candidatePool) {
    const hasAllTarget = targetTokens.every((t) => entry.tokens.includes(t));
    if (!hasAllTarget) continue;

    let score = 50;
    const extraTokensCount = Math.abs(entry.tokens.length - targetTokens.length);
    score -= extraTokensCount * 25;

    if (entry.isDubbed) score += 20;

    if (year && entry.year) {
      if (entry.year === String(year)) {
        score += 60; // Bónus ainda maior se o ano bater
      } else {
        score -= 50; // Penalidade forte para outro ano
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestEntry = entry;
    }
  }

  if (bestEntry && highestScore > 0) {
    return bestEntry.url;
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let title = searchParams.get('title') || '';
  let year = searchParams.get('year') || '';
  const type = searchParams.get('type') || 'movie';
  const id = searchParams.get('id') || '';

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
      if (matchedPt) return NextResponse.redirect(matchedPt);

      // 2. Título original em inglês (via TMDB)
      if (originalTitle && normalizeText(originalTitle) !== normalizeText(title)) {
        const matchedEn = findBestMatch(pool, originalTitle, year);
        if (matchedEn) return NextResponse.redirect(matchedEn);
      }

      // 3. Fallback pela parte principal se houver ":" ou "-"
      if (title.includes(':') || title.includes('-')) {
        const mainPart = title.split(/[:\-]/)[0].trim();
        const matchedMain = findBestMatch(pool, mainPart, year);
        if (matchedMain) return NextResponse.redirect(matchedMain);
      }
    }

    return NextResponse.redirect(BASE_SITE_URL);
  } catch (error) {
    console.error('[resolve-link] Erro:', error);
    return NextResponse.redirect(BASE_SITE_URL);
  }
}