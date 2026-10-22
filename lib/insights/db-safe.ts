/**
 * Esquema ainda não migrado: 42P01 = tabela inexistente, 42703 = coluna
 * inexistente (db/legacy/supabase/v2.3-insights.sql ainda não aplicado).
 */
export function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;

  return (
    e?.code === "42P01" ||
    e?.code === "42703" ||
    /relation .* does not exist|column .* does not exist/i.test(String(e?.message || ""))
  );
}

/** Executa uma consulta opcional: sem a tabela/coluna, devolve `fallback`. */
export async function optional<T>(run: () => Promise<T>, fallback: T): Promise<{ value: T; available: boolean }> {
  try {
    return { value: await run(), available: true };
  } catch (error) {
    if (isMissingTable(error)) return { value: fallback, available: false };
    throw error;
  }
}
