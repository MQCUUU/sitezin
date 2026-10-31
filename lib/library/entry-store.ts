"use client";

/*
 * Estado pessoal (na biblioteca? status/curtida) de QUALQUER pôster do site,
 * compartilhado entre componentes.
 *
 * - Cada pôster visível pede seu estado; os pedidos feitos no mesmo instante viram
 *   UMA chamada a POST /api/library/state (lotes de até 100) — uma tela com 60
 *   pôsteres faz 1 requisição, não 60.
 * - Mutações feitas pelos botões atualizam o estado na hora (todas as cópias do
 *   mesmo título na tela mudam juntas).
 * - Visitante não consulta nada (a API exige sessão): todos ficam "fora da biblioteca".
 * - Quando a biblioteca muda em outra parte do app (versão global sobe), o estado
 *   cacheado é descartado e recarregado na próxima leitura.
 */

import { useSyncExternalStore } from "react";

import { apiFetch } from "@/lib/api-client";
import { getLibraryVersion } from "@/lib/library-cache";
import { chunkLibraryStatePairs, type LibraryStatePair } from "@/lib/library-state-batches";

export type MediaType = "movie" | "tv";
export type LibraryEntry = { library_id: string; status: string; favorite: boolean } | null;
/** undefined = ainda não sabemos; null = fora da biblioteca. */
type Slot = LibraryEntry | undefined;

const entries = new Map<string, Slot>();
const listeners = new Map<string, Set<() => void>>();
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let seenVersion = -1;
let guest = false;

export const entryKey = (type: MediaType, tmdbId: number | string) => `${type}:${Number(tmdbId)}`;

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function checkVersion() {
  const version = getLibraryVersion();
  if (seenVersion === -1) seenVersion = version;
  if (version !== seenVersion) {
    seenVersion = version;
    // Mudança em outra parte do app: tudo que estava em cache pode estar velho.
    const keys = [...entries.keys()];
    entries.clear();
    keys.forEach((key) => {
      if (listeners.get(key)?.size) request(key);
      notify(key);
    });
  }
}

async function flush() {
  flushTimer = null;
  const keys = [...pending];
  pending.clear();
  if (!keys.length) return;
  if (guest) {
    keys.forEach((key) => {
      entries.set(key, null);
      notify(key);
    });
    return;
  }
  const wanted = keys.map((key) => {
    const [media_type, id] = key.split(":");
    return { media_type, id: Number(id) };
  });
  for (const chunk of chunkLibraryStatePairs(wanted) as LibraryStatePair[][]) {
    try {
      const data = await apiFetch<{ items?: { media_type: string; tmdb_id: number; library_id: string; status: string; favorite: boolean }[] }>(
        "/api/library/state",
        { method: "POST", json: { items: chunk }, cache: "no-store" }
      );
      const found = new Map((data?.items || []).map((row) => [entryKey(row.media_type as MediaType, row.tmdb_id), row]));
      for (const pair of chunk) {
        const key = entryKey(pair.media_type, pair.tmdb_id);
        const row = found.get(key);
        entries.set(key, row ? { library_id: String(row.library_id), status: String(row.status), favorite: Boolean(row.favorite) } : null);
        notify(key);
      }
    } catch {
      // Sem sessão (401) ou falha: mostra como "fora da biblioteca" — as ações
      // continuam funcionando (adicionar nunca sobrescreve um item existente).
      for (const pair of chunk) {
        const key = entryKey(pair.media_type, pair.tmdb_id);
        if (entries.get(key) === undefined) entries.set(key, null);
        notify(key);
      }
    }
  }
}

function request(key: string) {
  pending.add(key);
  if (!flushTimer) flushTimer = setTimeout(flush, 30);
}

/** Visitante: nada a consultar. */
export function setLibraryGuest(isGuest: boolean) {
  if (guest === isGuest) return;
  guest = isGuest;
  const keys = [...entries.keys()];
  entries.clear();
  keys.forEach((key) => {
    if (listeners.get(key)?.size) request(key);
    notify(key);
  });
}

/** Atualiza o estado de um título depois de uma ação feita na tela. */
export function setLibraryEntry(type: MediaType, tmdbId: number | string, entry: LibraryEntry) {
  const key = entryKey(type, tmdbId);
  entries.set(key, entry);
  notify(key);
}

export function getLibraryEntry(type: MediaType, tmdbId: number | string): Slot {
  return entries.get(entryKey(type, tmdbId));
}

function subscribe(key: string, fn: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  checkVersion();
  if (!entries.has(key)) request(key);
  return () => {
    listeners.get(key)?.delete(fn);
  };
}

/** Estado do título na biblioteca do usuário (undefined enquanto carrega). */
export function useLibraryEntry(type: MediaType, tmdbId: number | string): Slot {
  const key = entryKey(type, tmdbId);
  return useSyncExternalStore(
    (fn) => subscribe(key, fn),
    () => entries.get(key),
    () => undefined
  );
}
