/**
 * Fonte única para aplicar troca de username com a regra de cooldown
 * (2 trocas / 30 dias, auditada em `public.username_changes`). Consolidada
 * na I1 porque `POST /api/auth/profile` trocava `username` diretamente,
 * sem checar o cooldown que `POST /api/profile/username` já aplicava —
 * um usuário autenticado podia chamar `auth/profile` para burlar o limite.
 */
export type UsernameChangeResult =
  | { ok: true; username: string }
  | { ok: false; status: number; error: string };

export async function applyUsernameChange(
  sql: any,
  userId: string,
  newUsername: string,
  currentUsername: string | null
): Promise<UsernameChangeResult> {
  if (!currentUsername || currentUsername === newUsername) {
    const updated = await sql`
      UPDATE public.profiles
      SET username = ${newUsername}
      WHERE id = ${userId}
      RETURNING username
    `;
    return { ok: true, username: updated[0]?.username ?? newUsername };
  }

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const changesCountRes = await sql`
    SELECT count(*)::int as count
    FROM public.username_changes
    WHERE user_id = ${userId} AND changed_at >= ${thirtyDaysAgo}
  `;

  if (Number(changesCountRes[0]?.count || 0) >= 2) {
    return {
      ok: false,
      status: 429,
      error: "Você já usou as 2 trocas de @ dos últimos 30 dias.",
    };
  }

  await sql.transaction([
    sql`
      UPDATE public.profiles
      SET username = ${newUsername}
      WHERE id = ${userId}
    `,
    sql`
      INSERT INTO public.username_changes (user_id, old_username, new_username, changed_at)
      VALUES (${userId}, ${currentUsername}, ${newUsername}, now())
    `,
  ]);

  return { ok: true, username: newUsername };
}
