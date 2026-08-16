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
  }
);