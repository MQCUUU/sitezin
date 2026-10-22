/*
 * Rotas privadas do MyCatalog — fonte única (Fase 7).
 *
 * Antes a mesma lista vivia copiada em proxy.ts, components/SessionSync.tsx e
 * app/robots.ts, com risco de divergir. Quem usa:
 *   - proxy.ts: manda para o login quem não tem sessão;
 *   - SessionSync: sai da página privada quando a sessão acaba em outra aba;
 *   - robots.ts: tira essas páginas dos buscadores.
 *
 * "/lists" é privada só na correspondência EXATA (a tela "Minhas listas"):
 * "/lists/[id]" é a lista pública individual e não pode cair na regra de prefixo.
 */
export const PRIVATE_ROUTES = [
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
  "/insights",
] as const;

export const PRIVATE_EXACT_ROUTES = ["/lists"] as const;

export function pathMatches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isPrivatePath(pathname: string): boolean {
  return (
    PRIVATE_ROUTES.some((route) => pathMatches(pathname, route)) ||
    PRIVATE_EXACT_ROUTES.some((route) => pathname === route)
  );
}
