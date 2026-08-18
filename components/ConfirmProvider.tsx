"use client";

import { AlertTriangle } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmOptions = { title?: string; description: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type PendingConfirm = ConfirmOptions & { resolve: (answer: boolean) => void };
const ConfirmContext = createContext<((options: ConfirmOptions | string) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const finish = useCallback((answer: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(answer);
  }, []);
  const confirm = useCallback((options: ConfirmOptions | string) => new Promise<boolean>((resolve) => {
    if (pendingRef.current) pendingRef.current.resolve(false);
    const next: PendingConfirm = { title: "Confirmar ação", confirmLabel: "Confirmar", cancelLabel: "Cancelar", danger: true, ...(typeof options === "string" ? { description: options } : options), resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") finish(false); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKeyDown); };
  }, [finish, pending]);

  return <ConfirmContext.Provider value={confirm}>
    {children}
    {pending && <div className="mycatalog-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false); }}>
      <div className="mycatalog-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="global-confirm-title" aria-describedby="global-confirm-description">
        <div className={`mycatalog-confirm-icon ${pending.danger ? "danger" : ""}`}><AlertTriangle size={21}/></div>
        <h3 id="global-confirm-title">{pending.title}</h3>
        <p id="global-confirm-description" className="muted">{pending.description}</p>
        <div className="mycatalog-confirm-actions">
          <button className="btn ghost" type="button" onClick={() => finish(false)}>{pending.cancelLabel}</button>
          <button className={`btn ${pending.danger ? "danger" : "primary"}`} type="button" autoFocus onClick={() => finish(true)}>{pending.confirmLabel}</button>
        </div>
      </div>
    </div>}
  </ConfirmContext.Provider>;
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm precisa estar dentro de ConfirmProvider");
  return context;
}
