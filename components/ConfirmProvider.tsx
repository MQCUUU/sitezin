"use client";

import { AlertTriangle } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!pending}
        onClose={() => finish(false)}
        role="alertdialog"
        labelledBy="global-confirm-title"
        describedBy="global-confirm-description"
        className="mc-confirm-dialog"
      >
        {pending && (
          <>
            <div className={cx("mc-confirm-icon", pending.danger && "mc-confirm-icon--danger")}>
              <AlertTriangle size={21} />
            </div>
            <h3 id="global-confirm-title">{pending.title}</h3>
            <p id="global-confirm-description" className="mc-confirm-description">
              {pending.description}
            </p>
            <div className="mc-confirm-actions">
              <Button variant="ghost" type="button" onClick={() => finish(false)}>
                {pending.cancelLabel}
              </Button>
              <Button
                variant={pending.danger ? "danger" : "primary"}
                type="button"
                autoFocus
                onClick={() => finish(true)}
              >
                {pending.confirmLabel}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm precisa estar dentro de ConfirmProvider");
  return context;
}
