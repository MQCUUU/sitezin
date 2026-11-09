import {
  APIRequestContext,
  expect,
  type Page,
} from "@playwright/test";

export async function jsonRequest<
  T = any
>(
  request:
    APIRequestContext,
  method:
    "GET" |
    "POST" |
    "PATCH" |
    "DELETE",
  url:
    string,
  data?:
    unknown
): Promise<T> {
  const response =
    await request.fetch(
      url,
      {
        method,

        data,

        headers:
          data ===
          undefined
            ? undefined
            : {
                "Content-Type":
                  "application/json",
              },
      }
    );

  const type =
    response.headers()[
      "content-type"
    ] ||
    "";

  expect(
    type,
    `Esperava JSON de ${method} ${url}`
  ).toContain(
    "application/json"
  );

  const body =
    await response.json();

  expect(
    response.ok(),
    `${method} ${url}: ${JSON.stringify(
      body
    )}`
  ).toBeTruthy();

  return body as
    T;
}

export async function deleteIgnoring404(
  request:
    APIRequestContext,
  url:
    string
) {
  const response =
    await request.delete(
      url
    );

  expect(
    [
      200,
      204,
      404,
    ]
  ).toContain(
    response.status()
  );
}
/*
 * Fase 4 — status na página do Título: o <select> virou a ação principal
 * (botão claro que abre um menu). Estes helpers usam a versão de computador
 * (.tt-actions); no celular a mesma escolha abre numa folha.
 */
export const STATUS_LABEL: Record<string, string> = {
  want: "Quero assistir",
  watching: "Assistindo",
  watched: "Assistido",
  rewatching: "Reassistindo",
  rewatched: "Reassistido",
  paused: "Pausado",
  dropped: "Abandonado",
};

export function titleStatusButton(page: Page) {
  return page.locator(".tt-actions .tt-primary");
}

export async function chooseTitleStatus(page: Page, status: keyof typeof STATUS_LABEL | string) {
  await titleStatusButton(page).click();
  await page.getByRole("menuitemradio", { name: STATUS_LABEL[status], exact: true }).click();
}

/** Status mostrado no botão principal; "none" = fora da biblioteca. */
export async function expectTitleStatus(page: Page, status: string | "none") {
  await expect(titleStatusButton(page)).toHaveText(status === "none" ? /Adicionar à biblioteca/ : STATUS_LABEL[status]);
}
