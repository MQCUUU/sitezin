/*
 * Cliente HTTP padrão do MyCatalog (Fase 6 — P2-11).
 *
 * Caminho único para chamar /api a partir do navegador. Garante:
 *  - JSON serializado (`json`) e resposta validada (HTML/JSON quebrado viram
 *    erro, nunca dados);
 *  - timeout, retry curto só em GET e só em erro transitório;
 *  - AbortSignal de quem chama respeitado (abort NÃO vira erro de rede nem
 *    retry: é relançado como AbortError);
 *  - todo erro sai como ApiError com um `code` estável — componentes decidem
 *    pelo código, não por texto ou número solto;
 *  - nunca devolve `null` silencioso para erro: quem quiser ignorar um erro
 *    precisa fazê-lo explicitamente no catch.
 */

export type ApiErrorCode =
  | "UNAUTHENTICATED" // 401 — precisa entrar (de novo)
  | "FORBIDDEN" // 403
  | "NOT_FOUND" // 404
  | "VALIDATION_ERROR" // 400 / 413 / 415 / 422 — pedido inválido
  | "CONFLICT" // 409
  | "RATE_LIMITED" // 429
  | "SERVER_ERROR" // 5xx
  | "NETWORK_ERROR" // não chegou ao servidor
  | "TIMEOUT" // passou do tempo limite
  | "INVALID_RESPONSE" // resposta que não é o JSON esperado
  | "HTTP_ERROR"; // outro status inesperado

export function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400 || status === 413 || status === 415 || status === 422) return "VALIDATION_ERROR";
  if (status >= 500) return "SERVER_ERROR";
  return "HTTP_ERROR";
}

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  retryable: boolean;

  constructor(message: string, options?: { status?: number; code?: ApiErrorCode; retryable?: boolean }) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status ?? 0;
    this.code = options?.code ?? codeForStatus(this.status);
    this.retryable = options?.retryable ?? false;
  }
}

/** `isApiError(e, "UNAUTHENTICATED")` — o erro é desse(s) tipo(s)? */
export function isApiError(error: unknown, ...codes: ApiErrorCode[]): error is ApiError {
  return error instanceof ApiError && (codes.length === 0 || codes.includes(error.code));
}

/** Abort pedido por quem chamou (troca de filtro, componente desmontado…) — não é erro para o usuário. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string })?.name === "AbortError";
}

type ApiRequestOptions = RequestInit & {
  /** Corpo JSON: serializado e com Content-Type definido. */
  json?: unknown;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  /** Use true somente em requests que pertencem claramente a uma página privada. */
  redirectOn401?: boolean;
};

const RETRYABLE = [408, 425, 429, 500, 502, 503, 504];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyStatusMessage(status: number, serverMessage?: string) {
  if (status === 401) return "Sua sessão expirou ou você não está conectado.";
  if (status === 403) return "Você não tem permissão para fazer isso.";
  if (status === 404) return serverMessage || "Não encontramos o que você procurou.";
  // 429: a frase do servidor diz o limite certo (ex.: "20 perguntas em 10 minutos" no assistente).
  if (status === 429) return serverMessage || "Muitas solicitações em pouco tempo. Aguarde alguns segundos e tente novamente.";
  if (status >= 500) return "O MyCatalog encontrou um problema temporário. Tente novamente.";
  // 400/409/422…: o servidor manda frases em português pensadas para o usuário.
  return serverMessage || "Não foi possível concluir a solicitação.";
}

async function parseResponse(response: Response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text) return null;

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError("O servidor devolveu uma resposta inválida.", {
        status: response.status,
        code: "INVALID_RESPONSE",
        retryable: response.status >= 500,
      });
    }
  }

  if (text.trimStart().startsWith("<")) {
    throw new ApiError("O servidor respondeu com uma página de erro em vez dos dados esperados.", {
      status: response.status || 500,
      code: "INVALID_RESPONSE",
      retryable: true,
    });
  }

  return text;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams({ reason: "session", next: `${window.location.pathname}${window.location.search}` });
  window.location.href = `/login?${params.toString()}`;
}

export async function apiFetch<T = any>(input: RequestInfo | URL, options: ApiRequestOptions = {}): Promise<T> {
  const {
    json,
    retries = !options.method || options.method === "GET" ? 1 : 0,
    retryDelay = 450,
    timeout = 15000,
    redirectOn401 = false,
    signal: callerSignal,
    ...fetchOptions
  } = options;

  if (json !== undefined) {
    fetchOptions.body = JSON.stringify(json);
    fetchOptions.headers = { "Content-Type": "application/json", ...(fetchOptions.headers as Record<string, string>) };
  }

  let attempt = 0;

  while (true) {
    if (callerSignal?.aborted) throw callerSignal.reason ?? new DOMException("Aborted", "AbortError");

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const forwardAbort = () => controller.abort();
    callerSignal?.addEventListener("abort", forwardAbort, { once: true });

    try {
      const response = await fetch(input, { ...fetchOptions, signal: controller.signal });
      const data = await parseResponse(response);

      if (!response.ok) {
        const serverMessage =
          data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : undefined;

        if (response.status === 401 && redirectOn401) redirectToLogin();

        const retryable = RETRYABLE.includes(response.status);
        if (retryable && attempt < retries) {
          attempt++;
          await sleep(retryDelay * attempt);
          continue;
        }

        throw new ApiError(friendlyStatusMessage(response.status, serverMessage), { status: response.status, retryable });
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Abort de quem chamou: devolve o próprio AbortError (sem retry, sem "erro de rede").
      if (callerSignal?.aborted && !timedOut) throw error;

      if (attempt < retries) {
        attempt++;
        await sleep(retryDelay * attempt);
        continue;
      }

      throw new ApiError(
        timedOut ? "A solicitação demorou demais. Tente novamente." : "Não foi possível se conectar ao servidor.",
        { code: timedOut ? "TIMEOUT" : "NETWORK_ERROR", retryable: true }
      );
    } finally {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", forwardAbort);
    }
  }
}

/**
 * Para respostas que não são JSON no sucesso (download de arquivo): converte uma
 * resposta de ERRO no mesmo ApiError do apiFetch (código + frase amigável).
 */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  let serverMessage: string | undefined;
  try {
    const data = await response.clone().json();
    if (data && typeof data.error === "string") serverMessage = data.error;
  } catch {
    // corpo não-JSON (página de erro da plataforma): fica a frase padrão do status
  }
  return new ApiError(friendlyStatusMessage(response.status, serverMessage), {
    status: response.status,
    retryable: RETRYABLE.includes(response.status),
  });
}

export function errorMessage(error: unknown, fallback = "Algo deu errado.") {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
