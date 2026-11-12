import { expect, type APIRequestContext } from "@playwright/test";

import { json } from "./api-helpers";

/* Relações entre as contas A e B nos E2E sociais (curtidas, comentários, indicações). */

export async function usernameOf(request: APIRequestContext): Promise<string> {
  const me = await json(await request.get("/api/profile/username"));
  expect(me?.username, "conta de teste sem username").toBeTruthy();
  return String(me.username);
}

/** `follower` passa a seguir `followed`; se ficar pendente, `followed` aceita. */
export async function follow(follower: APIRequestContext, followed: APIRequestContext) {
  const followerName = await usernameOf(follower);
  const followedName = await usernameOf(followed);
  const response = await follower.post("/api/follows", { data: { username: followedName } });
  expect(response.ok(), `seguir @${followedName}`).toBe(true);
  const { status } = await json(response);
  if (status === "accepted") return;

  const incoming = await json(await followed.get("/api/follows?type=incoming"));
  const request = (incoming?.items ?? []).find((item: { profile?: { username?: string } }) => item.profile?.username === followerName);
  expect(request, "pedido para seguir não apareceu").toBeTruthy();
  const accepted = await followed.patch("/api/follows", { data: { follower_id: request.follower_id, action: "accept" } });
  expect(accepted.ok(), "aceitar pedido").toBe(true);
}

export async function unfollow(follower: APIRequestContext, followed: APIRequestContext) {
  const followedName = await usernameOf(followed);
  await follower.delete("/api/follows", { data: { username: followedName } });
}
