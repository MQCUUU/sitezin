/*
 * ============================================================
 * Codemod: loading="lazy" + decoding="async" nas <img>
 *
 * COMO RODAR (da raiz do projeto):
 *   node scripts/lazy-imagens.mjs --dry     <- simula
 *   node scripts/lazy-imagens.mjs           <- aplica
 *
 * O PROBLEMA
 *   34 das 47 tags <img> não têm atributo `loading`. O
 *   navegador baixa todas de uma vez, inclusive as que estão
 *   muito abaixo da dobra. Numa grade com 60 pôsteres são 60
 *   requisições disputando banda com o conteúdo visível — perda
 *   direta de LCP.
 *
 * O QUE ELE FAZ
 *   Insere `loading="lazy" decoding="async"` em toda <img> que
 *   ainda não tenha `loading`.
 *
 * O QUE ELE **NÃO** FAZ
 *   - Não mexe em <img> que já tem `loading` (inclusive
 *     loading="eager", que é escolha deliberada).
 *   - Não mexe em <Image> nem <Poster> — esses já resolvem
 *     lazy loading sozinhos.
 *   - Não adiciona width/height. Isso exige saber o tamanho de
 *     exibição de cada imagem, e chutar errado causa distorção.
 *     Ver a lista no fim da execução.
 * ============================================================
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const SIMULACAO = process.argv.includes("--dry");
const PASTAS = ["app", "components", "hooks"];
const IGNORAR = new Set(["node_modules", ".next", ".git"]);

function listarTsx(dir) {
  const achados = [];
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...listarTsx(caminho));
    else if (nome.endsWith(".tsx")) achados.push(caminho);
  }
  return achados;
}

let totalArquivos = 0;
let totalTrocas = 0;
const semDimensao = [];

for (const pasta of PASTAS) {
  let arquivos = [];
  try {
    arquivos = listarTsx(join(RAIZ, pasta));
  } catch {
    continue;
  }

  for (const caminho of arquivos) {
    const original = readFileSync(caminho, "utf8");
    let trocas = 0;

    /*
     * Captura <img ...> inteira, mesmo quebrada em várias
     * linhas. O `[^>]*` não atravessa o fechamento da tag, o
     * que mantém a substituição contida.
     */
    /*
     * Mapeia os trechos que são comentário, para não editar
     * <img> que aparece só em documentação (aconteceu no teste:
     * o script alterou o comentário do components/Poster.tsx).
     */
    const comentarios = [];
    for (const m of original.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)) {
      comentarios.push([m.index, m.index + m[0].length]);
    }
    const dentroDeComentario = (i) =>
      comentarios.some(([a, b]) => i >= a && i < b);

    const texto = original.replace(/<img\b([^>]*?)(\/?)>/g, (todo, attrs, fecha, indice) => {
      if (dentroDeComentario(indice)) return todo;
      if (/\bloading\s*=/.test(attrs)) return todo;

      trocas++;

      if (!/\bwidth\s*=/.test(attrs) || !/\bheight\s*=/.test(attrs)) {
        semDimensao.push(relative(RAIZ, caminho));
      }

      /* Respeita a indentação: insere logo após `<img`. */
      return `<img loading="lazy" decoding="async"${attrs}${fecha}>`;
    });

    if (trocas === 0) continue;

    totalArquivos++;
    totalTrocas += trocas;

    console.log(
      `${SIMULACAO ? "[simulacao]" : "[aplicado] "} ${String(trocas).padStart(2)} img  ${relative(RAIZ, caminho)}`
    );

    if (!SIMULACAO) writeFileSync(caminho, texto, "utf8");
  }
}

console.log(`\n${totalTrocas} imagem(ns) em ${totalArquivos} arquivo(s).`);

if (semDimensao.length) {
  const unicos = [...new Set(semDimensao)];
  console.log(
    `\nATENCAO: ${semDimensao.length} dessas nao tem width/height.\n` +
      `Sem isso o navegador nao reserva espaco e o layout salta\n` +
      `quando a imagem chega (isso conta como CLS no Core Web Vitals).\n` +
      `Adicione a mao nestes arquivos:\n` +
      unicos.map((a) => `  ${a}`).join("\n")
  );
}

console.log(
  SIMULACAO
    ? "\nNada foi gravado. Rode sem --dry para aplicar."
    : "\nRode: npm run build"
);
