import {
  expect,
  test as setup,
} from "@playwright/test";

import {
  mkdir,
} from "node:fs/promises";

const authFile =
  "playwright/.auth/user.json";

setup(
  "login da conta E2E",
  async ({
    page,
  }) => {
    const email =
      process.env
        .E2E_USER_EMAIL;

    const password =
      process.env
        .E2E_USER_PASSWORD;

    if (
      !email ||
      !password
    ) {
      throw new Error(
        "Defina E2E_USER_EMAIL e E2E_USER_PASSWORD antes de rodar o teste."
      );
    }

    /*
     * Loga somente o e-mail.
     * Nunca mostramos a senha no terminal.
     */
    console.log(
      `Conta E2E: ${email}`
    );

    await page.goto(
      "/login"
    );

    await expect(
      page
        .getByRole(
          "heading",
          {
            name:
              /Entrar no MyCatalog/i,
          }
        )
    ).toBeVisible();

    await page
      .getByLabel(
        "E-mail"
      )
      .fill(
        email
      );

    await page
      .locator(
        'input[autocomplete="current-password"]'
      )
      .fill(
        password
      );

    const loginButton =
      page.getByRole(
        "button",
        {
          name:
            /^Entrar$/,
        }
      );

    await expect(
      loginButton
    ).toBeEnabled();

    await loginButton.click();

    /*
     * Esperamos uma de duas coisas:
     *
     * 1. sair de /login;
     * 2. aparecer uma mensagem de erro do AuthPage.
     */
    const authError =
      page.locator(
        ".auth-error"
      );

    try {
      await expect(
        page
      ).not.toHaveURL(
        /\/login(?:\?|$)/,
        {
          timeout:
            15_000,
        }
      );
    } catch {
      const errorVisible =
        await authError
          .isVisible()
          .catch(
            () => false
          );

      const errorText =
        errorVisible
          ? await authError
              .innerText()
              .catch(
                () => ""
              )
          : "";

      /*
       * Também captura possíveis erros do browser
       * para facilitar diagnóstico.
       */
      const currentUrl =
        page.url();

      throw new Error(
        [
          "O login E2E não foi concluído.",
          `URL atual: ${currentUrl}`,
          errorText
            ? `Mensagem da tela: ${errorText}`
            : "Nenhuma mensagem .auth-error apareceu.",
          "",
          "Verifique:",
          "1. se E2E_USER_EMAIL está correto;",
          "2. se E2E_USER_PASSWORD está correto;",
          "3. se o e-mail da conta E2E foi confirmado no Supabase;",
          "4. se essa conta realmente usa login por senha.",
        ].join(
          "\n"
        )
      );
    }

    await mkdir(
      "playwright/.auth",
      {
        recursive:
          true,
      }
    );

    await page
      .context()
      .storageState({
        path:
          authFile,
      });

    console.log(
      `Sessão E2E salva em ${authFile}`
    );
  }
);