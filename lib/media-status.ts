/*
 * V2.3 — fonte ÚNICA de status de mídia para a interface: rótulos, ordem e
 * grupo visual. Antes cada tela tinha a sua lista (a Biblioteca não oferecia
 * "Pausado"; o Discover tinha outra ordem; tags com cores diferentes).
 */
export type MediaStatus =
  | "want"
  | "watching"
  | "watched"
  | "paused"
  | "dropped";

export type MediaStatusGroup = "progress" | "waiting" | "completed" | "ended";

export const MEDIA_STATUS_OPTIONS: {
  value: MediaStatus;
  label: string;
  group: MediaStatusGroup;
  groupLabel: string;
}[] = [
  { value: "want", label: "Quero assistir", group: "waiting", groupLabel: "Em espera" },
  { value: "watching", label: "Assistindo", group: "progress", groupLabel: "Em andamento" },
  { value: "watched", label: "Assistido", group: "completed", groupLabel: "Concluído" },
  { value: "paused", label: "Pausado", group: "waiting", groupLabel: "Em espera" },
  { value: "dropped", label: "Abandonado", group: "ended", groupLabel: "Encerrado" },
];

const BY_VALUE = new Map(MEDIA_STATUS_OPTIONS.map((option) => [option.value as string, option]));

/**
 * Fim do reassistir (migration 0008): "Reassistindo"/"Reassistido" não existem
 * mais. Valor antigo que ainda chegue (backup, link, cache) vira Assistido.
 */
export function normalizeLegacyStatus<T extends string | null | undefined>(status: T): T | "watched" {
  return status === "rewatching" || status === "rewatched" ? "watched" : status;
}

export function mediaStatusLabel(status?: string | null): string {
  return (status && BY_VALUE.get(normalizeLegacyStatus(status))?.label) || "Na biblioteca";
}

export function mediaStatusGroup(status?: string | null): MediaStatusGroup {
  return (status && BY_VALUE.get(normalizeLegacyStatus(status))?.group) || "completed";
}
