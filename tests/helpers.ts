import {
  APIRequestContext,
  expect,
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