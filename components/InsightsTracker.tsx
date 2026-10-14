"use client";

import { useEffect } from "react";

/*
 * V2.3 — instrumentação dos Insights. Registra SÓ "qual título, qual
 * ferramenta/origem, qual exposição" (nada de texto, URL, IP ou user agent).
 *
 * EXPOSIÇÃO (exposure_id)
 *   Um título visível (≥ 50% por ≥ 600 ms, aba visível) dentro de um contêiner
 *   [data-rec-tool]. A exposição continua enquanto o título volta a ser visto
 *   com intervalos < 30 min: re-render, refresh, voltar/avançar, Strict Mode
 *   e outras abas (localStorage) reaproveitam o MESMO id → o servidor grava 1.
 *   Depois de 30 min sem ser visto, a próxima vez é uma exposição NOVA.
 *
 *   rec_shown     1 por exposição
 *   rec_opened    1 por exposição (clique no título dentro da ferramenta)
 *   rec_dismissed 1 por exposição ("Não tenho interesse" de um título exposto)
 *
 * ATRIBUIÇÃO de library_added — last-touch por INTERAÇÃO (não por "apareceu"):
 *   1. a adição veio de um clique DENTRO de uma ferramenta (≤ 5 s antes)
 *      → aquela ferramenta + a exposição do título nela;
 *   2. senão, na página do próprio título, o último clique que levou a ele
 *      (≤ 2 h) → a origem desse clique (ferramenta+exposição, Busca, Descobrir…);
 *   3. senão → a página onde a adição aconteceu.
 *   Um título que só APARECEU no "Para você" e foi adicionado pela Busca é Busca.
 *   O servidor valida o vínculo com a exposição (ver /api/insights/events).
 *
 * Instalação única por aba. Toda falha é engolida: rastrear nunca bloqueia.
 */

type Kind = "rec_shown" | "rec_opened" | "rec_dismissed" | "library_added";
type Event = { kind: Kind; source: string; tmdb_id: number; media_type: "movie" | "tv"; exposure_id?: string | null };
type Exposure = { id: string; last: number };
type Touch = { source: string; exposure_id: string | null; at: number };

const ENDPOINT = "/api/insights/events";
const VISIBLE_MS = 600;
const EXPOSURE_IDLE_MS = 30 * 60 * 1000;
const TOUCH_MS = 2 * 60 * 60 * 1000;
const CLICK_TO_ADD_MS = 5000;
const EXPOSURES_KEY = "mycatalog:insights:exposures";
const TOUCHES_KEY = "mycatalog:insights:touches";
const SENT_KEY = "mycatalog:insights:sent";
const TITLE_HREF = /\/title\/(movie|tv)\/(\d+)/;

