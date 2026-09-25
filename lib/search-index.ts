import { getDb } from "@/lib/db/neon";

/*
 * ============================================================
 * ARQUIVO NOVO — lib/search-index.ts
 *
 * O QUE RESOLVE
 *   Buscar "Clark Kent" e receber os filmes e séries do
 *   Superman. Buscar "Seth Cohen" e receber The O.C.
 *
 *   A busca atual não faz isso: ela chama /search/person no
 *   TMDB e depois pega os créditos. Isso encontra ATORES, não
 *   PERSONAGENS. "Clark Kent" não é uma pessoa no TMDB, então
 *   a busca volta vazia.
 *
 *   Suas tabelas search_* têm o mapa que falta:
 *     search_characters      -> 166 mil nomes de personagem
 *     search_character_media -> 269 mil ligações personagem→título
 *     search_media           -> 10 mil títulos com popularidade
 *
 * POR QUE A CHAVE DE SERVIÇO
 *   As tabelas search_* estão com RLS ligado e nenhuma policy.
 *   Isso bloqueia todo mundo, inclusive o servidor usando a
 *   chave comum.
 *
 *   Poderia criar uma policy de leitura, mas aí qualquer pessoa
 *   logada baixaria as 900 mil linhas direto do navegador. A
 *   chave de serviço roda só no servidor e nunca chega ao
 *   cliente — a API continua servindo consultas controladas, e
 *   o índice segue fechado.
 *
 *   Este arquivo só pode ser importado por rotas de API ou
 *   Server Components. NUNCA por um componente com "use client".
 * ============================================================
 */

/** Códigos de função, iguais aos do build-universal-index-v4.mjs. */
export const FUNCOES: Record<number, string> = {
  1: "Ator",
  2: "Direção",
  3: "Roteiro",
  4: "Criação",
  5: "Trilha sonora",
};

export type ResultadoIndice = {
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  popularity: number;
  /** Por que este título apareceu. Vai direto para a tela. */
  motivo: string;
};

/**
 * Mesma normalização do script de indexação. Precisa ser
 * idêntica, senão a busca nunca casa com o que foi gravado.
 *
 *   "Clark Kent"    -> "clark kent"
 *   "Seth Cohen"    -> "seth cohen"
 *   "Léon"          -> "leon"
 *   "Obi-Wan Kenobi"-> "obi wan kenobi"
 */
export function normalizarNome(valor: string): string {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Migrado para Neon Serverless getDb()

/**
 * Junta as ligações com os títulos e ordena por popularidade.
 *
 * As ligações vêm de search_character_media ou
 * search_people_media; ambas trazem (media_type, tmdb_id).
 */
async function montarResultados(
  ligacoes: { media_type: string; tmdb_id: number }[],
  motivoPorChave: Map<string, string>,
  limite: number
): Promise<ResultadoIndice[]> {
  if (ligacoes.length === 0) return [];

  /*
   * Uma consulta por tipo de mídia. A PK de search_media é
   * (media_type, tmdb_id), então filtrar por media_type e usar
   * ANY(...) no tmdb_id aproveita o índice da chave primária.
   */
  const porTipo = new Map<string, number[]>();

  for (const l of ligacoes) {
    if (l.media_type !== "movie" && l.media_type !== "tv") continue;

    const lista = porTipo.get(l.media_type) || [];
    lista.push(l.tmdb_id);
    porTipo.set(l.media_type, lista);
  }

  const sql = getDb();
  const consultas = Array.from(porTipo.entries()).map(
    async ([tipo, ids]) => {
      const targetIds = ids.slice(0, 300);
      const rows = await sql`
        SELECT media_type, tmdb_id, title, popularity
        FROM public.search_media
        WHERE media_type = ${tipo}
          AND tmdb_id = ANY(${targetIds})
      `;
      return rows || [];
    }
  );

  const titulos = (await Promise.all(consultas)).flat();

  return titulos
    .map((t: any) => ({
      media_type: t.media_type as "movie" | "tv",
      tmdb_id: Number(t.tmdb_id),
      title: String(t.title),
      popularity: Number(t.popularity || 0),
      motivo:
        motivoPorChave.get(`${t.media_type}-${t.tmdb_id}`) || "",
    }))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limite);
}

/**
 * Busca títulos em que um PERSONAGEM aparece.
 *
 *   "clark kent"  -> filmes e séries do Superman
 *   "seth cohen"  -> The O.C.
 *
 * Estratégia em três degraus, do mais preciso ao mais amplo.
 * Para no primeiro que der resultado — assim "batman" não é
 * afogado por "batman robot" e derivados.
 */
