/*
 * Fonte única da regra de username (E1).
 *
 * Antes, a mesma regra (`^[a-z0-9_]{3,24}$`, minúsculo, 3-24 chars,
 * a-z0-9_) estava reimplementada em 3 lugares: o trigger SQL
 * `handle_new_user_profile()`, `app/api/profile/username/route.ts` e
 * `app/api/auth/profile/route.ts`. O trigger continua sendo a última
 * linha de defesa no banco (não dá para importar TS lá), mas os dois
 * endpoints agora importam daqui.
 */

export const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;

export const USERNAME_RULE_MESSAGE = "Use de 3 a 24 letras, números ou _.";

/** minúsculo + trim — mesma normalização usada nas comparações de unicidade (`lower(username)`). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_REGEX.test(raw);
}
