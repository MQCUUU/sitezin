/** A verificação de e-mail é opcional somente no servidor local de desenvolvimento. */
export function isLocalDevelopmentHost(hostname: string | null | undefined): boolean {
  if (process.env.NODE_ENV === "production" || !hostname) return false;

  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized === "::1";
}

export function hostnameFromHeader(hostHeader: string | null): string {
  const host = hostHeader?.split(",", 1)[0]?.trim().toLowerCase() || "";
  if (host.startsWith("[")) {
    const closingBracket = host.indexOf("]");
    return closingBracket > 0 ? host.slice(1, closingBracket) : "";
  }
  return host.split(":", 1)[0];
}
