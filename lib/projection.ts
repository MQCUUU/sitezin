/*
 * Projeção (Fase 5) — regras puras, sem React, para a faixa trocar de imagem
 * conforme o título em foco. O agendador existe para o ponteiro varrer a grade
 * sem pedir uma imagem por pôster: só vale o último alvo que ficou parado.
 */

/** Tempo que o ponteiro precisa ficar sobre um pôster antes de a faixa trocar. */
export const PROJECTION_ENTER_DELAY_MS = 120;
/** Tempo fora de qualquer pôster antes de a faixa voltar ao título padrão. */
export const PROJECTION_LEAVE_DELAY_MS = 220;

export type ProjectionScheduler = {
  /** Pede a troca para `path` (ou volta ao padrão com `null`). */
  request(path: string | null): void;
  cancel(): void;
};

export function createProjectionScheduler(
  commit: (path: string | null) => void,
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
  delays = { enter: PROJECTION_ENTER_DELAY_MS, leave: PROJECTION_LEAVE_DELAY_MS },
): ProjectionScheduler {
  let current: string | null = null;
  let pendingPath: string | null | undefined;
  let handle: unknown = null;

  const clear = () => {
    if (handle != null) timers.clear(handle);
    handle = null;
    pendingPath = undefined;
  };

  return {
    request(path) {
      if (path === pendingPath) return;
      if (pendingPath === undefined && path === current) return;
      clear();
      if (path === current) return;
      pendingPath = path;
      handle = timers.set(() => {
        const next = pendingPath ?? null;
        handle = null;
        pendingPath = undefined;
        current = next;
        commit(next);
      }, path === null ? delays.leave : delays.enter);
    },
    cancel: clear,
  };
}

/** Média de cor de um bloco de pixels RGBA (ignora transparentes). */
export function averageColor(data: ArrayLike<number>): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  if (!n) return null;
  return `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`;
}
