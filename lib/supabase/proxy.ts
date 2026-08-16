import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

/*
 * ==========================================
 * ROTAS PRIVADAS DO MYCATALOG
 * ==========================================
 *
 * Essas páginas não devem renderizar sem
 * uma sessão Supabase válida.
 */

const PRIVATE_ROUTES = [
  "/library",
  "/for-you",
  "/assistant",
  "/diary",
  "/calendar",
  "/ranking",
  "/stats",
  "/retrospective",
  "/favorites",
  "/profile",
  "/settings",
] as const;

/*
 * Rotas de autenticação que não fazem sentido
 * para quem já está logado.
 */
const GUEST_ONLY_ROUTES = [
  "/login",
  "/signup",
] as const;

function pathMatches(
  pathname:
    string,
  route:
    string
) {
  return (
    pathname ===
      route ||
    pathname.startsWith(
      `${route}/`
    )
  );
}

function isPrivatePage(
  pathname:
    string
) {
  return PRIVATE_ROUTES.some(
    (
      route
    ) =>
      pathMatches(
        pathname,
        route
      )
  );
}

function isGuestOnlyPage(
  pathname:
    string
) {
  return GUEST_ONLY_ROUTES.some(
    (
      route
    ) =>
      pathMatches(
        pathname,
        route
      )
  );
}

function isApi(
  pathname:
    string
) {
  return pathname.startsWith(
    "/api/"
  );
}

function safeNextPath(
  raw: string | null
) {
  if (!raw) {
    return null;
  }

  let decoded: string;

  try {
    decoded =
      decodeURIComponent(
        raw
      );
  } catch {
    return null;
  }

  /*
   * Aceita somente caminhos internos.
   *
   * Bloqueia:
   * - https://dominio.com
   * - //dominio.com
   * - /\dominio.com
   * - barras invertidas
   * - caracteres de controle
   */
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.startsWith("/\\") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(
      decoded
    )
  ) {
    return null;
  }

  try {
    const target =
      new URL(
        decoded,
        "https://mycatalog.local"
      );

    if (
      target.origin !==
      "https://mycatalog.local"
    ) {
      return null;
    }

    return (
      `${target.pathname}` +
      `${target.search}` +
      `${target.hash}`
    );
  } catch {
    return null;
  }
}

export async function updateSession(
  request:
    NextRequest
) {
  /*
   * IMPORTANTE:
   * Essa response pode ser recriada quando o
   * Supabase atualizar cookies.
   */
  let response =
    NextResponse.next({
      request,
    });

  const supabase =
    createServerClient(
      process.env
        .NEXT_PUBLIC_SUPABASE_URL!,
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env
          .NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(
            cookiesToSet
          ) {
            /*
             * 1. Atualiza os cookies que os Server
             *    Components verão nesta request.
             */
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value
                );
              }
            );

            /*
             * 2. Recria a response usando a request
             *    já atualizada.
             */
            response =
              NextResponse.next({
                request,
              });

            /*
             * 3. Envia os cookies renovados de volta
             *    ao navegador.
             */
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,
                  options
                );
              }
            );
          },
        },
      }
    );

  /*
   * Não coloque lógica entre createServerClient()
   * e getClaims(). O refresh precisa ocorrer o
   * mais cedo possível para evitar sessão
   * inconsistente.
   *
   * getClaims() valida o JWT, diferente de confiar
   * apenas no conteúdo local de getSession().
   */
  let claims:
    Record<
      string,
      any
    > |
    null =
      null;

  try {
    const {
      data,
      error,
    } =
      await supabase.auth
        .getClaims();

    if (
      !error &&
      data?.claims
    ) {
      claims =
        data.claims as
          Record<
            string,
            any
          >;
    }
  } catch {
    claims =
      null;
  }

  const pathname =
    request.nextUrl.pathname;

  const authenticated =
    Boolean(
      claims?.sub
    );

  /*
   * ==========================================
   * API
   * ==========================================
   *
   * NUNCA redirecionamos /api para HTML.
   *
   * A própria route handler continua responsável
   * por retornar JSON 401 quando necessário.
   *
   * O Proxy aqui serve apenas para renovar cookies.
   */
  if (
    isApi(
      pathname
    )
  ) {
    return response;
  }

  /*
   * ==========================================
   * PÁGINA PRIVADA SEM SESSÃO
   * ==========================================
   */

  if (
    isPrivatePage(
      pathname
    ) &&
    !authenticated
  ) {
    const loginUrl =
      request.nextUrl.clone();

    loginUrl.pathname =
      "/login";

    loginUrl.search =
      "";

    loginUrl.searchParams.set(
      "reason",
      "session"
    );

    /*
     * Depois do login, volta exatamente para a
     * página que a pessoa estava tentando abrir.
     */
    const destination =
      `${pathname}${request.nextUrl.search}`;

    loginUrl.searchParams.set(
      "next",
      destination
    );

    const redirect =
      NextResponse.redirect(
        loginUrl
      );

    /*
     * Se getClaims() renovou/limpou algum cookie,
     * preservamos isso também no redirect.
     */
    response.cookies
      .getAll()
      .forEach(
        (
          cookie
        ) => {
          redirect.cookies.set(
            cookie
          );
        }
      );

    return redirect;
  }

  /*
   * ==========================================
   * LOGIN/CADASTRO JÁ AUTENTICADO
   * ==========================================
   */

  if (
    authenticated &&
    isGuestOnlyPage(
      pathname
    )
  ) {
    const home =
      request.nextUrl.clone();

    const requestedNext =
  safeNextPath(
    request.nextUrl
      .searchParams.get(
        "next"
      )
  );

    if (
  requestedNext
) {
      /*
       * pathname + query do destino original.
       */
      const target =
        new URL(
          requestedNext,
          request.url
        );

      home.pathname =
        target.pathname;

      home.search =
        target.search;
    } else {
      home.pathname =
        "/";

      home.search =
        "";
    }

    const redirect =
      NextResponse.redirect(
        home
      );

    response.cookies
      .getAll()
      .forEach(
        (
          cookie
        ) => {
          redirect.cookies.set(
            cookie
          );
        }
      );

    return redirect;
  }

  return response;
}