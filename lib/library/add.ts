/*
 * Fase 0 — "Adicionar à biblioteca" nunca altera um item que já existe.
 *
 * POST /api/library CRIA o item quando ele não existe. Se ele já existe (outra
 * aba, leitura de estado que falhou, clique duplo, cliente defeituoso), o item
 * volta exatamente como está: status, curtida, nota, resenha, reassistidas e
 * temporadas só mudam por PATCH /api/library/[id], que altera apenas os campos
 * enviados.
 *
 * Antes, o POST era um upsert que gravava os valores do corpo por cima do item
 * existente: uma falha na leitura do estado fazia a tela enviar os padrões
 * ("Quero assistir", sem curtida, sem nota, resenha vazia) e apagava os dados
 * reais (P0-01 da auditoria).
 *
 * A criação é um único `INSERT ... ON CONFLICT DO NOTHING`: entre duas
 * requisições simultâneas, só uma cria; a outra recebe o item criado
 * (idempotente, sem evento duplicado).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

export type AddLibraryBody = {
  status?: string;
  favorite?: boolean;
  personal_rating?: number | null;
  review?: string | null;
};

export type AddLibraryMedia = {
  id: number | string;
  media_type: string;
  seasons_count?: number | null;
};

export type NewLibraryItemValues = {
  status: string;
  favorite: boolean;
  personal_rating: number | null;
  review: string | null;
  rewatch_count: number;
  current_season: number | null;
  completed_seasons: number;
  stopped_season: number | null;
};

/**
 * Valores iniciais de um item NOVO. O que o usuário escolheu antes de adicionar
 * (status, curtida) entra no item criado; o resto tem o padrão. Mesmas regras
 * que o POST já aplicava para itens novos (reassistidas e temporadas).
 */
export function newLibraryItemValues(body: AddLibraryBody, media: AddLibraryMedia): NewLibraryItemValues {
  const status = body.status || "want";
  const isTv = media.media_type === "tv";

  let currentSeason: number | null = isTv ? 1 : null;
  let completedSeasons = 0;

  if (isTv && status === "rewatched") {
    const totalSeasons = Number(media.seasons_count || 0);
    completedSeasons = totalSeasons;
    currentSeason = totalSeasons || 1;
  }

  return {
    status,
    favorite: body.favorite === true,
    personal_rating: body.personal_rating ?? null,
    review: body.review ?? null,
    // Entrar direto em Reassistindo/Reassistido conta uma reassistida.
    rewatch_count: status === "rewatching" || status === "rewatched" ? 1 : 0,
    current_season: currentSeason,
    completed_seasons: completedSeasons,
    stopped_season: null,
  };
}

/**
 * Cria o item se ele ainda não existe; se já existe, devolve-o sem alterar nada.
 * `created` diz qual dos dois aconteceu (só a criação gera `library_added`).
 */
export async function addLibraryItem(
  sql: Sql,
  input: { userId: string; media: AddLibraryMedia; body: AddLibraryBody }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ item: Record<string, any>; created: boolean }> {
  const { userId, media, body } = input;
  const values = newLibraryItemValues(body, media);

  const inserted = await sql`
    INSERT INTO public.library_items (
      user_id,
      media_id,
      status,
      favorite,
      personal_rating,
      review,
      rewatch_count,
      current_season,
      completed_seasons,
      stopped_season,
      updated_at
    )
    VALUES (
      ${userId},
      ${media.id},
      ${values.status},
      ${values.favorite},
      ${values.personal_rating},
      ${values.review},
      ${values.rewatch_count},
      ${values.current_season},
      ${values.completed_seasons},
      ${values.stopped_season},
      NOW()
    )
    ON CONFLICT (user_id, media_id) DO NOTHING
    RETURNING
      id, status, favorite, personal_rating, review, watched_at, rewatch_count,
      current_season, completed_seasons, stopped_season, added_at, updated_at;
  `;

  if (inserted[0]) return { item: inserted[0], created: true };

  const existing = await sql`
    SELECT
      id, status, favorite, personal_rating, review, watched_at, rewatch_count,
      current_season, completed_seasons, stopped_season, added_at, updated_at
    FROM public.library_items
    WHERE user_id = ${userId} AND media_id = ${media.id}
    LIMIT 1;
  `;

  if (!existing[0]) {
    // Conflito com um item que sumiu entre os dois comandos (removido em outra aba).
    throw new Error("O item da biblioteca mudou durante a operação. Tente de novo.");
  }

  return { item: existing[0], created: false };
}
