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
 * No localhost a pessoa entra mesmo assim e o UsernameGate grava o perfil
 * pendente na sequência (nunca recria a conta).
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
  let profileAttempts = 0;
  await page.route("**/api/auth/profile", async (route) => {
    if (route.request().method() === "POST") profileAttempts += 1;
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
  const email = `mycatalog-e2e-r${stamp}@${domain}`;
  await page.getByLabel("E-mail").fill(email);
  const passwords = page.locator('input[autocomplete="new-password"]');
  await passwords.nth(0).fill("MyCatalog#E2E2026");
  await passwords.nth(1).fill("MyCatalog#E2E2026");
  await page.getByRole("button", { name: /Criar minha conta/i }).click();

  /*
   * Fluxo do localhost (desde 656cc5a): a falha do perfil não trava o cadastro.
   * A pessoa entra direto no app e o perfil fica pendente até o próximo login.
   */
  try {
    await expect.poll(async () => new URL(page.url()).pathname, { timeout: 20_000 }).toBe("/");
    expect(signUps, "a conta é criada uma única vez").toHaveLength(1);

    // O UsernameGate encontra o perfil pendente e o grava de novo, sem recriar a conta.
    await expect
      .poll(async () => (await (await page.request.get("/api/profile/username")).json()).username, { timeout: 20_000 })
      .toBe(username);
    expect(profileAttempts, "houve a falha simulada e uma nova tentativa").toBeGreaterThanOrEqual(2);
    expect(signUps, "a recuperação não recria a conta").toHaveLength(1);
  } finally {
    // Limpa a conta descartável mesmo se uma asserção falhar no meio (sem sessão, entra antes).
    let removed = await page.request.delete("/api/account/delete");
    if (removed.status() === 401) {
      const origin = new URL(page.url()).origin;
      const signedIn = await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: origin },
        data: { email, password: "MyCatalog#E2E2026" },
      });
      if (signedIn.ok()) removed = await page.request.delete("/api/account/delete");
    }
    expect([200, 401], "conta descartável removida (401 = nunca chegou a existir)").toContain(removed.status());
  }
});
