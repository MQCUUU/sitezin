import type { Insight, InsightsPayload } from "./types";

/*
 * Motor de insights — REGRAS determinísticas sobre o payload calculado.
 * Nenhuma frase é inventada: cada regra só dispara com amostra mínima e
 * devolve a evidência numérica. Tom curioso, nunca julgador.
 *   generateSummaryInsights   comparação com o período anterior, filmes × séries
 *   generateActivityInsights  fim de semana × dias úteis (dia, horário e sequência já são fatos na tela)
 *   generateTasteInsights     "mais assisto" × "mais gosto", gêneros nas notas altas, diretores
 *   generateRatingInsights    perfil de notas, você × TMDB
 *   generateSeriesInsights    quase terminando, paradas
 *   generateRewatchInsights   reassistidos e abandonos
 *   generateWatchlistInsights crescimento, tempo para zerar
 *   generateEvolutionInsights mudanças relevantes ano × ano
 *   generateAiInsights        recomendações e origem da descoberta
 */

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const SOURCE_LABEL: Record<string, string> = {
  assistant: "MyCatalog AI",
  pick: "Escolha pra mim",
  smart_queue: "Sugerir agora",
  for_you: "Para você",
  home: "Início",
  discover: "Descobrir",
  search: "Busca",
  title: "Página do título",
  collection: "Coleções",
  person: "Página de pessoa",
  lists: "Listas",
  profile: "Perfis de outras pessoas",
  library: "Biblioteca",
  calendar: "Calendário",
  other: "Outros",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const num = (v: number) => v.toFixed(1).replace(".", ",");

export function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);

  return `${MONTHS[m - 1]} de ${y}`;
}

export function hourLabel(h: number) {
  return `${h}h`;
}

type Out = Insight[];

function generateSummaryInsights(p: InsightsPayload, out: Out) {
  const { cur, prev } = p.summary;

  if (prev) {
    const now = cur.movies + cur.series;
    const before = prev.movies + prev.series;

    if (before >= 5 && now >= 3) {
      const change = (now - before) / before;
      const ratingMove = cur.avgRating !== null && prev.avgRating !== null && prev.rated >= 5 && cur.rated >= 3 ? cur.avgRating - prev.avgRating : null;

      if (change <= -0.1 && ratingMove !== null && ratingMove >= 0.3) {
        out.push({
          id: "selective",
          section: "summary",
          priority: 1,
          message: `Seu gosto está mais seletivo: você assistiu ${pct(-change)} menos títulos, mas sua nota média subiu de ${num(prev.avgRating as number)} para ${num(cur.avgRating as number)}.`,
          evidence: `${now} títulos agora × ${before} no período anterior`,
          sample: now + before,
        });
      } else if (Math.abs(change) >= 0.15) {
        out.push({
          id: "volume",
          section: "summary",
          priority: 2,
          message: `Você assistiu ${pct(Math.abs(change))} ${change > 0 ? "mais" : "menos"} títulos que no período anterior.`,
          evidence: `${now} agora × ${before} antes`,
          sample: now + before,
        });
      }

      if (ratingMove !== null && Math.abs(ratingMove) >= 0.4 && !(change <= -0.1 && ratingMove >= 0.3)) {
        out.push({
          id: "rating-move",
          section: "summary",
          priority: 2,
          message: `Sua nota média ${ratingMove > 0 ? "subiu" : "caiu"} de ${num(prev.avgRating as number)} para ${num(cur.avgRating as number)}.`,
          evidence: `${cur.rated} avaliados agora × ${prev.rated} antes`,
          sample: cur.rated + prev.rated,
        });
      }
    }

    if (prev.minutes >= 300 && cur.minutes > 0) {
      const change = (cur.minutes - prev.minutes) / prev.minutes;

      if (Math.abs(change) >= 0.15) {
        out.push({
          id: "time",
          section: "summary",
          priority: 3,
          message: `${change > 0 ? "+" : "−"}${pct(Math.abs(change))} de tempo assistido em relação ao período anterior.`,
          evidence: `${Math.round(cur.minutes / 60)} h × ${Math.round(prev.minutes / 60)} h`,
          sample: cur.movies + cur.episodes,
        });
      }
    }
  }

  if (p.meta.type === "all" && cur.minutes >= 600) {
    const seriesShare = cur.seriesMinutes / cur.minutes;

    if (seriesShare >= 0.65 || seriesShare <= 0.35) {
      out.push({
        id: "split",
        section: "summary",
        priority: 4,
        message:
          seriesShare >= 0.65
            ? `Séries ocupam ${pct(seriesShare)} do seu tempo — você é mais de maratonar do que de sessão de cinema.`
            : `Filmes ocupam ${pct(1 - seriesShare)} do seu tempo — você é mais de sessão de cinema.`,
        evidence: `${Math.round(cur.movieMinutes / 60)} h em filmes · ${Math.round(cur.seriesMinutes / 60)} h em séries`,
        sample: cur.movies + cur.episodes,
      });
    }
  }
}

