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
  'dublado', 'legendado', 'nacional', 'original', 'completo', 'hd', 'fhd', '4k', '1080p', '720p'
]);

const ROMAN_NUMERALS = ['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', '2', '3', '4', '5'];

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/c\.s\.i\./gi, 'csi') // Uniformiza C.S.I. para csi
    .replace(/\bnova york\b/gi, 'ny') // Uniformiza Nova York para NY
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
  const filesToRead = ['mapafilmes.html', 'mapa.html'];
  const entries: CatalogEntry[] = [];
  const itemRegex = /<span[^>]*>([\s\S]*?)<\/span>\s*-\s*<a\s+href=["']([^"']+)["']/gi;

  for (const fileName of filesToRead) {
    const filePath = path.join(publicDir, fileName);
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

          const yearMatch = rawTitle.match(/\b(19\d\d|20\d\d)\b/) || rawHref.match(/-(19\d\d|20\d\d)-/);
          const foundYear = yearMatch ? yearMatch[1] : undefined;
          const isMovie = fullUrl.includes('_') || fileName === 'mapafilmes.html';

          // Checa se é dublado ou nacional
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
        console.error(`[resolve-link] Erro ao ler ${fileName}:`, err);
      }
    }
  }

  if (entries.length > 0) {
    cachedEntries = entries;
  }

  return entries;
}

async function getOriginalTitleFromTMDB(id: string, type: string): Promise<string | null> {
  if (!id || !TMDB_API_KEY) return null;
  try {
    const endpoint = type === 'tv' ? `tv/${id}` : `movie/${id}`;
    const res = await fetch(`https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&language=en-US`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.original_name || data.original_title || data.name || data.title || null;
  } catch {
    return null;
  }
}

// Filtra para dar prioridade SEMPRE ao dublado
function pickBestDubbed(matches: CatalogEntry[]): string {
  const dubbed = matches.find((e) => e.isDubbed);
  return (dubbed || matches[0]).url;
}

function findBestMatch(pool: CatalogEntry[], targetTitle: string, year?: string): string | null {
  const normTarget = normalizeText(targetTitle);
  const targetTokens = getTokens(targetTitle);

  if (targetTokens.length === 0) return null;

  // 1. DESCARTE DE SEQUÊNCIAS (evita que "O Poderoso Chefão" caia no "Parte II" ou "Parte III")
  const targetHasRoman = ROMAN_NUMERALS.some((r) => targetTokens.includes(r));
  const candidatePool = pool.filter((e) => {
    if (!targetHasRoman) {
      // Se a busca NÃO tem Parte 2/II/III, descarta entradas que tenham
      const entryHasRoman = ROMAN_NUMERALS.some((r) => e.tokens.includes(r) || e.pureName.includes(`parte-${r}`));
      if (entryHasRoman) return false;
    }
    return true;
  });

  // 2. PALAVRA ÚNICA ESTRITA (ex: "Arrow", "Dark", "Lost")
  if (targetTokens.length === 1) {
    const singleWord = targetTokens[0];
    const singleMatches = candidatePool.filter((e) => {
      if (e.pureName === singleWord) return true;
      if (e.subNames.some((sub) => sub === singleWord)) return true;
      if (e.tokens.length === 1 && e.tokens[0] === singleWord) return true;
      return false;
    });

    if (singleMatches.length > 0) {
      if (year) {
        const byYear = singleMatches.filter((e) => e.year === String(year));
        if (byYear.length > 0) return pickBestDubbed(byYear);
      }
      return pickBestDubbed(singleMatches);
    }
    return null;
  }

  // 3. PRIORIDADE MÁXIMA PARA ANO E SUB-NAMES (ex: Vingadores Ultimato 2019 Dublado)
  if (year) {
    const matchesWithYear = candidatePool.filter((e) =>
      e.year === String(year) &&
      (e.subNames.some((sub) => sub === normTarget) ||
       (e.tokens.length === targetTokens.length && targetTokens.every((t) => e.tokens.includes(t))))
    );
    if (matchesWithYear.length > 0) return pickBestDubbed(matchesWithYear);

    // Mesmos tokens e mesmo ano com qualquer resolução
    const tokensWithYear = candidatePool.filter((e) =>
      e.year === String(year) && targetTokens.every((t) => e.tokens.includes(t))
    );
    if (tokensWithYear.length > 0) return pickBestDubbed(tokensWithYear);
  }

  // 4. CASO COMPOSTO / BARRA / DOIS-PONTOS
  const subNameMatches = candidatePool.filter((e) =>
    e.subNames.some((sub) => {
      if (sub === normTarget) return true;
      const strippedSub = sub.replace(/-(a|o|the)-/g, '-').replace(/^(a|o|the)-/, '');
      const strippedTarget = normTarget.replace(/-(a|o|the)-/g, '-').replace(/^(a|o|the)-/, '');
      return strippedSub === strippedTarget;
    })
  );
  if (subNameMatches.length > 0) return pickBestDubbed(subNameMatches);

  // 5. CORRESPONDÊNCIA EXATA DE TOKENS (com prioridade Dublado)
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

  // 6. PONTUAÇÃO GERAL
  let bestEntry: CatalogEntry | null = null;
  let highestScore = -999;

  for (const entry of candidatePool) {
    const hasAllTarget = targetTokens.every((t) => entry.tokens.includes(t));
    if (!hasAllTarget) continue;

    let score = 50;
    const extraTokensCount = Math.abs(entry.tokens.length - targetTokens.length);
    score -= extraTokensCount * 25;

    // Bonificação por dublado
    if (entry.isDubbed) score += 20;

    if (year && entry.year) {
      if (entry.year === String(year)) {
        score += 45;
      } else {
        score -= 40;
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
  const title = searchParams.get('title') || '';
  const year = searchParams.get('year') || '';
  const type = searchParams.get('type') || 'movie';
  const paramSlug = searchParams.get('slug') || '';
  const id = searchParams.get('id') || '';

  if (!title) {
    return NextResponse.redirect(BASE_SITE_URL);
  }

  try {
    const entries = getCatalogEntries();

    if (entries.length > 0) {
      const typeFiltered = entries.filter((e) => (type === 'tv' ? !e.isMovie : e.isMovie));
      const pool = typeFiltered.length > 0 ? typeFiltered : entries;

      // 1. Tenta pelo título enviado em português
      const matchedPt = findBestMatch(pool, title, year);
      if (matchedPt) return NextResponse.redirect(matchedPt);

      // 2. Se falhar, consulta o título original no TMDB (ex: "The Godfather", "CSI: NY")
      if (id) {
        const originalTitle = await getOriginalTitleFromTMDB(id, type);
        if (originalTitle && normalizeText(originalTitle) !== normalizeText(title)) {
          const matchedEn = findBestMatch(pool, originalTitle, year);
          if (matchedEn) return NextResponse.redirect(matchedEn);
        }
      }

      // 3. Se tiver dois-pontos ou hífen, tenta pela parte principal
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