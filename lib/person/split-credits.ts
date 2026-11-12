/*
 * Separa a filmografia de uma pessoa nas abas da página: Atuação, Direção e
 * Outros trabalhos. Os créditos chegam mesclados por título (lib/person/credits.ts):
 * `roles` junta todas as funções e `credit_kind` fica com a do primeiro crédito
 * (atuação vence), por isso a direção é lida em `roles`, não em `credit_kind`.
 */

type SplittableCredit = { credit_kind?: unknown; character?: unknown; roles?: unknown; job?: unknown };

const DIRECTOR = "Director";

function rolesOf(credit: SplittableCredit): string[] {
  return Array.isArray(credit.roles) ? credit.roles.filter((role): role is string => typeof role === "string") : [];
}

export function isDirecting(credit: SplittableCredit): boolean {
  const roles = rolesOf(credit);
  return roles.includes(DIRECTOR) || credit.job === DIRECTOR;
}

function isOtherWork(credit: SplittableCredit): boolean {
  if (credit.credit_kind !== "crew" || credit.character) return false;
  const roles = rolesOf(credit);
  if (roles.length) return roles.some((role) => role !== DIRECTOR);
  return credit.job !== DIRECTOR;
}

export function splitCredits<T extends SplittableCredit>(credits: T[]): { acting: T[]; directing: T[]; other: T[] } {
  return {
    acting: credits.filter((credit) => credit.credit_kind === "cast" || Boolean(credit.character)),
    directing: credits.filter(isDirecting),
    other: credits.filter(isOtherWork),
  };
}
