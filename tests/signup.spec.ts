import {
  expect,
  test,
} from "@playwright/test";

test(
  "cadastro aceita um novo usuário",
  async ({
    page,
  }) => {
    /*
     * Cada execução usa um e-mail novo.
     *
     * Para não criar lixo infinito no seu Supabase,
     * rode este teste quando quiser validar cadastro,
     * não necessariamente em todo save.
     */
    const stamp =
      Date.now();

    const domain =
      process.env
        .E2E_SIGNUP_DOMAIN ||
      "example.com";

    const email =
      `mycatalog-e2e-${stamp}@${domain}`;

    await page.goto(
      "/signup"
    );

    await page
      .getByLabel(
        "Nome"
      )
      .fill(
        "MyCatalog E2E"
      );

    /*
     * Fase 0: o @ de usuário passou a ser obrigatório no cadastro.
     */
    await page
      .getByLabel(
        /usuário/i
      )
      .first()
      .fill(
        `e2e_${stamp}`
      );

    await page
      .getByLabel(
        "E-mail"
      )
      .fill(
        email
      );

    const passwordInputs =
      page.locator(
        'input[autocomplete="new-password"]'
      );

    await passwordInputs
      .nth(
        0
      )
      .fill(
        "MyCatalog#E2E2026"
      );

    await passwordInputs
      .nth(
        1
      )
      .fill(
        "MyCatalog#E2E2026"
      );

    await page
      .getByRole(
        "button",
        {
          name:
            /Criar minha conta/i,
        }
      )
      .click();

    /*
     * Se confirmação de e-mail estiver ligada:
     * /signup/success
     *
     * Se estiver desligada:
     * login automático -> /
     */
    await expect
      .poll(
        async () =>
          page.url()
      )
      .toMatch(
        /\/signup\/success|\/$/
      );

    /*
     * Fase 0: com login automático, a conta descartável é excluída
     * no fim (cascata no banco de teste) para não acumular contas.
     */
    if (
      !page.url().includes("/signup/success")
    ) {
      const removed =
        await page.request.delete(
          "/api/account/delete"
        );

      expect(
        removed.status()
      ).toBe(
        200
      );
    }
  }
);

/*
 * Fase 0 — cadastro parcial: a conta foi criada no Auth, mas o perfil falhou.
 * O próximo envio só tenta o perfil de novo (nunca recria a conta) e conclui.
 */
test("cadastro parcial: falha no perfil é recuperada sem recriar a conta", async ({ page }) => {
  const stamp = Date.now();
  const domain = process.env.E2E_SIGNUP_DOMAIN || "example.com";
  const username = `e2e_r${stamp}`;
  const signUps: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/auth/sign-up")) signUps.push(request.url());
  });

  let failures = 1;
  await page.route("**/api/auth/profile", async (route) => {
    if (route.request().method() === "POST" && failures > 0) {
      failures -= 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "falha simulada" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/signup");
  await page.getByLabel("Nome").fill("MyCatalog E2E");
  await page.getByLabel(/usuário/i).first().fill(username);
  await page.getByLabel("E-mail").fill(`mycatalog-e2e-r${stamp}@${domain}`);
  const passwords = page.locator('input[autocomplete="new-password"]');
  await passwords.nth(0).fill("MyCatalog#E2E2026");
  await passwords.nth(1).fill("MyCatalog#E2E2026");
  await page.getByRole("button", { name: /Criar minha conta/i }).click();

  await expect(page.locator(".auth-error")).toContainText("Sua conta foi criada");
  const finish = page.getByRole("button", { name: /Concluir cadastro/i });
  await expect(finish).toBeVisible();

  await finish.click();
  await expect.poll(async () => new URL(page.url()).pathname).toBe("/");
  expect(signUps, "a conta é criada uma única vez").toHaveLength(1);

  const me = await (await page.request.get("/api/profile/username")).json();
  expect(me).toMatchObject({ authenticated: true, username });

  const removed = await page.request.delete("/api/account/delete");
  expect(removed.status()).toBe(200);
});
