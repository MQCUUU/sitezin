import {
  defineConfig,
  devices,
} from "@playwright/test";

export default defineConfig({
  testDir:
    "./tests",

  fullyParallel:
    false,

  /*
   * Os testes usam a mesma conta E2E
   * e alteram biblioteca/status/nota.
   *
   * Por isso deixamos 1 worker para
   * evitar um teste interferir no outro.
   */
  workers:
    1,

  /*
   * No computador local:
   * 0 retries
   *
   * Em CI:
   * tenta novamente até 2 vezes.
   */
  retries:
    process.env.CI
      ? 2
      : 0,

  reporter: [
    [
      "list",
    ],

    [
      "html",
      {
        outputFolder:
          "playwright-report",

        open:
          "never",
      },
    ],
  ],

  use: {
    /*
     * IMPORTANTE:
     *
     * Usamos localhost e NÃO 127.0.0.1.
     *
     * Isso evita o erro do Next:
     *
     * Blocked cross-origin request
     * to Next.js dev resource
     */
    baseURL:
      process.env
        .PLAYWRIGHT_BASE_URL ||
      "http://localhost:3000",

    /*
     * Guarda trace quando o teste falhar.
     *
     * Depois você consegue abrir com:
     *
     * npx playwright show-trace ...
     */
    trace:
      "retain-on-failure",

    /*
     * Screenshot somente quando falha.
     */
    screenshot:
      "only-on-failure",

    /*
     * Vídeo somente quando falha.
     */
    video:
      "retain-on-failure",

    /*
     * Tempo máximo padrão para ações
     * como click/fill/etc.
     */
    actionTimeout:
      10_000,

    /*
     * Tempo máximo para navegação.
     */
    navigationTimeout:
      20_000,
  },

  expect: {
    /*
     * Dá um pouco mais de tempo para
     * Supabase + Next completarem login.
     */
    timeout:
      10_000,
  },

  projects: [
    /*
     * =====================================
     * SETUP DE AUTENTICAÇÃO
     * =====================================
     *
     * Faz login uma vez e salva:
     *
     * playwright/.auth/user.json
     */
    {
      name:
        "setup",

      testMatch:
        /auth\.setup\.ts/,
    },

    /*
     * =====================================
     * TESTES AUTENTICADOS
     * =====================================
     */
    {
      name:
        "chromium",

      use: {
        ...devices[
          "Desktop Chrome"
        ],

        /*
         * Usa a sessão criada pelo setup.
         */
        storageState:
          "playwright/.auth/user.json",
      },

      /*
       * Só roda depois que o login
       * do projeto setup funcionar.
       */
      dependencies: [
        "setup",
      ],

      /*
       * Cadastro precisa estar deslogado,
       * então ele não entra neste projeto.
       */
      testIgnore:
        /signup\.spec\.ts/,
    },

    /*
     * =====================================
     * CADASTRO
     * =====================================
     *
     * Começa sempre com browser limpo.
     */
    {
      name:
        "signup",

      use: {
        ...devices[
          "Desktop Chrome"
        ],

        storageState: {
          cookies:
            [],

          origins:
            [],
        },
      },

      testMatch:
        /signup\.spec\.ts/,
    },
  ],

  /*
   * =====================================
   * SERVIDOR NEXT
   * =====================================
   *
   * O Playwright liga o Next automaticamente
   * caso ele ainda não esteja rodando.
   */
  webServer: {
    command:
      "npm run dev",

    url:
      process.env
        .PLAYWRIGHT_BASE_URL ||
      "http://localhost:3000",

    /*
     * Se você já estiver com npm run dev
     * aberto, ele reutiliza.
     */
    reuseExistingServer:
      !process.env.CI,

    timeout:
      120_000,

    /*
     * Ajuda a deixar o servidor de teste
     * explicitamente em localhost.
     */
    env: {
      ...process.env,

      HOSTNAME:
        "localhost",
    },
  },
});