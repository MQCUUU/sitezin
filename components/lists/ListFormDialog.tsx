"use client";

import { apiFetch, errorMessage } from "@/lib/api-client";
import { useEffect, useId, useState } from "react";
import { Globe, Loader2, Lock, X } from "lucide-react";

import { useDialogFocus } from "./useDialogFocus";
import { Dialog } from "@/components/ui/Dialog";
import { DESCRIPTION_MAX, NAME_MAX } from "@/lib/lists/validate";

/*
 * Criar / editar lista: nome, descrição opcional e privacidade. Privada é o padrão.
 * Reorganizar os títulos fica fora daqui (modo próprio no detalhe).
 */
export type ListFormValue = { id?: string; name: string; description: string | null; is_public: boolean };

export function ListFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: ListFormValue | null;
  onClose: () => void;
  onSaved: (saved: ListFormValue & { id: string }) => void;
}) {
  const titleId = useId();
  const { close, fieldRef } = useDialogFocus<HTMLInputElement>(open, onClose);
  const editing = Boolean(initial?.id);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setIsPublic(Boolean(initial?.is_public));
    setError(null);
    // Só ao abrir: re-renders do pai não podem apagar o que está sendo digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (name.trim().length < 2) {
      setError("Dê um nome com pelo menos 2 caracteres.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await apiFetch("/api/lists", {
        method: editing ? "PATCH" : "POST",
        json: { ...(editing ? { id: initial?.id } : {}), name, description, is_public: isPublic },
      });
      onSaved(result);
    } catch (error) {
      // Fase 6: a mensagem diz a causa (validação do servidor, sessão, rede…) — antes, todo erro de rede
      // e de resposta inválida virava "Verifique sua conexão".
      setError(errorMessage(error, "Não foi possível salvar a lista."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} labelledBy={titleId} className="lst-dialog">
      <form onSubmit={submit} className="lst-form" noValidate>
        <header className="lst-dialog-head">
          <h2 id={titleId}>{editing ? "Editar lista" : "Nova lista"}</h2>
          <button type="button" className="lst-icon-btn" onClick={close} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <label className="lst-field">
          <span>Nome</span>
          <input value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Maratona de outubro" ref={fieldRef} required aria-invalid={Boolean(error)} />
        </label>

        <label className="lst-field">
          <span>
            Descrição <small>(opcional)</small>
          </span>
          <textarea value={description} maxLength={DESCRIPTION_MAX} rows={3} onChange={(event) => setDescription(event.target.value)} placeholder="Sobre o que é esta seleção?" />
          <small className="lst-counter">
            {description.length}/{DESCRIPTION_MAX}
          </small>
        </label>

        <fieldset className="lst-privacy">
          <legend>Quem pode ver</legend>
          <label className={!isPublic ? "is-active" : ""}>
            <input type="radio" name="privacy" checked={!isPublic} onChange={() => setIsPublic(false)} />
            <Lock size={16} aria-hidden="true" />
            <span>
              <b>Privada</b>
              <small>Só você vê esta lista.</small>
            </span>
          </label>
          <label className={isPublic ? "is-active" : ""}>
            <input type="radio" name="privacy" checked={isPublic} onChange={() => setIsPublic(true)} />
            <Globe size={16} aria-hidden="true" />
            <span>
              <b>Pública</b>
              <small>Aparece no seu perfil e qualquer pessoa com o link pode ver.</small>
            </span>
          </label>
        </fieldset>

        {error ? (
          <p className="lst-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="lst-dialog-actions">
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
            {editing ? "Salvar" : "Criar lista"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
