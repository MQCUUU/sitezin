/*
 * V2.1-E — card compartilhável da Retrospectiva (1080 × 1350), gerado
 * 100% no navegador com Canvas 2D nativo: nenhuma dependência nova, nenhum
 * upload, nenhuma URL pública. Só métricas REAIS que a própria página da
 * Retrospectiva já exibe; o que não existe não aparece. Sem nome, e-mail
 * ou @ do usuário. Sem posters externos (evita CORS/canvas "tainted").
 */

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export type RetrospectiveCardData = {
  year: number;
  watchLogged: number;
  markedWatched: number;
  seriesCompleted: number;
  seasonsCompleted: number;
  rewatches: number;
  topGenre: string | null;
  topMonth: string | null;
  highlightTitle: string | null;
};

const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

export function retrospectiveFileName(year: number): string {
  return `mycatalog-retrospectiva-${year}.png`;
}

/** Texto alternativo com os mesmos dados do card (canvas não substitui a página). */
export function retrospectiveCardAlt(data: RetrospectiveCardData): string {
  const parts = [
    `Retrospectiva ${data.year} no MyCatalog`,
    `${data.watchLogged} visualizações registradas`,
    `${data.markedWatched} marcados como assistidos`,
    `${data.seriesCompleted} séries concluídas`,
    `${data.seasonsCompleted} temporadas concluídas`,
    `${data.rewatches} reassistidas`,
  ];

  if (data.topGenre) parts.push(`gênero principal: ${data.topGenre}`);
  if (data.topMonth) parts.push(`mês mais ativo: ${data.topMonth}`);
  if (data.highlightTitle) parts.push(`título marcante: ${data.highlightTitle}`);

  return parts.join("; ");
}

function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;

    if (context.measureText(test).width <= maxWidth || !current) {
      current = test;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:]+$/, "")}…`;
    return kept;
  }

  return lines;
}

export function drawRetrospectiveCard(
  canvas: HTMLCanvasElement,
  data: RetrospectiveCardData,
  accent = "#8b5cf6"
): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) throw new Error("Canvas 2D indisponível neste navegador.");

  // Fundo: mesmo grafite da marca + brilho do acento.
  context.fillStyle = "#090b10";
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glow = context.createRadialGradient(880, 160, 40, 880, 160, 760);
  glow.addColorStop(0, `${accent}66`);
  glow.addColorStop(1, `${accent}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Marca: quadrado arredondado + triângulo (mesmo símbolo do ícone do app).
  context.fillStyle = "#12151d";
  context.beginPath();
  context.roundRect(72, 72, 88, 88, 22);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.moveTo(72 + 33, 72 + 25);
  context.lineTo(72 + 63, 72 + 44);
  context.lineTo(72 + 33, 72 + 63);
  context.closePath();
  context.fill();

  context.fillStyle = "#f4f5f8";
  context.font = `700 38px ${FONT}`;
  context.textBaseline = "middle";
  context.fillText("MyCatalog", 184, 116);

  // Ano.
  context.textBaseline = "alphabetic";
  context.fillStyle = "rgba(244,245,248,.62)";
  context.font = `600 34px ${FONT}`;
  context.fillText("SEU ANO EM FILMES E SÉRIES", 72, 300);

  context.fillStyle = accent;
  context.font = `800 250px ${FONT}`;
  context.fillText(String(data.year), 60, 520);

  // Métricas (2 colunas × 3 linhas, só as reais da página).
  const stats: [string, number][] = [
    ["Visualizações registradas", data.watchLogged],
    ["Marcados como assistidos", data.markedWatched],
    ["Séries concluídas", data.seriesCompleted],
    ["Temporadas concluídas", data.seasonsCompleted],
    ["Reassistidas", data.rewatches],
  ];

  const startY = 610;
  const columnX = [72, 560];

  stats.forEach(([label, value], index) => {
    const x = columnX[index % 2];
    const y = startY + Math.floor(index / 2) * 170;

    context.fillStyle = "#f4f5f8";
    context.font = `800 84px ${FONT}`;
    context.fillText(String(value), x, y + 70);

    context.fillStyle = "rgba(244,245,248,.66)";
    context.font = `500 28px ${FONT}`;
    context.fillText(label, x, y + 112);
  });

  // Destaques (só os que existem).
  const highlights: [string, string][] = [];

  if (data.highlightTitle) highlights.push(["TÍTULO MARCANTE", data.highlightTitle]);
  if (data.topGenre) highlights.push(["GÊNERO PRINCIPAL", data.topGenre]);
  if (data.topMonth) highlights.push(["MÊS MAIS ATIVO", data.topMonth]);

  let y = 1000;

  for (const [label, value] of highlights) {
    context.fillStyle = "rgba(244,245,248,.5)";
    context.font = `600 24px ${FONT}`;
    context.fillText(label, 72, y);

    context.fillStyle = "#f4f5f8";
    context.font = `700 40px ${FONT}`;
    const lines = wrapLines(context, value, CARD_WIDTH - 144, 1);
    context.fillText(lines[0] ?? "", 72, y + 48);

    y += 108;
  }

  // Rodapé.
  context.fillStyle = "rgba(244,245,248,.45)";
  context.font = `500 26px ${FONT}`;
  context.fillText("Gerado no MyCatalog", 72, CARD_HEIGHT - 64);
}
