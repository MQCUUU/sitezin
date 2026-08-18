export const PASSWORD_HINT = "Use 8 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo.";

export function passwordValidationError(password: string): string | null {
  if (password.length < 8) return PASSWORD_HINT;
  if (!/[A-Z]/.test(password)) return "A senha precisa ter pelo menos uma letra maiúscula.";
  if (!/[a-z]/.test(password)) return "A senha precisa ter pelo menos uma letra minúscula.";
  if (!/[0-9]/.test(password)) return "A senha precisa ter pelo menos um número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "A senha precisa ter pelo menos um símbolo, como !, @ ou #.";
  return null;
}

export function authRedirectOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      const configuredIsLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
      const browserIsLocal = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
      if (!configuredIsLocal || browserIsLocal) return url.origin;
    } catch { /* Usa a origem atual quando a variável estiver inválida. */ }
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}
