import fs from 'fs';
import path from 'path';

export const BASE_SITE_URL = 'https://redecanais.by';

export interface CatalogEntry {
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

export const STOP_WORDS = new Set([
  'e', 'and', 'the', 'o', 'a', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'of', 'in',
  'dublado', 'legendado', 'nacional', 'original', 'completo', 'hd', 'fhd', '4k', '1080p', '720p', 'filme'
]);

export const ROMAN_NUMERALS = ['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', '2', '3', '4', '5'];

export const DERIVATIVES = [
  'toronto', 'intencao-criminal', 'criminal-intent',
  'crimes-premeditados', 'organized-crime', 'crime-organizado',
  'true-crime', 'uk', 'vitimas-especiais', 'unidade-de-vitimas-especiais', 'svu',
  'trial-by-jury', 'los-angeles'
];

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bparte\s+(?:dois|ii)\b/gi, 'parte 2')
    .replace(/\bparte\s+(?:tres|iii)\b/gi, 'parte 3')
    .replace(/\bparte\s+(?:quatro|iv)\b/gi, 'parte 4')
    .replace(/\bpart\s+(?:two|ii)\b/gi, 'part 2')
    .replace(/\bpart\s+(?:three|iii)\b/gi, 'part 3')
    .replace(/c\.s\.i\./gi, 'csi')
    .replace(/\bnova york\b/gi, 'ny')
    .replace(/&amp;?/gi, ' ')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getTokens(text: string): string[] {
  const clean = text
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*-\s*\d{4}.*$/, '');
  return normalizeText(clean)
    .split('-')
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

export function extractPureName(rawTitle: string): string {
  const withoutParentheses = rawTitle.replace(/\s*\([^)]*\)/g, '');
  const withoutYear = withoutParentheses.replace(/\s*-\s*\d{4}.*$/, '');
  return normalizeText(withoutYear);
}

export function getCatalogEntries(): CatalogEntry[] {
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

          const isMovie = cfg.isMovieFile;
          const lowerCheck = (rawTitle + ' ' + fullUrl).toLowerCase();
          const isDubbed = lowerCheck.includes('dublado') || lowerCheck.includes('nacional');

          const cleanTitle = rawTitle
            .replace(/\s*\([^)]*\)/g, '')
            .replace(/\s*-\s*\d{4}.*$/, '');
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

export function pickBestDubbed(matches: CatalogEntry[]): string {
  const dubbed = matches.find((e) => e.isDubbed);
  return (dubbed || matches[0]).url;
}

