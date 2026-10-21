export const PASSWORD_HINT = "Use 8 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo.";

export function passwordValidationError(password: string): string | null {
  if (password.length < 8) return PASSWORD_HINT;
  if (!/[A-Z]/.test(password)) return "A senha precisa ter pelo menos uma letra maiúscula.";
  if (!/[a-z]/.test(password)) return "A senha precisa ter pelo menos uma letra minúscula.";
  if (!/[0-9]/.test(password)) return "A senha precisa ter pelo menos um número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "A senha precisa ter pelo menos um símbolo, como !, @ ou #.";
  return null;
}

/**
 * Fase 0 (P1-02): validação da senha no formulário de login/cadastro.
 * A política de força vale para CRIAR senha (cadastro, redefinição). No login
 * a senha só precisa estar preenchida: quem decide se ela está certa é o
 * provedor — senhas antigas, criadas antes da política, continuam entrando.
 */
export function authFormPasswordError(mode: "login" | "signup", password: string): string | null {
  if (mode === "signup") return passwordValidationError(password);
  return password.length === 0 ? "Digite sua senha." : null;
}

/*
 * Fase 1 (P2-02): mensagens do provedor (Neon Auth / Better Auth) em português,
 * pelo CÓDIGO do erro — o texto em inglês do provedor nunca chega à tela.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_PASSWORD: "E-mail ou senha incorretos.",
  USER_NOT_FOUND: "E-mail ou senha incorretos.",
  ACCOUNT_NOT_FOUND: "E-mail ou senha incorretos.",
  INVALID_EMAIL: "Digite um e-mail válido.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Entre ou use outro e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Entre ou use outro e-mail.",
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail antes de entrar.",
  PASSWORD_TOO_SHORT: "A senha é muito curta.",
  PASSWORD_TOO_LONG: "A senha é muito longa.",
  FAILED_TO_CREATE_USER: "Não foi possível criar a conta agora. Tente novamente.",
  // Códigos já normalizados pelo cliente do Neon Auth (AuthError, em minúsculas).
  INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
  EMAIL_EXISTS: "Já existe uma conta com este e-mail. Entre ou use outro e-mail.",
  EMAIL_NOT_CONFIRMED: "Confirme seu e-mail antes de entrar.",
  EMAIL_ADDRESS_INVALID: "Digite um e-mail válido.",
  WEAK_PASSWORD: "Escolha uma senha mais forte.",
  OVER_REQUEST_RATE_LIMIT: "Muitas tentativas em pouco tempo. Aguarde um pouco.",
};

export function authErrorMessage(
  error: { code?: string | null; message?: string | null; status?: number | null } | null | undefined,
  fallback = "Não foi possível continuar. Tente novamente."
): string {
  if (error?.status === 429) return "Muitas tentativas em pouco tempo. Aguarde um pouco.";
  const code = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  return AUTH_ERROR_MESSAGES[code] || fallback;
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