function generateActivityInsights(p: InsightsPayload, out: Out) {
  const a = p.activity;

  if (!a) return;

  if (a.weekendShare !== null && (a.weekendShare >= 0.5 || a.weekendShare <= 0.15)) {
    out.push({
      id: "weekend",
      section: "activity",
      priority: 4,
      message:
        a.weekendShare >= 0.5
          ? `${pct(a.weekendShare)} do seu tempo assistindo cai no fim de semana.`
          : `Só ${pct(a.weekendShare)} do seu tempo assistindo cai no fim de semana — você assiste mais durante a semana.`,
      evidence: "Sábado + domingo sobre o total",
      sample: 0,
    });
  }

}

function generateTasteInsights(p: InsightsPayload, out: Out) {
  const t = p.taste;

  if (!t || t.consumed < 15) return;

  const byCount = t.genres.filter((g) => g.count >= 5);
  const byAvg = t.genres.filter((g) => g.avg !== null).sort((a, b) => (b.avg as number) - (a.avg as number));
  const most = byCount[0];
  const loved = byAvg[0];

  if (most && loved && most.name !== loved.name && (most.avg === null || (loved.avg as number) - most.avg >= 0.3)) {
    out.push({
      id: "watch-vs-love",
      section: "taste",
      priority: 1,
      message: `${most.name} é o gênero que você mais assiste, mas ${loved.name} é onde suas notas realmente sobem.`,
      evidence: `${most.name}: ${most.count} títulos${most.avg !== null ? `, média ${num(most.avg)}` : ""} · ${loved.name}: média ${num(loved.avg as number)} em ${loved.rated} avaliados`,
      sample: most.count + loved.rated,
    });
  }

  const totalHigh = t.genres.reduce((max, g) => Math.max(max, g.high), 0);
  const highCount = p.ratings ? p.ratings.histogram[8] + p.ratings.histogram[9] : 0;

  if (highCount >= 5 && totalHigh >= 3) {
    const candidate = t.genres
      .filter((g) => g.high >= 3)
      .map((g) => ({ g, highShare: g.high / highCount }))
      .filter((x) => x.highShare - x.g.share >= 0.15)
      .sort((a, b) => b.highShare - b.g.share - (a.highShare - a.g.share))[0];

    if (candidate) {
      out.push({
        id: "high-share",
        section: "taste",
        priority: 2,
        message: `${candidate.g.name} é ${pct(candidate.g.share)} do que você assiste, mas ${pct(candidate.highShare)} dos seus títulos nota 9 ou mais.`,
        evidence: `${candidate.g.high} de ${highCount} títulos com nota 9+`,
        sample: highCount,
      });
    }
  }

  const overall = p.ratings?.mean;
  const director = t.directors.find((d) => d.avg !== null && d.count >= 3 && overall !== null && overall !== undefined && (d.avg as number) - overall >= 1);

  if (director && overall !== null && overall !== undefined) {
    out.push({
      id: "director",
      section: "taste",
      priority: 3,
      message: `Você avalia os filmes de ${director.name} ${num((director.avg as number) - overall)} ponto acima da sua média.`,
      evidence: `${director.count} filmes, média ${num(director.avg as number)} × sua média ${num(overall)}`,
      sample: director.count,
    });
  }
}

