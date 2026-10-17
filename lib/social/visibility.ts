/*
 * V3.3 — regra ÚNICA de visibilidade do perfil e das suas seções, aplicada
 * no servidor (perfil público, atividade pública). Puro: testado em
 * scripts/test-settings.mjs.
 *
 * Domínio = FOLLOW (não amizade bilateral). Quem vê:
 *  - dono: tudo;
 *  - perfil público: qualquer pessoa vê o perfil;
 *  - perfil privado: só seguidores ACEITOS veem o perfil;
 *  - cada seção ("profile" | "followers" | "private") só é visível se o
 *    perfil já for visível para quem pede — uma seção nunca abre mais do
 *    que o perfil.
 */

export type ProfileVisibility = "public" | "private";
export type SectionVisibility = "profile" | "followers" | "private";

export type ViewerRelation = {
  isOwner: boolean;
  /** Segue o dono com status "accepted". */
  isAcceptedFollower: boolean;
};

export function canViewProfile(
  profile: { visibility?: unknown; is_public?: unknown },
  viewer: ViewerRelation
): boolean {
  if (viewer.isOwner) return true;
  if (profile.visibility === "public" || profile.is_public === true) return true;

  return viewer.isAcceptedFollower;
}

export function canViewSection(
  profile: { visibility?: unknown; is_public?: unknown },
  setting: unknown,
  viewer: ViewerRelation
): boolean {
  if (viewer.isOwner) return true;
  if (!canViewProfile(profile, viewer)) return false;
  if (setting === "profile") return true;
  if (setting === "followers") return viewer.isAcceptedFollower;

  // "private" e qualquer valor desconhecido: só o dono.
  return false;
}

export const SECTION_KEYS = [
  "followers_visibility",
  "following_visibility",
  "activity_visibility",
  "diary_visibility",
  "lists_visibility",
  "likes_visibility",
] as const;

export type SocialSettings = {
  visibility: ProfileVisibility;
  follow_policy: "profile" | "approval" | "nobody";
} & Record<(typeof SECTION_KEYS)[number], SectionVisibility>;

const SECTION_VALUES: SectionVisibility[] = ["profile", "followers", "private"];

/**
 * Aplica um PUT parcial SOBRE o estado atual: campo ausente ou inválido
 * mantém o valor salvo (antes, um PUT só com `visibility` zerava as outras
 * sete regras para o padrão).
 */
export function mergeSocialSettings(current: SocialSettings, patch: Record<string, unknown>): SocialSettings {
  const next: SocialSettings = { ...current };

  if (patch.visibility === "public" || patch.visibility === "private") next.visibility = patch.visibility;
  if (patch.follow_policy === "profile" || patch.follow_policy === "approval" || patch.follow_policy === "nobody") {
    next.follow_policy = patch.follow_policy;
  }

  for (const key of SECTION_KEYS) {
    const value = patch[key];

    if (SECTION_VALUES.includes(value as SectionVisibility)) next[key] = value as SectionVisibility;
  }

  return next;
}

/** Status de um novo follow (o mesmo de antes): automático só em perfil público com política "profile". */
export function followStatusFor(target: { visibility?: unknown; is_public?: unknown; follow_policy?: unknown }) {
  const isPublic = target.visibility === "public" || target.is_public === true;

  return target.follow_policy === "profile" && isPublic ? "accepted" : "pending";
}
