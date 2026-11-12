import { expect, test, type APIRequestContext } from "@playwright/test";

import { json } from "./api-helpers";

/*
 * "Sua nota" no topo do título: escolhe o inteiro na escala e o décimo logo
 * abaixo (8 + ,5 = 8,5). O título 155 é só deste arquivo.
 */

const MOVIE = 155;

async function remove(request: APIRequestContext) {
  const found = await json(await request.get(`/api/library?tmdb_id=${MOVIE}&type=movie`));
  if (found?.id) await request.delete(`/api/library/${found.id}`);
}

test.beforeEach(async ({ request }) => {
  await remove(request);
  const added = await request.post("/api/library", { data: { media: { id: MOVIE, media_type: "movie" }, status: "watched" } });
  expect(added.ok()).toBe(true);
});

test.afterEach(async ({ request }) => remove(request));

test("nota com decimal pela escala do título", async ({ page, request }) => {
  await page.goto(`/title/movie/${MOVIE}`);
  await page.getByRole("radio", { name: "Nota 8", exact: true }).click();
  await page.getByRole("radio", { name: "Nota 8,5" }).click();
  await expect(page.locator(".tt-rating-value")).toContainText("8,5");

  await expect
    .poll(async () => Number((await json(await request.get(`/api/library?tmdb_id=${MOVIE}&type=movie`)))?.personal_rating), { timeout: 15_000 })
    .toBe(8.5);
});
