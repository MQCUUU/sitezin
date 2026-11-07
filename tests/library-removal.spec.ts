import { expect, test, type APIRequestContext } from "@playwright/test";

/*
 * Fase 1 — remover da Biblioteca apaga o histórico do título.
 *
 * Regra de produto (2026-11): sem rastro depois da remoção — visualizações,
 * episódios e Diário saem junto com o item. Um id inválido não apaga nada.
 * Usa um título só deste arquivo (278 = Um Sonho de Liberdade).
 */

const MEDIA = { id: 278, media_type: "movie" as const };
const WATCHED_AT = "2026-10-05";
const MONTH = WATCHED_AT.slice(0, 7);

async function call(request: APIRequestContext, method: string, url: string, data?: unknown) {
  const response = await request.fetch(url, {
    method,
    data,
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body };
}

async function lookup(request: APIRequestContext) {
  const { status, body } = await call(request, "GET", `/api/library?tmdb_id=${MEDIA.id}&type=movie`);
  expect(status, JSON.stringify(body)).toBe(200);
  return body as { id: string } | null;
}

async function removeIfPresent(request: APIRequestContext) {
  const item = await lookup(request);
  if (item?.id) expect((await call(request, "DELETE", `/api/library/${item.id}`)).status).toBe(200);
}

async function addWatched(request: APIRequestContext) {
  const added = await call(request, "POST", "/api/library", { media: MEDIA, status: "watched" });
  expect([200, 201], JSON.stringify(added.body)).toContain(added.status);
  return added.body.id as string;
}

async function watchCount(request: APIRequestContext, libraryId: string) {
  const { status, body } = await call(request, "GET", `/api/watch-history?library_id=${libraryId}`);
  expect(status, JSON.stringify(body)).toBe(200);
  return (Array.isArray(body) ? body : body?.entries ?? body?.data ?? []).length as number;
}

/** O título aparece em algum momento do Diário do mês? */
async function inDiary(request: APIRequestContext) {
  const { status, body } = await call(request, "GET", `/api/diary?month=${MONTH}`);
  expect(status, JSON.stringify(body)).toBe(200);
  return JSON.stringify(body?.days ?? []).includes(`"tmdb_id":${MEDIA.id}`);
}

test.describe.configure({ mode: "serial" });

test.describe("remover da biblioteca apaga o histórico", () => {
  test.beforeEach(async ({ request }) => removeIfPresent(request));
  test.afterAll(async ({ request }) => removeIfPresent(request));

  test("visualização e Diário somem junto com o item; readicionar começa do zero", async ({ request }) => {
    const id = await addWatched(request);
    const logged = await call(request, "POST", "/api/watch-history", { library_id: id, watched_at: WATCHED_AT });
    expect([200, 201], JSON.stringify(logged.body)).toContain(logged.status);

    expect(await watchCount(request, id), "a visualização foi registrada").toBeGreaterThan(0);
    expect(await inDiary(request), "o Diário mostra o título antes da remoção").toBe(true);

    expect((await call(request, "DELETE", `/api/library/${id}`)).status).toBe(200);
    expect(await lookup(request)).toBeNull();
    expect(await inDiary(request), "o Diário não mostra mais o título").toBe(false);

    // Readicionar cria uma entrada nova, sem herdar visualizações antigas.
    const again = await call(request, "POST", "/api/library", { media: MEDIA, status: "want" });
    expect([200, 201]).toContain(again.status);
    expect(again.body.id).not.toBe(id);
    expect(await watchCount(request, again.body.id), "nenhuma visualização antiga voltou").toBe(0);
  });

  test("id inexistente: 404 e o histórico do título fica intacto", async ({ request }) => {
    const id = await addWatched(request);
    expect([200, 201]).toContain((await call(request, "POST", "/api/watch-history", { library_id: id, watched_at: WATCHED_AT })).status);
    const before = await watchCount(request, id);

    const missing = await call(request, "DELETE", "/api/library/00000000-0000-0000-0000-000000000000");
    expect(missing.status).toBe(404);

    expect(await watchCount(request, id)).toBe(before);
    expect(await inDiary(request)).toBe(true);
  });
});
