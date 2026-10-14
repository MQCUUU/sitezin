"use client";

import {
  Check,
  ChevronDown,
  Eye,
  Heart,
  ListPlus,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MEDIA_STATUS_OPTIONS, mediaStatusLabel } from "@/lib/media-status";

/*
 * V2.3 — ações rápidas do pôster PADRÃO do site: Ver rápido (olhinho),
 * Status/Adicionar (seta) e Curtir (coração). Uma única implementação para
 * Biblioteca, Home, Descobrir, Para você, Busca e Coleção.
 *
 * O menu de status é renderizado em um PORTAL no <body> com posição `fixed`:
 *  - nunca é cortado por `overflow` de trilhos/cartões nem deslocado por
 *    `transform` de hover (causa dos menus "pulando" e do scroll estranho);
 *  - o foco entra no menu com `preventScroll` (focar um item fora da área
 *    visível rolava a página);
 *  - fecha com Esc, clique fora, rolagem e resize, devolvendo o foco ao botão.
 */

export type MediaPosterActionsProps = {
  title: string;
  inLibrary: boolean;
  status?: string | null;
  favorite?: boolean;
  busy?: boolean;
  onPreview?: () => void;
  /** Título fora da biblioteca: botão "+" (entra como Quero assistir). */
  onAdd?: () => void;
  onChangeStatus?: (status: string) => void;
  onToggleFavorite?: () => void;
  onRemove?: () => void;
  onAddToList?: () => void;
  /** Linha de lista (sem posição absoluta sobre o pôster). */
  inline?: boolean;
};

type MenuPosition = { top: number; left: number; width: number; maxHeight: number };

const MENU_WIDTH = 236;
const MARGIN = 12;
const GAP = 8;

export function MediaPosterActions({
  title,
  inLibrary,
  status,
  favorite = false,
  busy = false,
  onPreview,
  onAdd,
  onChangeStatus,
  onToggleFavorite,
  onRemove,
  onAddToList,
  inline = false,
}: MediaPosterActionsProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setPosition(null);

    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 340;
    const width = Math.min(MENU_WIDTH, window.innerWidth - MARGIN * 2);
    const maxHeight = window.innerHeight - MARGIN * 2;
    const height = Math.min(menuHeight, maxHeight);

    let left = rect.right - width;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));

    let top = rect.bottom + GAP;

    if (top + height > window.innerHeight - MARGIN) top = rect.top - height - GAP;

    top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));

    setPosition({ top, left, width, maxHeight });
  }, []);

  // Posiciona antes da pintura (sem "piscar" no lugar errado) e foca sem rolar.
  useLayoutEffect(() => {
    if (!open) return;

    place();
  }, [open, place]);

  useEffect(() => {
    if (!open || !position) return;

    const current = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"], [role="menuitem"]');

    current?.focus({ preventScroll: true });
    // só quando o menu ganha posição pela primeira vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position !== null]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;

      close(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }

    // Rolar a página/trilho: o menu é `fixed`, então acompanha o botão; só
    // fecha quando o botão sai da tela.
    let frame = 0;

    function onScroll(event: Event) {
      if (menuRef.current?.contains(event.target as Node)) return;

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = triggerRef.current?.getBoundingClientRect();

        if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) close(false);
        else place();
      });
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close, place]);

  function moveFocus(direction: 1 | -1) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);

    if (!items.length) return;

    const index = items.indexOf(document.activeElement as HTMLElement);

    items[(index + direction + items.length) % items.length]?.focus({ preventScroll: true });
  }

  function stop(event: { preventDefault: () => void; stopPropagation: () => void }) {
    // As ações ficam sobre um <Link>: nunca navegam nem borbulham.
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <>
      <div className={`mc-pa${inline ? " mc-pa--inline" : ""}`} role="group" aria-label={`Ações para ${title}`}>
        {onPreview && (
          <button
            type="button"
            className="mc-pa-btn"
            title="Ver rápido"
            aria-label={`Ver rápido: ${title}`}
            onClick={(event) => {
              stop(event);
              onPreview();
            }}
          >
            <Eye size={16} aria-hidden="true" />
          </button>
        )}

        {inLibrary ? (
          <button
            ref={triggerRef}
            type="button"
            className={`mc-pa-btn mc-pa-btn--status${open ? " is-open" : ""}`}
            title={`Status: ${mediaStatusLabel(status)}`}
            aria-label={`Alterar status de ${title} (atual: ${mediaStatusLabel(status)})`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            disabled={busy}
            onClick={(event) => {
              stop(event);
              if (open) close(false);
              else setOpen(true);
            }}
          >
            {busy ? (
              <Loader2 size={15} className="spin" aria-hidden="true" />
            ) : (
              <>
                <Check size={15} aria-hidden="true" />
                <ChevronDown size={11} aria-hidden="true" />
              </>
            )}
          </button>
        ) : (
          onAdd && (
            <button
              type="button"
              className="mc-pa-btn mc-pa-btn--add"
              title="Adicionar como Quero assistir"
              aria-label={`Adicionar ${title} como Quero assistir`}
              disabled={busy}
              onClick={(event) => {
                stop(event);
                onAdd();
              }}
            >
              {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
            </button>
          )
        )}

        {inLibrary && onToggleFavorite && (
          <button
            type="button"
            className={`mc-pa-btn mc-pa-btn--like${favorite ? " is-on" : ""}`}
            title={favorite ? "Remover dos curtidos" : "Curtir"}
            aria-label={favorite ? `Remover ${title} dos curtidos` : `Curtir ${title}`}
            aria-pressed={favorite}
            disabled={busy}
            onClick={(event) => {
              stop(event);
              onToggleFavorite();
            }}
          >
            <Heart size={16} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        )}
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="mc-pa-menu"
            role="menu"
            aria-label={`Status de ${title}`}
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              width: position?.width ?? MENU_WIDTH,
              maxHeight: position?.maxHeight,
              visibility: position ? "visible" : "hidden",
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveFocus(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveFocus(-1);
              } else if (event.key === "Tab") {
                close(false);
              }
            }}
          >
            <div className="mc-pa-menu-head">
              <span>Status</span>
              <strong>{mediaStatusLabel(status)}</strong>
            </div>

            {MEDIA_STATUS_OPTIONS.map((option) => {
              const selected = option.value === status;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`mc-pa-menu-item${selected ? " is-selected" : ""}`}
                  disabled={busy}
                  onClick={() => {
                    close(true);
                    if (!selected) onChangeStatus?.(option.value);
                  }}
                >
                  <span className={`mc-pa-dot mc-pa-dot--${option.tone}`} aria-hidden="true" />
                  <span>{option.label}</span>
                  {selected && <Check size={14} aria-hidden="true" />}
                </button>
              );
            })}

            {(onAddToList || onRemove) && <div className="mc-pa-menu-divider" />}

            {onAddToList && (
              <button
                type="button"
                role="menuitem"
                className="mc-pa-menu-item"
                onClick={() => {
                  close(false);
                  onAddToList();
                }}
              >
                <ListPlus size={14} aria-hidden="true" />
                <span>Adicionar à lista…</span>
              </button>
            )}

            {onRemove && (
              <button
                type="button"
                role="menuitem"
                className="mc-pa-menu-item mc-pa-menu-item--danger"
                disabled={busy}
                onClick={() => {
                  close(false);
                  onRemove();
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>Remover da biblioteca</span>
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
