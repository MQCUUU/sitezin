import { expect, test } from "@playwright/test";

/*
 * Fase 0 — P1-02: o login não aplica a política de força de senha.
 * Uma senha antiga (criada antes da política) precisa CHEGAR ao provedor;
 * quem decide se ela está certa é ele. Usa um e-mail que não existe: o
 * teste prova que o formulário envia, não que a senha é válida.
 */

const UNKNOWN_EMAIL = "mycatalog-p102-nao-existe@example.com";
const LEGACY_PASSWORD = "senha12345"; // sem maiúscula e sem símbolo

test("login envia ao provedor uma senha fora da política atual", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(UNKNOWN_EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(LEGACY_PASSWORD);

  const signIn = page.waitForRequest(
    (request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/auth/sign-in/email"
  );
  await page.getByRole("button", { name: /^Entrar$/ }).click();

  const request = await signIn;
  expect(request.postDataJSON()).toMatchObject({ email: UNKNOWN_EMAIL });

  await expect(page.locator(".auth-error")).toBeVisible();
  await expect(page.locator(".auth-error")).not.toContainText(/maiúscula|minúscula|número|símbolo/i);
});

test("login vazio pede a senha sem chamar o provedor", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/sign-in")) calls.push(request.url());
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(UNKNOWN_EMAIL);
  await page.getByRole("button", { name: /^Entrar$/ }).click();

  await expect(page.locator(".auth-error, :invalid").first()).toBeVisible();
  expect(calls).toEqual([]);
});

test("cadastro continua exigindo a política de força (sem chamar o provedor)", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/sign-up")) calls.push(request.url());
  });

  await page.goto("/signup");
  await page.getByLabel("Nome").fill("Política de senha");
  await page.getByLabel(/usuário/i).first().fill("politica_senha");
  await page.getByLabel("E-mail").fill(UNKNOWN_EMAIL);
  const passwords = page.locator('input[autocomplete="new-password"]');
  await passwords.nth(0).fill(LEGACY_PASSWORD);
  await passwords.nth(1).fill(LEGACY_PASSWORD);
  await page.getByRole("button", { name: /Criar minha conta/i }).click();

  await expect(page.locator(".auth-error")).toContainText(/maiúscula/i);
  expect(calls).toEqual([]);
});
