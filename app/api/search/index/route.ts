import { NextRequest, NextResponse } from "next/server";

import {
  buscarPorPersonagem,
  buscarPorPessoa,
} from "@/lib/search-index";
import { respostaDeErro, entradaInvalida } from "@/lib/api-error";

/*
 * ============================================================
 * ARQUIVO NOVO — app/api/search/index/route.ts
 *
 * Rota independente, de propósito. Não toquei em
 * /api/search/advanced (2.888 linhas) até você confirmar que
 * esta funciona.
 *
 * COMO TESTAR NO NAVEGADOR
 *   /api/search/index?q=clark kent
 *   /api/search/index?q=seth cohen
 *   /api/search/index?q=walter white
 *   /api/search/index?q=christopher nolan&tipo=pessoa
 *
 * PARÂMETROS
 *   q     — o que buscar (mínimo 3 letras)
 *   tipo  — "personagem" (padrão), "pessoa" ou "ambos"
 *   limit — quantos títulos devolver (padrão 40, teto 60)
 *
 * SEM AUTENTICAÇÃO
 *   Igual às outras rotas de busca do projeto. São dados
 *   públicos do TMDB e a página /search não exige login.
 *
 *   O que NÃO é público é o índice em si: as tabelas search_*
 *   continuam fechadas por RLS. Só esta rota lê, pelo servidor,
 *   e devolve no máximo 60 linhas por consulta.
 * ============================================================
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const consulta = (url.searchParams.get("q") || "").trim();

  if (consulta.length < 3) {
    return entradaInvalida(
      "Digite pelo menos 3 letras para buscar."
    );
  }

  const tipo = url.searchParams.get("tipo") || "personagem";

  const limite = Math.min(
    60,
    Math.max(1, Number(url.searchParams.get("limit")) || 40)
  );

  try {
    if (tipo === "pessoa") {
      const { pessoa, resultados } = await buscarPorPessoa(
        consulta,
        limite
      );

      return NextResponse.json(
        { tipo: "pessoa", encontrado: pessoa, resultados },
        { headers: cabecalhosDeCache() }
      );
    }

    if (tipo === "ambos") {
      const [porPersonagem, porPessoa] = await Promise.all([
        buscarPorPersonagem(consulta, limite),
        buscarPorPessoa(consulta, limite),
      ]);

      /*
       * Personagem vem primeiro: quem digita "Clark Kent" quer
       * o Superman, não o ator. Duplicatas são removidas
       * mantendo a primeira ocorrência.
       */
      const vistos = new Set<string>();

      const resultados = [
        ...porPersonagem.resultados,
        ...porPessoa.resultados,
      ].filter((r) => {
        const chave = `${r.media_type}-${r.tmdb_id}`;

        if (vistos.has(chave)) return false;

        vistos.add(chave);

        return true;
      });

      return NextResponse.json(
        {
          tipo: "ambos",
          personagem: porPersonagem.personagem,
          pessoa: porPessoa.pessoa,
          resultados: resultados.slice(0, limite),
        },
        { headers: cabecalhosDeCache() }
      );
    }

    const { personagem, resultados } = await buscarPorPersonagem(
      consulta,
      limite
    );

    return NextResponse.json(
      { tipo: "personagem", encontrado: personagem, resultados },
      { headers: cabecalhosDeCache() }
    );
  } catch (erro) {
    return respostaDeErro(erro, "GET /api/search/index");
  }
}

/*
 * O índice só muda quando o script de indexação roda. Uma hora
 * de cache na borda é conservador e já evita repetir a mesma
 * consulta a cada tecla digitada.
 */
function cabecalhosDeCache() {
  return {
    "Cache-Control":
      "public, s-maxage=3600, stale-while-revalidate=86400",
  };
}
