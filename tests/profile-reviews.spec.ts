import { expect, test, type APIRequestContext } from "@playwright/test";

import { json } from "./api-helpers";

/*
 * Aba Reviews do perfil: só entra avaliação com texto (só nota fica de fora);
 * a linha leva à página da avaliação e o pôster, ao título. Títulos 8587 e 597
 * são só deste arquivo.
 */

const WITH_TEXT = 8587;
const ONLY_RATING = 597;
const MARK = `PR-${Date.now()}`;

test.describe.configure({ mode: "serial" });

async function remove(request: APIRequestContext, tmdbId: number) {
  const found = await json(await request.get(`/api/library?tmdb_id=${tmdbId}&type=movie`));
  if (found?.id) await request.delete(`/api/library/${found.id}`);
}

async function rate(request: APIRequestContext, tmdbId: number, patch: Record<string, unknown>) {
  await remove(request, tmdbId);
  const item = await json(await request.post("/api/library", { data: { media: { id: tmdbId, media_type: "movie" }, status: "watched" } }));
  expect((await request.patch(`/api/library/${item.id}`, { data: { status: "watched", ...patch } })).ok()).toBe(true);
  return item.id as string;
}

let textId = "";
let ratingId = "";
let username = "";

test.beforeAll(async ({ request }) => {
  textId = await rate(request, WITH_TEXT, { personal_rating: 7, review: `${MARK} resenha` });
  ratingId = await rate(request, ONLY_RATING, { personal_rating: 6 });
  username = (await json(await request.get("/api/profile/username"))).username;
});

test.afterAll(async ({ request }) => {
  await remove(request, WITH_TEXT);
  await remove(request, ONLY_RATING);
});

test("a API do perfil só traz reviews com texto", async ({ request }) => {
  const data = await json(await request.get(`/api/public-profile/${username}`));
  const ids = (data.reviews ?? []).map((r: { id: string }) => r.id);
  expect(ids).toContain(textId);
  expect(ids).not.toContain(ratingId);
  for (const r of data.reviews) expect(String(r.review ?? "").trim()).not.toBe("");
});

test("na aba Reviews, o texto abre a avaliação e o pôster abre o título", async ({ page }) => {
  await page.goto(`/u/${username}?tab=reviews`);
  const row = page.locator(".profile-review-card").filter({ hasText: `${MARK} resenha` });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(row.locator(".profile-review-poster")).toHaveAttribute("href", `/title/movie/${WITH_TEXT}`);
  await expect(row.locator(".profile-review-body")).toHaveAttribute("href", `/review/${textId}`);
});
