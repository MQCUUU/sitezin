/*
 * Fase 6 — roda uma vez quando o servidor sobe. Avisa ALTO (no log do servidor) se a
 * configuração essencial estiver faltando ou misturada (ex.: Auth de um ambiente,
 * banco de outro). Não derruba o servidor: um falso positivo aqui não pode virar
 * indisponibilidade. Nunca imprime valores — só nomes e o diagnóstico.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkEnv } = await import("./lib/env-check");
  for (const issue of checkEnv(process.env)) {
    const line = `[config] ${issue.message}`;
    if (issue.level === "error") console.error(line);
    else console.warn(line);
  }
}
