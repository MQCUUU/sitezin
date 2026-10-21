/*
 * Fase 1 — destino de retorno depois do login (`?next=`), validado no cliente
 * com as MESMAS regras do proxy.ts: só caminhos internos. Bloqueia esquemas
 * externos, "//", barras invertidas ("/\evil.com" vira "//evil.com" no
 * navegador) e caracteres de controle. Telas de login/cadastro nunca são
 * destino (evita voltar para o próprio formulário).
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return fallback;
  }

  let path: string;
  try {
    const target = new URL(decoded, "https://mycatalog.local");
    if (target.origin !== "https://mycatalog.local") return fallback;
    path = `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }

  if (/^\/(login|signup)(\/|\?|#|$)/.test(path)) return fallback;

  return path;
}