export function findBestMatch(pool: CatalogEntry[], targetTitle: string, year?: string): string | null {
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

  const targetYearNum = year ? Number(year) : NaN;

  // 3. CORRESPONDÊNCIA EXATA DE TÍTULO / PURENAME (com tolerância de ±1 ano para lançamentos internacionais/BR)
  const exactNameMatches = candidatePool.filter((e) =>
    e.pureName === normTarget || e.subNames.some((sub) => sub === normTarget)
  );
  if (exactNameMatches.length > 0) {
    if (year) {
      // Prioridade 1: ano exato
      const byExactYear = exactNameMatches.filter((e) => e.year === String(year));
      if (byExactYear.length > 0) return pickBestDubbed(byExactYear);

      // Prioridade 2: tolerância de ±1 ano (lançamento regional / internacional BR vs EUA)
      if (!isNaN(targetYearNum)) {
        const byCloseYear = exactNameMatches.filter((e) => {
          if (!e.year) return false;
          const entryYearNum = Number(e.year);
          return !isNaN(entryYearNum) && Math.abs(entryYearNum - targetYearNum) <= 1;
        });
        if (byCloseYear.length > 0) return pickBestDubbed(byCloseYear);
      }
    }
    return pickBestDubbed(exactNameMatches);
  }

  // 4. PRIORIDADE POR ANO + CASAMENTO DE TOKENS (com tolerância de ±1 ano)
  if (year) {
    // Ano exato
    const exactTokensAndYear = candidatePool.filter((e) =>
      e.year === String(year) &&
      e.tokens.length === targetTokens.length &&
      targetTokens.every((t) => e.tokens.includes(t))
    );
    if (exactTokensAndYear.length > 0) return pickBestDubbed(exactTokensAndYear);

    // Ano ±1
    if (!isNaN(targetYearNum)) {
      const exactTokensCloseYear = candidatePool.filter((e) => {
        if (!e.year) return false;
        const entryYearNum = Number(e.year);
        return !isNaN(entryYearNum) &&
          Math.abs(entryYearNum - targetYearNum) <= 1 &&
          e.tokens.length === targetTokens.length &&
          targetTokens.every((t) => e.tokens.includes(t));
      });
      if (exactTokensCloseYear.length > 0) return pickBestDubbed(exactTokensCloseYear);
    }

    // Contém tokens e mesmo ano
    const containsTokensAndYear = candidatePool.filter((e) =>
      e.year === String(year) &&
      targetTokens.every((t) => e.tokens.includes(t)) &&
      (e.tokens.length - targetTokens.length <= 2)
    );
    if (containsTokensAndYear.length > 0) return pickBestDubbed(containsTokensAndYear);

    // Contém tokens e ano ±1
    if (!isNaN(targetYearNum)) {
      const containsTokensCloseYear = candidatePool.filter((e) => {
        if (!e.year) return false;
        const entryYearNum = Number(e.year);
        return !isNaN(entryYearNum) &&
          Math.abs(entryYearNum - targetYearNum) <= 1 &&
          targetTokens.every((t) => e.tokens.includes(t)) &&
          (e.tokens.length - targetTokens.length <= 2);
      });
      if (containsTokensCloseYear.length > 0) return pickBestDubbed(containsTokensCloseYear);
    }
  }

  // 5. PALAVRA ÚNICA FLEXÍVEL (Trata "The Flash" -> tokens ["flash"])
  if (targetTokens.length === 1) {
    const singleWord = targetTokens[0];
    const singleMatches = candidatePool.filter((e) => {
      if (e.tokens.length === 1 && e.tokens[0] === singleWord) return true;
      if (e.pureName === singleWord || e.pureName === `the-${singleWord}` || e.pureName === `o-${singleWord}`) return true;
      if (e.subNames.some((sub) => sub === singleWord || sub === `the-${singleWord}`)) return true;
      return false;
    });

    if (singleMatches.length > 0) {
      if (year) {
        const byYear = singleMatches.filter((e) => e.year === String(year));
        if (byYear.length > 0) return pickBestDubbed(byYear);
        if (!isNaN(targetYearNum)) {
          const byCloseYear = singleMatches.filter((e) => {
            if (!e.year) return false;
            const entryYearNum = Number(e.year);
            return !isNaN(entryYearNum) && Math.abs(entryYearNum - targetYearNum) <= 1;
          });
          if (byCloseYear.length > 0) return pickBestDubbed(byCloseYear);
        }
      }
      return pickBestDubbed(singleMatches);
    }
  }

  // 6. Comparação por sub-nomes divididos por "/" ou ":"
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
      if (!isNaN(targetYearNum)) {
        const byCloseYear = subNameMatches.filter((e) => {
          if (!e.year) return false;
          const entryYearNum = Number(e.year);
          return !isNaN(entryYearNum) && Math.abs(entryYearNum - targetYearNum) <= 1;
        });
        if (byCloseYear.length > 0) return pickBestDubbed(byCloseYear);
      }
    }
    return pickBestDubbed(subNameMatches);
  }

  // 7. Correspondência exata dos tokens
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
      if (byYear.length > 0) return pickBestDubbed(exactTokensMatches);
      if (!isNaN(targetYearNum)) {
        const byCloseYear = exactTokensMatches.filter((e) => {
          if (!e.year) return false;
          const entryYearNum = Number(e.year);
          return !isNaN(entryYearNum) && Math.abs(entryYearNum - targetYearNum) <= 1;
        });
        if (byCloseYear.length > 0) return pickBestDubbed(byCloseYear);
      }
    }
    return pickBestDubbed(exactTokensMatches);
  }

  // 8. Sistema de pontuação geral
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
      const entryYearNum = Number(entry.year);
      if (entry.year === String(year)) {
        score += 60; // Bônus exato
      } else if (!isNaN(entryYearNum) && !isNaN(targetYearNum) && Math.abs(entryYearNum - targetYearNum) <= 1) {
        score += 45; // Bônus por proximidade regional (ex: 1994 EUA vs 1995 Brasil)
      } else {
        score -= 50; // Penalidade apenas para diferença > 1 ano
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

