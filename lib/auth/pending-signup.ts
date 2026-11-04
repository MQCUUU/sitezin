const STORAGE_KEY = "mycatalog.pending-signup.v1";
const VERIFICATION_ERROR_KEY = "mycatalog.pending-verification-error";

export type PendingSignup = {
  email: string;
  name: string;
  username: string;
  next: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function savePendingSignup(value: PendingSignup): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, email: normalizeEmail(value.email) }));
  } catch { /* O endereço ainda pode ser informado manualmente na tela. */ }
}

export function readPendingSignup(email?: string | null): PendingSignup | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<PendingSignup>;
    if (typeof value.email !== "string" || typeof value.name !== "string" || typeof value.username !== "string") return null;
    if (email && normalizeEmail(value.email) !== normalizeEmail(email)) return null;
    return {
      email: normalizeEmail(value.email),
      name: value.name,
      username: value.username,
      next: typeof value.next === "string" && value.next.startsWith("/") && !value.next.startsWith("//") ? value.next : "/",
    };
  } catch {
    return null;
  }
}

export function clearPendingSignup(): void {
  try { if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY); } catch { /* Ignora armazenamento indisponível. */ }
}

export function savePendingVerificationEmail(email: string): void {
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("mycatalog.pending-verification-email", normalizeEmail(email));
      window.sessionStorage.setItem("mycatalog.email-verification-resend-at", String(Date.now() + 60_000));
    }
  } catch { /* A página oferece campo para informar o endereço. */ }
}

export function readPendingVerificationEmail(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem("mycatalog.pending-verification-email"); } catch { return null; }
}

export function clearPendingVerificationEmail(): void {
  try { if (typeof window !== "undefined") window.sessionStorage.removeItem("mycatalog.pending-verification-email"); } catch { /* Ignora armazenamento indisponível. */ }
}

export function savePendingVerificationError(message: string): void {
  try { if (typeof window !== "undefined") window.sessionStorage.setItem(VERIFICATION_ERROR_KEY, message); } catch { /* A tela mantém as opções de reenvio. */ }
}

export function readPendingVerificationError(): string | null {
  try { return typeof window !== "undefined" ? window.sessionStorage.getItem(VERIFICATION_ERROR_KEY) : null; } catch { return null; }
}

export function clearPendingVerificationError(): void {
  try { if (typeof window !== "undefined") window.sessionStorage.removeItem(VERIFICATION_ERROR_KEY); } catch { /* Ignora armazenamento indisponível. */ }
}