export function surfaceFromPath(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/discover")) return "discover";
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/for-you")) return "for_you";
  if (pathname.startsWith("/assistant")) return "assistant";
  if (pathname.startsWith("/title")) return "title";
  if (pathname.startsWith("/collection")) return "collection";
  if (pathname.startsWith("/person")) return "person";
  if (pathname.startsWith("/lists")) return "lists";
  if (pathname.startsWith("/u/") || pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/calendar")) return "calendar";

  return "other";
}

function parseKey(href: string | null): { tmdb_id: number; media_type: "movie" | "tv" } | null {
  const match = href ? TITLE_HREF.exec(href) : null;

  return match ? { media_type: match[1] as "movie" | "tv", tmdb_id: Number(match[2]) } : null;
}

function load<T>(storage: Storage | null, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);

    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(storage: Storage | null, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage cheio/bloqueado: a deduplicação definitiva é no banco */
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function InsightsTracker() {
  useEffect(() => {
    const flag = "__mycatalogInsightsTracker";
    const globalWindow = window as unknown as Record<string, unknown>;

    // Instalação única e permanente por aba (Strict Mode monta/desmonta/monta).
    if (globalWindow[flag]) return;

    globalWindow[flag] = true;

    try {
      const local = safeStorage("local");
      const session = safeStorage("session");
      const original = window.fetch.bind(window);
      const queue: Event[] = [];
      const sent = new Set<string>(load<string[]>(session, SENT_KEY, []));
      let lastToolClick: { tool: string; at: number } | null = null;

      /** Exposição atual do título na ferramenta (cria uma nova após 30 min sem ser visto). */
      const exposureFor = (tool: string, key: { tmdb_id: number; media_type: string }, touchNow: boolean) => {
        const all = load<Record<string, Exposure>>(local, EXPOSURES_KEY, {});
        const id = `${tool}|${key.media_type}-${key.tmdb_id}`;
        const now = Date.now();
        const current = all[id];
        const exposure = current && now - current.last < EXPOSURE_IDLE_MS ? current : { id: uuid(), last: now };

        if (touchNow) exposure.last = now;

        all[id] = exposure;

        // poda: só exposições vivas
        for (const [k, v] of Object.entries(all)) if (now - v.last >= EXPOSURE_IDLE_MS) delete all[k];

        save(local, EXPOSURES_KEY, all);

        return exposure.id;
      };

      const liveExposure = (tool: string, key: { tmdb_id: number; media_type: string }) => {
        const current = load<Record<string, Exposure>>(local, EXPOSURES_KEY, {})[`${tool}|${key.media_type}-${key.tmdb_id}`];

        return current && Date.now() - current.last < EXPOSURE_IDLE_MS ? current.id : null;
      };

      const push = (event: Event) => {
        const key =
          event.kind === "library_added"
            ? `added|${event.media_type}-${event.tmdb_id}|${Math.floor(Date.now() / 600000)}`
            : `${event.kind}|${event.exposure_id}`;

        if (sent.has(key)) return;

        sent.add(key);
        queue.push(event);
        save(session, SENT_KEY, Array.from(sent).slice(-1500));
      };

      const touch = (key: { tmdb_id: number; media_type: string }, value: Touch) => {
        const all = load<Record<string, Touch>>(local, TOUCHES_KEY, {});
        const now = Date.now();

        all[`${key.media_type}-${key.tmdb_id}`] = value;

        for (const [k, v] of Object.entries(all)) if (now - v.at >= TOUCH_MS) delete all[k];

        save(local, TOUCHES_KEY, all);
      };

      const flush = (useBeacon = false) => {
        if (!queue.length) return;

        const body = JSON.stringify({ events: queue.splice(0, 50) });

        try {
          if (useBeacon && typeof navigator.sendBeacon === "function") {
            navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
          } else {
            void original(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
          }
        } catch {
          /* sem rede: perde o lote, nunca quebra a página */
        }
      };

      const shown = (tool: string, key: { tmdb_id: number; media_type: "movie" | "tv" }) => {
        const exposure = exposureFor(tool, key, true);

        push({ kind: "rec_shown", source: tool, ...key, exposure_id: exposure });

        return exposure;
      };

      /* ---- exposições: visibilidade real ---- */
      const observed = new WeakSet<Element>();
      const pending = new Map<Element, number>();
      const visible =
        typeof IntersectionObserver !== "undefined"
          ? new IntersectionObserver(
              (entries) => {
                for (const entry of entries) {
                  const link = entry.target as HTMLAnchorElement;

                  if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    if (pending.has(link)) continue;

                    pending.set(
                      link,
                      window.setTimeout(() => {
                        pending.delete(link);

                        if (!link.isConnected || document.visibilityState !== "visible") return;

                        const container = link.closest<HTMLElement>("[data-rec-tool]");
                        const key = parseKey(link.getAttribute("href"));

                        if (container && key) shown(container.dataset.recTool || "other", key);
                      }, VISIBLE_MS)
                    );
                  } else if (pending.has(link)) {
                    window.clearTimeout(pending.get(link));
                    pending.delete(link);
                  }
                }
              },
              { threshold: [0, 0.5] }
            )
          : null;

      let scanTimer = 0;
      const scan = () => {
        scanTimer = 0;

        document.querySelectorAll<HTMLAnchorElement>('[data-rec-tool] a[href*="/title/"]').forEach((link) => {
          if (observed.has(link) || !parseKey(link.getAttribute("href"))) return;

          observed.add(link);
          visible?.observe(link);
        });
      };

      new MutationObserver(() => {
        if (!scanTimer) scanTimer = window.setTimeout(scan, 300);
      }).observe(document.body, { childList: true, subtree: true });
      scan();

      /* ---- cliques: aberturas e pontos de contato da jornada ---- */
      document.addEventListener(
        "click",
        (event) => {
          try {
            const target = event.target as Element | null;
            const container = target?.closest?.<HTMLElement>("[data-rec-tool]") ?? null;
            const tool = container?.dataset.recTool || null;

            if (tool) lastToolClick = { tool, at: Date.now() };

            const link = target?.closest?.('a[href*="/title/"]');
            const key = link ? parseKey(link.getAttribute("href")) : null;

            if (!key) return;

            if (tool) {
              // clicou = viu: garante a exposição mesmo sem os 600 ms
              const exposure = shown(tool, key);

              push({ kind: "rec_opened", source: tool, ...key, exposure_id: exposure });
              touch(key, { source: tool, exposure_id: exposure, at: Date.now() });
            } else {
              touch(key, { source: surfaceFromPath(window.location.pathname), exposure_id: null, at: Date.now() });
            }
          } catch {
            /* nunca interfere no clique */
          }
        },
        true
      );

      /* ---- adições e "não tenho interesse" (respostas OK do fetch) ---- */
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await original(input, init);

        try {
          const method = (init?.method || "GET").toUpperCase();

          if (response.ok && method === "POST" && typeof init?.body === "string") {
            const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const path = new URL(raw, window.location.origin).pathname;

            if (path === "/api/library" || path === "/api/not-interested") {
              const body = JSON.parse(init.body);
              const tmdb = Number(path === "/api/library" ? body?.media?.id : body?.tmdb_id);
              const media_type = (path === "/api/library" ? body?.media?.media_type : body?.media_type) === "tv" ? "tv" : "movie";
              const key = { tmdb_id: tmdb, media_type } as const;

              if (Number.isInteger(tmdb) && tmdb > 0) {
                const now = Date.now();
                const fromTool = lastToolClick && now - lastToolClick.at < CLICK_TO_ADD_MS ? lastToolClick.tool : null;

                if (path === "/api/not-interested") {
                  const exposure = fromTool ? liveExposure(fromTool, key) : null;

                  if (fromTool && exposure) push({ kind: "rec_dismissed", source: fromTool, ...key, exposure_id: exposure });
                } else {
                  let source = surfaceFromPath(window.location.pathname);
                  let exposure: string | null = null;
                  const onThisTitle = TITLE_HREF.exec(window.location.pathname);

                  if (fromTool) {
                    source = fromTool;
                    exposure = liveExposure(fromTool, key);
                  } else if (onThisTitle && Number(onThisTitle[2]) === tmdb && onThisTitle[1] === media_type) {
                    const last = load<Record<string, Touch>>(local, TOUCHES_KEY, {})[`${media_type}-${tmdb}`];

                    if (last && now - last.at < TOUCH_MS) {
                      source = last.source;
                      exposure = last.exposure_id;
                    }
                  }

                  push({ kind: "library_added", source, ...key, exposure_id: exposure });
                }
              }
            }
          }
        } catch {
          /* nunca interfere na requisição original */
        }

        return response;
      };

      window.setInterval(() => flush(), 5000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush(true);
      });
      window.addEventListener("pagehide", () => flush(true));
    } catch {
      /* ambiente sem APIs necessárias: sem rastreamento, produto segue normal */
    }
  }, []);

  return null;
}
