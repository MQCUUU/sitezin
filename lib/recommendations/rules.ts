/*
 * Indicações (migration 0010) — regras puras: o estado de quem recebe (sai da
 * biblioteca dela), o texto que quem indicou vê, o aviso de retorno, o "faro" e
 * o bilhete. Quem indicou nunca vê que a indicação foi dispensada.
 */

import { canViewSection } from "@/lib/social/visibility";

export type RecipientState = "pending" | "saved" | "watched" | "dismissed";

export const NOTE_MAX = 140;
export const MAX_RECIPIENTS = 20;
export const FARO_HIT = 7;

/** A biblioteca vence a dispensa: dispensar e depois salvar conta como salvo. */
export function recipientState(rec: { dismissed_at: string | null }, item: { status: string } | null): RecipientState {
  if (item) return item.status === "watched" ? "watched" : "saved";
  return rec.dismissed_at ? "dismissed" : "pending";
}

export function formatRating(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export function senderStatusLabel(state: RecipientState, visibleRating: number | null): string {
  if (state === "saved") return "pôs na Watchlist";
  if (state === "watched") return visibleRating === null ? "assistiu" : `assistiu e deu ${formatRating(visibleRating)}`;
  return "ainda não viu";
}

export function resultCopy(friendName: string, titleName: string, visibleRating: number | null): string {
  const base = `${friendName} assistiu ${titleName}, que você indicou`;
  return visibleRating === null ? base : `${base}, e deu ${formatRating(visibleRating)}`;
}

export function faro(ratings: (number | null)[]): { hits: number; rated: number } {
  const rated = ratings.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return { hits: rated.filter((value) => value >= FARO_HIT).length, rated: rated.length };
}

export function faroLabel(f: { hits: number; rated: number }, min: number): string | null {
  if (f.rated < Math.max(1, min)) return null;
  return f.rated === 1 ? `${f.hits} de 1 indicação acertou` : `${f.hits} de ${f.rated} indicações acertaram`;
}

export function groupByTitle<T extends { media_id: number; created_at: string }>(recs: T[]): { media_id: number; recs: T[] }[] {
  const groups = new Map<number, T[]>();
  for (const rec of recs) {
    const list = groups.get(rec.media_id);
    if (list) list.push(rec);
    else groups.set(rec.media_id, [rec]);
  }
  const latest = (list: T[]) => Math.max(...list.map((rec) => Date.parse(rec.created_at) || 0));
  return [...groups.entries()]
    .map(([media_id, list]) => ({ media_id, recs: [...list].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)) }))
    .sort((a, b) => latest(b.recs) - latest(a.recs));
}

export function sendersLine(names: string[]): string {
  if (names.length <= 1) return `${names[0] ?? "Alguém"} indicou`;
  if (names.length === 2) return `${names[0]} e ${names[1]} indicaram`;
  return `${names[0]}, ${names[1]} e mais ${names.length - 2} indicaram`;
}

/** null = sem bilhete; false = inválido (mais de 140 caracteres ou tipo errado). */
export function normalizeNote(raw: unknown): string | null | false {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return false;
  const note = raw.trim();
  if (!note) return null;
  return note.length > NOTE_MAX ? false : note;
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Marina", "Ana, Bruno, Caio e mais 2". */
export function joinNames(names: string[], max = 3): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(", ")} e mais ${names.length - max}`;
}

/** "hoje", "ontem", "há 2 dias", "há 1 semana", "há 3 meses", "há 2 anos". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const days = Math.floor(Math.max(0, now - then) / 86_400_000);
  if (days < 1) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `há ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

/**
 * Nota que quem indicou pode ver do amigo. A relação é recalculada (sender_follows
 * vem do SQL): desfeita a amizade, nota "só seguidores" deixa de aparecer.
 */
export function recipientRating(row: {
  personal_rating: unknown;
  visibility?: unknown;
  is_public?: unknown;
  activity_visibility?: unknown;
  ratings_visibility?: unknown;
  sender_follows?: unknown;
}): number | null {
  if (row.personal_rating === null || row.personal_rating === undefined) return null;
  const allowed = canViewSection(row, row.ratings_visibility ?? row.activity_visibility, {
    isOwner: false,
    isAcceptedFollower: Boolean(row.sender_follows),
  });
  return allowed ? Number(row.personal_rating) : null;
}
