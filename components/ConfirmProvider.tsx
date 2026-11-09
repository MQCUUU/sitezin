"use client";

import { AlertTriangle } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /**
   * Preferência "Não mostrar novamente" (localStorage). Se a chave estiver em "1",
   * a confirmação é pulada e a ação segue direto. Quando o usuário marca o checkbox
   * e confirma, a chave passa a "1". Usa a mesma chave que as telas de biblioteca.
   */
  skipKey?: string;
};
type PendingConfirm = ConfirmOptions & { resolve: (answer: boolean) => void };
const ConfirmContext = createContext<((options: ConfirmOptions | string) => Promise<boolean>) | null>(null);

function isSkipped(key?: string): boolean {
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Fase 5: o Dialog anima a saída; o texto da última confirmação fica até ele sumir.
  const [shown, setShown] = useState<PendingConfirm | null>(null);
  if (pending && pending !== shown) setShown(pending);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const [skipChecked, setSkipChecked] = useState(false);
  const skipCheckedRef = useRef(false);

  const finish = useCallback((answer: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    if (answer && current.skipKey && skipCheckedRef.current) {
      try {
        window.localStorage.setItem(current.skipKey, "1");
      } catch {
        // localStorage indisponível: a preferência só vale para esta ação
      }
    }
    pendingRef.current = null;
    skipCheckedRef.current = false;
    setSkipChecked(false);
    setPending(null);
    current.resolve(answer);
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string) => new Promise<boolean>((resolve) => {
    const opts: ConfirmOptions = typeof options === "string" ? { description: options } : options;
    if (isSkipped(opts.skipKey)) {
      resolve(true);
      return;
    }
    if (pendingRef.current) pendingRef.current.resolve(false);
    const next: PendingConfirm = { title: "Confirmar ação", confirmLabel: "Confirmar", cancelLabel: "Cancelar", danger: true, ...opts, resolve };
    pendingRef.current = next;
    skipCheckedRef.current = false;
    setSkipChecked(false);
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
        {shown && (
          <>
            <div className={cx("mc-confirm-icon", shown.danger && "mc-confirm-icon--danger")}>
              <AlertTriangle size={22} />
            </div>
            <h3 id="global-confirm-title">{shown.title}</h3>
            <p id="global-confirm-description" className="mc-confirm-description">
              {shown.description}
            </p>
            {shown.skipKey && (
              <label className="mycatalog-confirm-option">
                <input
                  type="checkbox"
                  checked={skipChecked}
                  onChange={(event) => {
                    skipCheckedRef.current = event.target.checked;
                    setSkipChecked(event.target.checked);
                  }}
                />
                <span>Não mostrar novamente</span>
              </label>
            )}
            <div className="mc-confirm-actions">
              <Button variant="ghost" type="button" onClick={() => finish(false)}>
                {shown.cancelLabel}
              </Button>
              <Button
                variant={shown.danger ? "danger" : "primary"}
                type="button"
                autoFocus
                onClick={() => finish(true)}
              >
                {shown.confirmLabel}
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