export async function buscarPorPersonagem(
  consulta: string,
  limite = 40
): Promise<{
  personagem: string | null;
  resultados: ResultadoIndice[];
}> {
  const normalizada = normalizarNome(consulta);

  if (normalizada.length < 3) {
    return { personagem: null, resultados: [] };
  }

  const sql = getDb();

  /* 1. Exato — usa o índice único de normalized_name. */
  let personagens = await sql`
    SELECT id, name, normalized_name
    FROM public.search_characters
    WHERE normalized_name = ${normalizada}
    LIMIT 5
  `;

  /* 2. Começa com — btree cobre prefixo sem precisar de trigram. */
  if (!personagens?.length) {
    personagens = await sql`
      SELECT id, name, normalized_name
      FROM public.search_characters
      WHERE normalized_name LIKE ${normalizada + '%'}
      LIMIT 8
    `;
  }

  /*
   * 3. Contém — só se os anteriores falharem.
   */
  if (!personagens?.length) {
    personagens = await sql`
      SELECT id, name, normalized_name
      FROM public.search_characters
      WHERE normalized_name LIKE ${'%' + normalizada + '%'}
      LIMIT 5
    `;
  }

  if (!personagens?.length) {
    return { personagem: null, resultados: [] };
  }

  const ids = personagens.map((p: any) => p.id);

  const nomePorId = new Map<number, string>(
    personagens.map((p: any) => [p.id, p.name])
  );

  const ligacoes = await sql`
    SELECT character_id, media_type, tmdb_id
    FROM public.search_character_media
    WHERE character_id = ANY(${ids})
    LIMIT 600
  `;

  if (!ligacoes?.length) {
    return {
      personagem: personagens[0]?.name || null,
      resultados: [],
    };
  }

  const motivos = new Map<string, string>();

  for (const l of ligacoes as any[]) {
    const chave = `${l.media_type}-${l.tmdb_id}`;

    if (!motivos.has(chave)) {
      motivos.set(
        chave,
        `Personagem: ${nomePorId.get(l.character_id) || consulta}`
      );
    }
  }

  const resultados = await montarResultados(
    ligacoes as any[],
    motivos,
    limite
  );

  return {
    personagem: personagens[0]?.name || null,
    resultados,
  };
}

/**
 * Busca títulos de uma PESSOA (ator, diretor, roteirista…).
 *
 * Complementa a busca do TMDB: aqui a resposta é local e
 * instantânea, sem chamada externa.
 */
export async function buscarPorPessoa(
  consulta: string,
  limite = 40
): Promise<{
  pessoa: string | null;
  resultados: ResultadoIndice[];
}> {
  const normalizada = normalizarNome(consulta);

  if (normalizada.length < 3) {
    return { pessoa: null, resultados: [] };
  }

  const sql = getDb();

  let pessoas = await sql`
    SELECT person_id, name, normalized_name
    FROM public.search_people
    WHERE normalized_name = ${normalizada}
    LIMIT 5
  `;

  if (!pessoas?.length) {
    pessoas = await sql`
      SELECT person_id, name, normalized_name
      FROM public.search_people
      WHERE normalized_name LIKE ${normalizada + '%'}
      LIMIT 8
    `;
  }

  if (!pessoas?.length) {
    return { pessoa: null, resultados: [] };
  }

  const ids = pessoas.map((p: any) => p.person_id);

  const nomePorId = new Map<number, string>(
    pessoas.map((p: any) => [p.person_id, p.name])
  );

  const ligacoes = await sql`
    SELECT person_id, media_type, tmdb_id, role
    FROM public.search_people_media
    WHERE person_id = ANY(${ids})
    LIMIT 600
  `;

  if (!ligacoes?.length) {
    return { pessoa: pessoas[0]?.name || null, resultados: [] };
  }

  const motivos = new Map<string, string>();

  for (const l of ligacoes as any[]) {
    const chave = `${l.media_type}-${l.tmdb_id}`;

    if (!motivos.has(chave)) {
      const funcao = FUNCOES[Number(l.role)] || "Participação";

      motivos.set(
        chave,
        `${funcao}: ${nomePorId.get(l.person_id) || consulta}`
      );
    }
  }

  const resultados = await montarResultados(
    ligacoes as any[],
    motivos,
    limite
  );

  return { pessoa: pessoas[0]?.name || null, resultados };
}

/*
 * ============================================================
 * NOTA — busca por "contém" e a extensão pg_trgm
 *
 * O degrau 3 (LIKE '%texto%') não usa índice nenhum: o btree
 * só serve para prefixo. Com 166 mil personagens, essa consulta
 * varre a tabela inteira.
 *
 * Hoje isso é aceitável — só roda quando exato e prefixo
 * falham, e o limite é 5. Se ficar lento, rode uma vez:
 *
 *   create extension if not exists pg_trgm;
 *
 *   create index concurrently if not exists
 *     search_characters_nome_trgm_idx
 *     on public.search_characters
 *     using gin (normalized_name gin_trgm_ops);
 *
 *   create index concurrently if not exists
 *     search_people_nome_trgm_idx
 *     on public.search_people
 *     using gin (normalized_name gin_trgm_ops);
 *
 * Não inclua isso no primeiro teste. Meça antes: índice GIN
 * ocupa espaço e deixa a reindexação do script mais lenta.
 * ============================================================
 */
