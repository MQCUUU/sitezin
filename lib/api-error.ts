import { NextResponse } from "next/server";

/*
 * ============================================================
 * ARQUIVO NOVO — tratamento de erro das rotas de API
 *
 * O PROBLEMA
 *   60 pontos espalhados por 23 rotas fazem alguma variação de:
 *
 *     return NextResponse.json(
 *       { error: error.message },
 *       { status: 500 }
 *     );
 *
 *   Isso manda a exceção crua do banco para o navegador. Você
 *   viu isso acontecer ao vivo: a tela do app exibiu
 *   "new row violates row-level security policy for table
 *   media" — nome interno de tabela e mecanismo de segurança,
 *   para qualquer usuário ler.
 *
 *   Para você, debugando, foi útil. Para um usuário, é uma
 *   mensagem incompreensível. Para alguém sondando o app, é um
 *   mapa da estrutura interna.
 *
 * A SOLUÇÃO
 *   O detalhe vai para o log do SERVIDOR (visível em
 *   `npm run dev` e nos Runtime Logs da Vercel). O usuário
 *   recebe uma frase útil e genérica.
 *
 *   Nada de reinventar: só centraliza o que já é feito 60
 *   vezes, de 60 jeitos ligeiramente diferentes.
 * ============================================================
 */

/*
 * Códigos do Postgres que têm tradução útil para o usuário.
 * Qualquer outro cai na mensagem genérica.
 */
const MENSAGENS_POR_CODIGO: Record<string, { texto: string; status: number }> = {
  // unique_violation
  "23505": {
    texto: "Esse item já está na sua biblioteca.",
    status: 409,
  },
  // foreign_key_violation
  "23503": {
    texto: "Não foi possível salvar: um dado relacionado não existe.",
    status: 400,
  },
  // check_violation
  "23514": {
    texto: "Algum valor enviado está fora do permitido.",
    status: 400,
  },
  // not_null_violation
  "23502": {
    texto: "Faltou preencher um campo obrigatório.",
    status: 400,
  },
  // insufficient_privilege / RLS
  "42501": {
    texto: "Você não tem permissão para essa ação.",
    status: 403,
  },
};

type ErroSupabase = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

/**
 * Registra o erro completo no servidor e devolve uma resposta
 * JSON segura para o cliente.
 *
 * @param erro     o que veio do catch ou do `error` do Supabase
 * @param contexto rótulo curto para achar no log, ex "POST /api/library"
 * @param statusPadrao usado quando o erro não tem código conhecido
 */
export function respostaDeErro(
  erro: unknown,
  contexto: string,
  statusPadrao = 500
) {
  const e = erro as ErroSupabase;

  /*
   * Log completo, só no servidor. Inclui code, details e hint,
   * que são justamente o que ajuda a diagnosticar e o que NÃO
   * pode ir para o navegador.
   */
  console.error(`[${contexto}]`, {
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
  });

  const conhecido = e?.code
    ? MENSAGENS_POR_CODIGO[e.code]
    : undefined;

  if (conhecido) {
    return NextResponse.json(
      { error: conhecido.texto },
      { status: conhecido.status }
    );
  }

  return NextResponse.json(
    {
      error:
        statusPadrao >= 500
          ? "Não foi possível concluir. Tente novamente em instantes."
          : "Requisição inválida.",
    },
    { status: statusPadrao }
  );
}

/**
 * Atalho para 401. Todas as rotas autenticadas repetem esse
 * bloco hoje.
 */
export function naoAutenticado() {
  return NextResponse.json(
    { error: "Não autenticado" },
    { status: 401 }
  );
}

/**
 * Atalho para erro de validação de entrada. Aqui a mensagem
 * PODE ser específica — foi você que escreveu, não o banco.
 */
export function entradaInvalida(mensagem: string) {
  return NextResponse.json(
    { error: mensagem },
    { status: 400 }
  );
}