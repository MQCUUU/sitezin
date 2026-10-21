/*
 * Fase 1 — intenção de ação preservada durante o login.
 *
 * Visitante (ou sessão expirada) tenta "Adicionar", "Curtir" ou mudar o status
 * de um título → a intenção fica guardada nesta aba (sessionStorage) → depois
 * do login/cadastro, o AuthPage a executa UMA vez e volta para a página.
 *
 * Segurança: só ações conhecidas da biblioteca (nada arbitrário), formato
 * validado na leitura, expira em 15 min, é consumida antes de executar (nunca
 * repete) e só roda se o destino do login for a mesma página onde foi pedida.
 * Nada vai para a URL além do `next` (caminho interno validado).
 */
import { safeNextPath } from "../safe-next";

export const PENDING_ACTION_KEY = "mycatalog:pending-action:v1";
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

const STATUSES = ["want", "watching", "watched", "paused", "dropped", "rewatching", "rewatched"] as const;

export type LibraryIntent =
  | { kind: "add"; media_type: "movie" | "tv"; tmdb_id: number; title?: string }
  | { kind: "favorite"; media_type: "movie" | "tv"; tmdb_id: number; title?: string }
  | { kind: "status"; media_type: "movie" | "tv"; tmdb_id: number; status: string; title?: string };

export type PendingAction = LibraryIntent & { v: 1; return_to: string; created_at: number };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Valida uma intenção vinda de fora (clique, storage). Devolve null se o formato não for conhecido. */
export function parseIntent(value: unknown): LibraryIntent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const mediaType: "movie" | "tv" | null = raw.media_type === "movie" || raw.media_type === "tv" ? raw.media_type : null;
  const tmdbId = Number(raw.tmdb_id);
  if (!mediaType || !Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  const title = typeof raw.title === "string" ? raw.title.slice(0, 200) : undefined;
  const base = { media_type: mediaType, tmdb_id: tmdbId, ...(title ? { title } : {}) };

  if (raw.kind === "add") return { kind: "add", ...base };
  if (raw.kind === "favorite") return { kind: "favorite", ...base };
  if (raw.kind === "status" && typeof raw.status === "string" && (STATUSES as readonly string[]).includes(raw.status)) {
    return { kind: "status", status: raw.status, ...base };
  }
  return null;
}

/** Intenção a partir de um item de card (Descobrir / Busca / Coleção). */
export function intentForMedia(
  item: { id: number | string; media_type?: string | null; title?: string | null; name?: string | null },
  kind: "add" | "favorite" | "status",
  status?: string
): LibraryIntent | undefined {
  return (
    parseIntent({
      kind,
      status,
      media_type: item.media_type,
      tmdb_id: item.id,
      title: item.title || item.name || undefined,
    }) ?? undefined
  );
}

export function parsePendingAction(value: unknown, now = Date.now()): PendingAction | null {
  const intent = parseIntent(value);
  if (!intent) return null;
  const raw = value as Record<string, unknown>;
  const createdAt = Number(raw.created_at);
  if (raw.v !== 1 || !Number.isFinite(createdAt) || now - createdAt > PENDING_ACTION_TTL_MS || createdAt > now + 60_000) return null;
  if (typeof raw.return_to !== "string") return null;
  const returnTo = safeNextPath(raw.return_to, "");
  if (!returnTo || returnTo !== raw.return_to) return null;
  return { ...intent, v: 1, return_to: returnTo, created_at: createdAt };
}

export function savePendingAction(intent: LibraryIntent, returnTo: string, store: StorageLike | null = storage(), now = Date.now()): boolean {
  const valid = parseIntent(intent);
  const path = safeNextPath(returnTo, "");
  if (!valid || !path || !store) return false;
  try {
    store.setItem(PENDING_ACTION_KEY, JSON.stringify({ ...valid, v: 1, return_to: path, created_at: now }));
    return true;
  } catch {
    return false;
  }
}

/** Lê sem consumir (para a tela de login descrever o que vai acontecer). */
export function peekPendingAction(store: StorageLike | null = storage(), now = Date.now()): PendingAction | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_ACTION_KEY);
    return raw ? parsePendingAction(JSON.parse(raw), now) : null;
  } catch {
    return null;
  }
}

/**
 * Consome a intenção (remove ANTES de devolver: nunca roda duas vezes). Só a
 * devolve se ela foi pedida na página para onde o login vai voltar.
 */
export function takePendingAction(returnTo: string, store: StorageLike | null = storage(), now = Date.now()): PendingAction | null {
  const pending = peekPendingAction(store, now);
  clearPendingAction(store);
  if (!pending || pending.return_to !== safeNextPath(returnTo, "")) return null;
  return pending;
}

export function clearPendingAction(store: StorageLike | null = storage()): void {
  try {
    store?.removeItem(PENDING_ACTION_KEY);
  } catch {
    /* storage indisponível: nada a limpar */
  }
}

export function loginHref(returnTo: string, reason: "action" | "session"): string {
  const params = new URLSearchParams({ next: safeNextPath(returnTo), reason });
  return `/login?${params.toString()}`;
}

/** Texto curto da intenção ("curtir Matrix", "marcar Matrix como Assistido"). */
export function describeIntent(intent: LibraryIntent, statusLabel: (status: string) => string): string {
  const name = intent.title ? `“${intent.title}”` : "este título";
  if (intent.kind === "favorite") return `curtir ${name}`;
  if (intent.kind === "status") return `marcar ${name} como ${statusLabel(intent.status)}`;
  return `adicionar ${name} à sua biblioteca`;
}
