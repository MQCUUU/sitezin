import { expect, type APIRequestContext, type Browser, type BrowserContext } from "@playwright/test";

/*
 * Fase 6 — sessões para os testes de API: a conta A vem do auth.setup (fixture
 * `request`); a conta B (E2E_USER2_*) e visitantes são criados aqui. Credenciais
 * só do ambiente local; nunca aparecem em log.
 */

export function credentialsB() {
  const email = process.env.E2E_USER2_EMAIL;
  const password = process.env.E2E_USER2_PASSWORD;
  if (!email || !password) throw new Error("Defina E2E_USER2_EMAIL e E2E_USER2_PASSWORD (2ª conta de teste) para os testes de autorização.");
  return { email, password };
}

export async function loginContext(browser: Browser, email: string, password: string): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 20_000 });
  await page.close();
  return context;
}

export async function guestContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo de resposta arbitrário nos testes
export async function json<T = any>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const RANDOM_UUID = "7b5d1f2e-9c3a-4e8b-a1d2-0f9e8d7c6b5a";
