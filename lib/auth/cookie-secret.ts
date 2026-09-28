/**
 * Fonte única do segredo usado para validar/assinar o cookie de sessão do
 * Neon Auth (`proxy.ts` no fast-path do middleware, `lib/auth/server.ts` no
 * SDK server-side). Não existe fallback: se a env var estiver ausente, a
 * aplicação falha explicitamente em vez de cair para um valor conhecido.
 */
export function getAuthCookieSecret(): string {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "[Auth Error] A variável de ambiente NEON_AUTH_COOKIE_SECRET não foi " +
      "configurada. Ela é obrigatória para validar a assinatura do cookie " +
      "de sessão do Neon Auth — não existe fallback, por segurança. " +
      "Configure-a no ambiente (.env.local em desenvolvimento, variáveis " +
      "de ambiente do projeto na Vercel em produção)."
    );
  }

  return secret.length >= 32 ? secret : secret.padEnd(32, "0");
}
