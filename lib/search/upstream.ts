/*
 * Busca V3.2 — registro das chamadas externas (TMDB) e locais (SQL) de UMA
 * requisição de busca. Vai no cabeçalho `Server-Timing` (nome + duração;
 * nenhuma query, chave ou dado), o que permite medir/auditar a busca fria e
 * quente sem log no servidor. Puro (sem rede): testado em scripts/test-search.mjs.
 */

export type UpstreamCall = { name: string; ms: number; ok: boolean };

export function createUpstreamLog() {
  const calls: UpstreamCall[] = [];

  return {
    calls,
    /** Mede `fn` e registra; falha (exceção) é registrada e repassada. */
    async track<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const started = performance.now();
      let ok = true;

      try {
        return await fn();
      } catch (error) {
        ok = false;
        throw error;
      } finally {
        calls.push({ name, ms: performance.now() - started, ok });
      }
    },
    /** `Server-Timing`: uma entrada por chamada (`u0;desc="tmdb:/search/multi";dur=123.4`). */
    header(total?: number) {
      const parts = calls.map(
        (call, index) => `u${index};desc="${call.name.replace(/[^\w:/.-]/g, "_")}${call.ok ? "" : ":falhou"}";dur=${call.ms.toFixed(1)}`
      );

      if (typeof total === "number") parts.push(`total;dur=${total.toFixed(1)}`);

      return parts.join(", ");
    },
  };
}

export type UpstreamLog = ReturnType<typeof createUpstreamLog>;

/** Interpreta um cabeçalho Server-Timing desta busca (QA/testes). */
export function parseUpstreamHeader(header: string | null | undefined) {
  return String(header || "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^u\d+;/.test(part))
    .map((part) => ({
      name: /desc="([^"]*)"/.exec(part)?.[1] ?? "",
      ms: Number(/dur=([\d.]+)/.exec(part)?.[1] ?? 0),
    }));
}

/** Nome curto e estável de uma consulta SQL (função ou tabela principal) — nunca a query. */
export function sqlCallName(strings: TemplateStringsArray | readonly string[]) {
  const text = strings.join(" ");
  const fn = /(search_v4_[a-z_]+)/.exec(text)?.[1];

  if (fn) return `db:${fn}`;

  const table = /FROM\s+public\.([a-z_]+)/i.exec(text)?.[1];

  return `db:${table ?? "query"}`;
}
