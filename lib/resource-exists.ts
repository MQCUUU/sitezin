import { getDb } from "@/lib/db/neon";
import { isUuid } from "@/lib/lists/validate";
import { detailsTMDB, personTMDB, seasonTMDB } from "@/lib/tmdb";

/*
 * Fase 5 (P3-05) — "este recurso existe?", decidido ANTES de renderizar.
 *
 * Por quê aqui e não com notFound() na página: o app tem app/loading.tsx na
 * raiz, então toda página responde em streaming e o status 200 já saiu quando
 * a página chama notFound() (comportamento documentado do Next 16 — testado:
 * nem notFound() no generateMetadata muda o status). O proxy chama estas
 * funções e responde 404 de verdade.
 *
 * Três respostas, nunca duas:
 *   true  → existe;
 *   false → comprovadamente NÃO existe (TMDB 404, linha ausente no banco);
 *   null  → não deu para saber (timeout, TMDB/banco fora) — segue para a
 *           página, que mostra o estado de erro recuperável. Falha temporária
 *           nunca vira 404.
 *
 * Cache em memória do processo: TMDB (título, pessoa, episódio) — "existe" por
 * 6 h, "não existe" por 10 min; perfil — só "existe", por 60 s; lista — sem
 * cache (a visibilidade decide o 404). "Não sei" nunca é guardado.
 */

export type Existence = boolean | null;

const FOUND_TTL = 6 * 60 * 60 * 1000;
const MISSING_TTL = 10 * 60 * 1000;
const MAX_ENTRIES = 2000;
const cache = new Map<string, { value: boolean; until: number }>();

async function cached(
  key: string,
  check: () => Promise<Existence>,
  ttl: { found: number; missing: number } = { found: FOUND_TTL, missing: MISSING_TTL }
): Promise<Existence> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;

  const value = await check();
  const keepFor = value === null ? 0 : value ? ttl.found : ttl.missing;
  if (keepFor > 0) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, { value: value as boolean, until: Date.now() + keepFor });
  }
  return value;
}

/** lib/tmdb lança `TMDB <status>: …`; só o 404 significa "não existe". */
export function isTmdbNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("TMDB 404");
}

async function tmdbExists(load: () => Promise<unknown>): Promise<Existence> {
  try {
    await load();
    return true;
  } catch (error) {
    return isTmdbNotFound(error) ? false : null;
  }
}

const POSITIVE_INT = /^[1-9]\d{0,9}$/;

export function titleExists(type: string, id: string): Promise<Existence> {
  if ((type !== "movie" && type !== "tv") || !POSITIVE_INT.test(id)) return Promise.resolve(false);
  return cached(`title:${type}:${id}`, () => tmdbExists(() => detailsTMDB(type, id)));
}

export function personExists(id: string): Promise<Existence> {
  if (!POSITIVE_INT.test(id)) return Promise.resolve(false);
  return cached(`person:${id}`, () => tmdbExists(() => personTMDB(id)));
}

export function episodeExists(tvId: string, season: string, episode: string): Promise<Existence> {
  if (!POSITIVE_INT.test(tvId) || !/^\d{1,4}$/.test(season) || !POSITIVE_INT.test(episode)) {
    return Promise.resolve(false);
  }
  return cached(`episode:${tvId}:${season}:${episode}`, async () => {
    try {
      const data = (await seasonTMDB(tvId, Number(season))) as { episodes?: { episode_number?: number }[] };
      if (!Array.isArray(data?.episodes)) return null;
      return data.episodes.some((item) => Number(item?.episode_number) === Number(episode));
    } catch (error) {
      return isTmdbNotFound(error) ? false : null;
    }
  });
}

export function profileExists(username: string): Promise<Existence> {
  // Filtro permissivo de propósito (a regra atual do @ é mais estrita, mas contas antigas
  // podem fugir dela) — só descarta o que nunca seria um @; o banco decide o resto.
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(username)) return Promise.resolve(false);
  /*
   * O @ pode ser criado ou trocado a qualquer momento: "não existe" NUNCA é
   * guardado (um perfil novo nunca leva 404 por cache); "existe" vale 60 s
   * (um @ recém-trocado responde 200 por até 1 min e a página mostra o
   * "não encontrado" dela). Só existência — a visibilidade é lida na hora.
   */
  return cached(
    `profile:${username.toLowerCase()}`,
    async () => {
      try {
        const rows = await getDb()`SELECT 1 FROM public.profiles WHERE lower(username) = lower(${username}) LIMIT 1`;
        return rows.length > 0;
      } catch {
        return null;
      }
    },
    { found: 60 * 1000, missing: 0 }
  );
}

export type ListAccess = { exists: false } | { exists: true; isPublic: boolean; ownerId: string } | null;

/**
 * Sem cache: a visibilidade da lista muda na hora em que o dono troca
 * (pública ↔ privada) e o resultado decide quem vê o quê.
 */
export async function listAccess(id: string): Promise<ListAccess> {
  if (!isUuid(id)) return { exists: false };
  try {
    const rows = (await getDb()`
      SELECT is_public, user_id FROM public.custom_lists WHERE id = ${id} LIMIT 1
    `) as { is_public: boolean; user_id: string }[];
    if (!rows[0]) return { exists: false };
    return { exists: true, isPublic: Boolean(rows[0].is_public), ownerId: String(rows[0].user_id) };
  } catch {
    return null;
  }
}
