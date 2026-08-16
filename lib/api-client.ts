export class ApiError extends Error {
  status:
    number;

  code?:
    string;

  retryable:
    boolean;

  constructor(
    message:
      string,
    options?: {
      status?:
        number;

      code?:
        string;

      retryable?:
        boolean;
    }
  ) {
    super(
      message
    );

    this.name =
      "ApiError";

    this.status =
      options?.status ??
      0;

    this.code =
      options?.code;

    this.retryable =
      options?.retryable ??
      false;
  }
}

type ApiRequestOptions =
  RequestInit & {
    retries?:
      number;

    retryDelay?:
      number;

    timeout?:
      number;

    /*
     * Use true somente em requests que pertencem
     * claramente a uma página privada.
     */
    redirectOn401?:
      boolean;
  };

function sleep(
  ms:
    number
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function isRetryableStatus(
  status:
    number
) {
  return [
    408,
    425,
    429,
    500,
    502,
    503,
    504,
  ].includes(
    status
  );
}

function friendlyStatusMessage(
  status:
    number,
  fallback?:
    string
) {
  if (
    status ===
    401
  ) {
    return "Sua sessão expirou ou você não está conectado.";
  }

  if (
    status ===
    403
  ) {
    return "Você não tem permissão para fazer isso.";
  }

  if (
    status ===
    404
  ) {
    return (
      fallback ||
      "Não encontramos o que você procurou."
    );
  }

  if (
    status ===
    429
  ) {
    return "Muitas solicitações ao mesmo tempo. Aguarde alguns segundos.";
  }

  if (
    status >=
    500
  ) {
    return "O MyCatalog encontrou um problema temporário. Tente novamente.";
  }

  return (
    fallback ||
    "Não foi possível concluir a solicitação."
  );
}

async function parseResponse(
  response:
    Response
) {
  if (
    response.status ===
    204
  ) {
    return null;
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) ||
    "";

  const text =
    await response.text();

  if (
    !text
  ) {
    return null;
  }

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      return JSON.parse(
        text
      );
    } catch {
      throw new ApiError(
        "O servidor devolveu uma resposta inválida.",
        {
          status:
            response.status,

          code:
            "INVALID_JSON",

          retryable:
            response.status >=
            500,
        }
      );
    }
  }

  if (
    text
      .trimStart()
      .startsWith(
        "<"
      )
  ) {
    throw new ApiError(
      "O servidor respondeu com uma página de erro em vez dos dados esperados.",
      {
        status:
          response.status ||
          500,

        code:
          "HTML_RESPONSE",

        retryable:
          true,
      }
    );
  }

  return text;
}

function redirectToLogin() {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  const current =
    `${window.location.pathname}${window.location.search}`;

  const params =
    new URLSearchParams({
      reason:
        "session",

      next:
        current,
    });

  window.location.href =
    `/login?${params.toString()}`;
}

export async function apiFetch<
  T = any
>(
  input:
    RequestInfo |
    URL,
  options:
    ApiRequestOptions = {}
): Promise<T> {
  const {
    retries =
      (
        !options.method ||
        options.method ===
          "GET"
      )
        ? 1
        : 0,

    retryDelay =
      450,

    timeout =
      15000,

    redirectOn401 =
      false,

    ...fetchOptions
  } =
    options;

  let attempt =
    0;

  while (
    true
  ) {
    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(
        () =>
          controller.abort(),
        timeout
      );

    try {
      const response =
        await fetch(
          input,
          {
            ...fetchOptions,

            signal:
              controller.signal,
          }
        );

      const data =
        await parseResponse(
          response
        );

      if (
        !response.ok
      ) {
        const serverMessage =
          data &&
          typeof data ===
            "object" &&
          "error" in data &&
          typeof data.error ===
            "string"
            ? data.error
            : null;

        if (
          response.status ===
            401 &&
          redirectOn401
        ) {
          redirectToLogin();
        }

        const retryable =
          isRetryableStatus(
            response.status
          );

        if (
          retryable &&
          attempt <
            retries
        ) {
          attempt++;

          await sleep(
            retryDelay *
              attempt
          );

          continue;
        }

        throw new ApiError(
          friendlyStatusMessage(
            response.status,
            serverMessage ||
              undefined
          ),
          {
            status:
              response.status,

            retryable,
          }
        );
      }

      return data as
        T;
    } catch (
      error
    ) {
      if (
        error instanceof
        ApiError
      ) {
        throw error;
      }

      const aborted =
        error instanceof
          DOMException &&
        error.name ===
          "AbortError";

      if (
        attempt <
        retries
      ) {
        attempt++;

        await sleep(
          retryDelay *
            attempt
        );

        continue;
      }

      throw new ApiError(
        aborted
          ? "A solicitação demorou demais. Tente novamente."
          : "Não foi possível se conectar ao servidor.",
        {
          code:
            aborted
              ? "TIMEOUT"
              : "NETWORK_ERROR",

          retryable:
            true,
        }
      );
    } finally {
      clearTimeout(
        timeoutId
      );
    }
  }
}

export function errorMessage(
  error:
    unknown,
  fallback =
    "Algo deu errado."
) {
  if (
    error instanceof
    ApiError
  ) {
    return error.message;
  }

  if (
    error instanceof
    Error &&
    error.message
  ) {
    return error.message;
  }

  return fallback;
}