function generateRatingInsights(p: InsightsPayload, out: Out) {
  const r = p.ratings;

  if (!r || r.n < 15) return;

  if (r.band79 !== null && r.band79 >= 0.6) {
    out.push({
      id: "band",
      section: "ratings",
      priority: 2,
      message: `Você concentra ${pct(r.band79)} das suas notas entre 7 e 9.`,
      evidence: `${r.n} títulos avaliados`,
      sample: r.n,
    });
  }

  if (r.below6 !== null && r.below6 <= 0.08) {
    out.push({
      id: "below6",
      section: "ratings",
      priority: 3,
      message: `Você raramente dá notas abaixo de 6 — só ${pct(r.below6)} das vezes.`,
      evidence: `${r.n} títulos avaliados`,
      sample: r.n,
    });
  }

  if (r.community && Math.abs(r.community.bias) >= 0.3) {
    out.push({
      id: "bias",
      section: "ratings",
      priority: 2,
      message: `Você tende a avaliar ${num(Math.abs(r.community.bias))} ponto ${r.community.bias < 0 ? "abaixo" : "acima"} da média do TMDB.`,
      evidence: `${r.community.n} títulos: sua média ${num(r.community.mine)} × TMDB ${num(r.community.tmdb)}`,
      sample: r.community.n,
    });
  }
}

function generateSeriesInsights(p: InsightsPayload, out: Out) {
  const s = p.titles?.series;

  if (!s) return;

  if (s.nearlyDone.length >= 2) {
    out.push({
      id: "nearly",
      section: "titles",
      priority: 1,
      message: `Você está a até 3 episódios de terminar ${s.nearlyDone.length} séries.`,
      evidence: s.nearlyDone.map((x) => `${x.title} (${x.remaining})`).join(", "),
      sample: s.nearlyDone.length,
    });
  }

  const stale = s.inProgress.filter((x) => x.staleDays !== null && x.staleDays >= 60);

  if (stale.length >= 2) {
    out.push({
      id: "stale",
      section: "titles",
      priority: 4,
      message: `${stale.length} séries em andamento não recebem um episódio há mais de 2 meses.`,
      evidence: stale.slice(0, 3).map((x) => `${x.title} (${x.staleDays} dias)`).join(", "),
      sample: stale.length,
    });
  }
}

function generateRewatchInsights(p: InsightsPayload, out: Out) {
  if (p.rewatch?.topGenre && p.rewatch.top.length >= 4) {
    out.push({
      id: "rewatch-genre",
      section: "rewatch",
      priority: 3,
      message: `${p.rewatch.topGenre} é o gênero que você mais reassiste.`,
      evidence: `Entre ${p.rewatch.top.length}+ títulos reassistidos`,
      sample: p.rewatch.top.length,
    });
  }

  if (p.dropped?.medianEpisode !== null && p.dropped?.medianEpisode !== undefined && p.dropped.medianEpisode <= 3) {
    out.push({
      id: "drop-early",
      section: "rewatch",
      priority: 3,
      message: `Você costuma decidir cedo quando uma série não funciona: as que você deixa de lado param, em média, no episódio ${p.dropped.medianEpisode}.`,
      evidence: "Mediana dos episódios assistidos em séries abandonadas",
      sample: 3,
    });
  }

  const g = p.dropped?.genres[0];

  if (g && g.rate >= 0.3) {
    out.push({
      id: "drop-genre",
      section: "rewatch",
      priority: 4,
      message: `${g.name} é o gênero que mais fica pelo caminho: ${pct(g.rate)} dos que você começa.`,
      evidence: `${g.dropped} de ${g.tracked} títulos`,
      sample: g.tracked,
    });
  }
}

