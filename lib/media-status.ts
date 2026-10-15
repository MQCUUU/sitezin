/*
 * V2.3 — fonte ÚNICA de status de mídia para a interface: rótulos, ordem e
 * tom visual. Antes cada tela tinha a sua lista (a Biblioteca não oferecia
 * "Pausado"; o Discover tinha outra ordem; tags com cores diferentes).
 */
export type MediaStatus =
  | "want"
  | "watching"
  | "watched"
  | "paused"
  | "dropped"
  | "rewatching"
  | "rewatched";

export type StatusTone = "info" | "accent" | "success" | "warning" | "danger" | "violet" | "neutral";

export const MEDIA_STATUS_OPTIONS: { value: MediaStatus; label: string; tone: StatusTone }[] = [
  { value: "want", label: "Quero assistir", tone: "info" },
  { value: "watching", label: "Assistindo", tone: "accent" },
  { value: "watched", label: "Assistido", tone: "success" },
  { value: "rewatching", label: "Reassistindo", tone: "violet" },
  { value: "rewatched", label: "Reassistido", tone: "success" },
  { value: "paused", label: "Pausado", tone: "warning" },
  // V2.6: abandonar é uma decisão de consumo, não um erro — tom neutro, nunca vermelho.
  { value: "dropped", label: "Abandonado", tone: "neutral" },
];

const BY_VALUE = new Map(MEDIA_STATUS_OPTIONS.map((option) => [option.value as string, option]));

export function mediaStatusLabel(status?: string | null): string {
  return (status && BY_VALUE.get(status)?.label) || "Na biblioteca";
}

export function mediaStatusTone(status?: string | null): StatusTone {
  return (status && BY_VALUE.get(status)?.tone) || "accent";
}
