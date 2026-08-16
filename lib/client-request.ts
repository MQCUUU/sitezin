"use client";

import {
  ApiError,
} from "@/lib/api-client";

/*
 * ==========================================
 * CLIENT REQUEST MANAGER
 * ==========================================
 *
 * Resolve 3 problemas:
 *
 * 1. usuário troca filtros rapidamente;
 * 2. dois componentes pedem a mesma URL juntos;
 * 3. voltar para um filtro recém-visto refaz request.
 *
 * Cache é SOMENTE em memória do navegador e curto.
 * Nunca usar para dados sensíveis sem user-specific key.
 */

type CacheEntry = {
  expiresAt:
    number;

  value:
    any;
};

const memoryCache =
  new Map<
    string,
    CacheEntry
  >();

const pending =
  new Map<
    string,
    Promise<any>
  >();

const controllers =
  new Map<
    string,
    AbortController
  >();

function now() {
  return Date.now();
}

function cacheKey(
  url: string,
  init?: RequestInit
) {
  return [
    init?.method ||
      "GET",
    url,
  ].join(
    ":"
  );
}

async function parse(
  response:
    Response
) {
  const type =
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
    !type.includes(
      "application/json"
    )
  ) {
    throw new ApiError(
      "O servidor retornou uma resposta inválida.",
      {
        status:
          response.status,

        code:
          "INVALID_RESPONSE",
      }
    );
  }

  try {
    return JSON.parse(
      text
    );
  } catch {
    throw new ApiError(
      "O servidor retornou JSON inválido.",
      {
        status:
          response.status,

        code:
          "INVALID_JSON",
      }
    );
  }
}

export async function cachedClientFetch<
  T = any
>(
  url:
    string,
  options?: {
    init?:
      RequestInit;

    /*
     * Cache curto do navegador.
     * 0 = desativado.
     */
    ttl?:
      number;

    /*
     * Requests com o mesmo scope cancelam a anterior.
     * Ex.: "discover-results".
     */
    latestScope?:
      string;

    /*
     * Se true, requests idênticas simultâneas
     * compartilham a mesma Promise.
     */
    dedupe?:
      boolean;
  }
): Promise<T> {
  const init =
    options?.init;

  const method =
    (
      init?.method ||
      "GET"
    ).toUpperCase();

  const canCache =
    method ===
    "GET";

  const key =
    cacheKey(
      url,
      init
    );

  const ttl =
    Math.max(
      0,
      options?.ttl ??
        0
    );

  if (
    canCache &&
    ttl >
      0
  ) {
    const cached =
      memoryCache.get(
        key
      );

    if (
      cached &&
      cached.expiresAt >
        now()
    ) {
      return cached.value as
        T;
    }

    if (cached) {
      memoryCache.delete(
        key
      );
    }
  }

  if (
    canCache &&
    options?.dedupe !==
      false
  ) {
    const active =
      pending.get(
        key
      );

    if (active) {
      return active as
        Promise<T>;
    }
  }

  let controller:
    AbortController |
    null =
      null;

  if (
    options?.latestScope
  ) {
    /*
     * Cancela a request anterior daquele grupo.
     *
     * Ex.: gênero Drama -> Comédia em 100ms:
     * a request de Drama não precisa terminar.
     */
    controllers
      .get(
        options.latestScope
      )
      ?.abort();

    controller =
      new AbortController();

    controllers.set(
      options.latestScope,
      controller
    );
  }

  const task =
    (async () => {
      const response =
        await fetch(
          url,
          {
            ...init,

            signal:
              controller?.signal ??
              init?.signal,
          }
        );

      const data =
        await parse(
          response
        );

      if (
        !response.ok
      ) {
        throw new ApiError(
          data?.error ||
            `Erro ${response.status}`,
          {
            status:
              response.status,
          }
        );
      }

      if (
        canCache &&
        ttl >
          0
      ) {
        memoryCache.set(
          key,
          {
            value:
              data,

            expiresAt:
              now() +
              ttl,
          }
        );
      }

      return data as
        T;
    })();

  if (
    canCache &&
    options?.dedupe !==
      false
  ) {
    pending.set(
      key,
      task
    );
  }

  try {
    return await task;
  } finally {
    if (
      pending.get(
        key
      ) === task
    ) {
      pending.delete(
        key
      );
    }

    if (
      options?.latestScope &&
      controllers.get(
        options.latestScope
      ) === controller
    ) {
      controllers.delete(
        options.latestScope
      );
    }
  }
}

export function clearClientRequestCache(
  prefix?:
    string
) {
  if (!prefix) {
    memoryCache.clear();
    return;
  }

  for (
    const key
    of memoryCache.keys()
  ) {
    if (
      key.includes(
        prefix
      )
    ) {
      memoryCache.delete(
        key
      );
    }
  }
}

export function abortClientRequest(
  scope:
    string
) {
  controllers
    .get(
      scope
    )
    ?.abort();

  controllers.delete(
    scope
  );
}