function generateWatchlistInsights(p: InsightsPayload, out: Out) {
  const w = p.watchlist;

  if (!w) return;

  if (w.growing && w.growing.added90 > w.growing.watched90 * 1.3) {
    out.push({
      id: "growing",
      section: "watchlist",
      priority: 2,
      message: "Sua watchlist está crescendo mais rápido do que você assiste.",
      evidence: `Últimos 90 dias: ${w.growing.added90} adicionados × ${w.growing.watched90} assistidos`,
      sample: w.growing.added90,
    });
  }

  if (w.clearMonths !== null) {
    out.push({
      id: "clear",
      section: "watchlist",
      priority: 3,
      message:
        w.clearMonths >= 24
          ? `No seu ritmo atual, levaria aproximadamente ${Math.round(w.clearMonths / 12)} anos para assistir toda a sua watchlist.`
          : `No seu ritmo atual, levaria aproximadamente ${w.clearMonths} ${w.clearMonths === 1 ? "mês" : "meses"} para assistir toda a sua watchlist.`,
      evidence: "Duração estimada da watchlist ÷ seu tempo médio assistido por dia nos últimos 90 dias",
      sample: w.size,
    });
  }
}

function generateEvolutionInsights(p: InsightsPayload, out: Out) {
  for (const change of p.evolution?.changes.slice(0, 2) ?? []) {
    const message =
      change.unit === "rating"
        ? `Sua nota média foi de ${num(change.from)} em ${p.evolution!.fromYear} para ${num(change.to)} em ${p.evolution!.toYear}.`
        : change.id === "series-share"
          ? `Séries foram de ${pct(change.from)} para ${pct(change.to)} do seu tempo assistindo (${p.evolution!.fromYear} → ${p.evolution!.toYear}).`
          : `${change.label} ${change.to > change.from ? "ganhou espaço" : "perdeu espaço"}: ${pct(change.from)} → ${pct(change.to)} dos títulos que você assiste.`;

    out.push({
      id: `evo-${change.id}`,
      section: "evolution",
      priority: 2,
      message,
      evidence: `${p.evolution!.fromYear} × ${p.evolution!.toYear}`,
      sample: 10,
    });
  }
}

function generateAiInsights(p: InsightsPayload, out: Out) {
  const ai = p.ai;

  if (!ai?.tracking) return;

  const watched = ai.tools.reduce((s, t) => s + t.watched, 0);
  const liked = ai.tools.reduce((s, t) => s + t.liked, 0);

  if (watched >= 5) {
    out.push({
      id: "ai-liked",
      section: "ai",
      priority: 2,
      message: `Das ${watched} recomendações que você assistiu, você gostou de ${liked}.`,
      evidence: "“Gostou” = assistiu e deu nota 7,5+ ou curtiu",
      sample: watched,
    });
  }

  const best = ai.sources
    .filter((s) => s.added >= 5 && s.watched >= 3)
    .sort((a, b) => b.liked / b.watched - a.liked / a.watched)[0];

  if (best && best.liked > 0) {
    out.push({
      id: "best-source",
      section: "ai",
      priority: 3,
      message: `Os títulos que você encontra em ${SOURCE_LABEL[best.source] ?? best.source} são os que você mais gosta.`,
      evidence: `${best.liked} de ${best.watched} assistidos você gostou`,
      sample: best.watched,
    });
  }
}

export function generateInsights(p: InsightsPayload): Insight[] {
  const out: Out = [];

  generateSummaryInsights(p, out);
  generateActivityInsights(p, out);
  generateTasteInsights(p, out);
  generateRatingInsights(p, out);
  generateSeriesInsights(p, out);
  generateRewatchInsights(p, out);
  generateWatchlistInsights(p, out);
  generateEvolutionInsights(p, out);
  generateAiInsights(p, out);

  return out.sort((a, b) => a.priority - b.priority);
}
