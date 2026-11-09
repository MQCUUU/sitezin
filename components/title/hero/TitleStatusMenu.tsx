"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { MediaStatusIcon } from "@/components/media/MediaBadges";
import { Popover } from "@/components/ui/Popover";
import { useModal } from "@/hooks/useModal";
import { MEDIA_STATUS_OPTIONS, mediaStatusLabel } from "@/lib/media-status";
import { sheetExitTransition, sheetTransition } from "@/lib/motion";
import type { LibraryLookupState } from "@/lib/library/lookup";
import type { Status } from "@/lib/types";

export type TitleStatusMenuProps = {
  /** Status atual; null = fora da biblioteca. */
  status: Status | null;
  libraryLookup: LibraryLookupState;
  saving: boolean;
  onRetryLookup: () => void;
  onChange: (status: Status) => void;
  onRemove: () => void;
  /** "menu" = painel ancorado (computador) · "sheet" = folha inferior (celular). */
  variant: "menu" | "sheet";
  className?: string;
};

/**
 * Ação principal do Título (Fase 4): um botão claro que mostra o status e
 * abre as opções. Fora da biblioteca ele diz "Adicionar à biblioteca" e
 * escolher um status adiciona. "Remover" fica no fim da lista — reversível,
 * com a confirmação de sempre (TitleView decide).
 */
export function TitleStatusMenu({
  status,
  libraryLookup,
  saving,
  onRetryLookup,
  onChange,
  onRemove,
  variant,
  className,
}: TitleStatusMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inLibrary = status !== null;

  if (!inLibrary && libraryLookup === "error") {
    return (
      <button type="button" className={`btn primary tt-primary ${className ?? ""}`} onClick={onRetryLookup}>
        <RefreshCw size={18} aria-hidden="true" />
        Tentar de novo
      </button>
    );
  }

  const pending = !inLibrary && libraryLookup === "loading";
  const label = pending ? (variant === "sheet" ? "Verificando…" : "Verificando biblioteca…") : inLibrary ? mediaStatusLabel(status) : variant === "sheet" ? "Adicionar" : "Adicionar à biblioteca";

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function pick(value: Status) {
    close();
    if (value !== status) onChange(value);
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className={`btn primary tt-primary ${className ?? ""}`}
      aria-haspopup={variant === "menu" ? "menu" : "dialog"}
      aria-expanded={open}
      disabled={pending || saving}
      aria-busy={pending || undefined}
      aria-label={!inLibrary && !pending ? "Adicionar à biblioteca" : undefined}
      onClick={() => setOpen((value) => !value)}
    >
      {inLibrary ? <MediaStatusIcon status={status} size={18} /> : <Plus size={18} aria-hidden="true" />}
      <span className="tt-primary-label">{label}</span>
      <ChevronDown size={16} aria-hidden="true" className="tt-primary-chevron" />
    </button>
  );

  const options = (
    <StatusOptions
      current={status}
      onPick={pick}
      onRemove={inLibrary ? () => { close(false); onRemove(); } : undefined}
      onEscape={() => close()}
    />
  );

  if (variant === "sheet") {
    return (
      <>
        {trigger}
        <StatusSheet open={open} onClose={() => close()}>{options}</StatusSheet>
      </>
    );
  }

  return (
    <div className="tt-status" ref={containerRef}>
      {trigger}
      <Popover
        open={open}
        onClose={() => close(false)}
        containerRef={containerRef}
        className="tt-status-menu"
        style={{ transformOrigin: "top left" }}
      >
        {options}
      </Popover>
    </div>
  );
}

/** Lista de status com setas ↑/↓, Home/End e foco no atual ao abrir. */
function StatusOptions({
  current,
  onPick,
  onRemove,
  onEscape,
}: {
  current: Status | null;
  onPick: (status: Status) => void;
  onRemove?: () => void;
  onEscape: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const target = list?.querySelector<HTMLElement>('[aria-checked="true"]') ?? list?.querySelector<HTMLElement>("button");
    target?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const go = (next: number) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
    }
  }

  return (
    <div ref={listRef} role="menu" aria-label="Status na sua biblioteca" className="tt-status-list" onKeyDown={onKeyDown}>
      {MEDIA_STATUS_OPTIONS.map((option) => {
        const checked = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            className="tt-status-option"
            onClick={() => onPick(option.value as Status)}
          >
            <MediaStatusIcon status={option.value} size={16} />
            <span>{option.label}</span>
            {checked ? <Check size={16} aria-hidden="true" className="tt-status-check" /> : null}
          </button>
        );
      })}
      {onRemove ? (
        <>
          <div role="separator" className="tt-status-separator" />
          <button type="button" role="menuitem" className="tt-status-option tt-status-remove" onClick={onRemove}>
            <Trash2 size={16} aria-hidden="true" />
            <span>Remover da biblioteca</span>
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Folha inferior do celular: sobe de onde está a barra de ações e desce ao fechar. */
function StatusSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const sheetRef = useModal(open, onClose);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="status-sheet"
          className="tt-sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: sheetExitTransition }}
          transition={sheetTransition}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            ref={sheetRef as React.RefObject<HTMLElement>}
            className="tt-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Status na sua biblioteca"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%", transition: sheetExitTransition }}
            transition={sheetTransition}
          >
            <span className="tt-sheet-grabber" aria-hidden="true" />
            {children}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
