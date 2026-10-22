"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Trash2,
  UserRound,
} from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { useToast } from "@/components/ToastProvider";
import { Dialog } from "@/components/ui/Dialog";
import { apiFetch, errorMessage } from "@/lib/api-client";

/*
 * Configurações → Conta e privacidade (parte "conta"). A privacidade social
 * (perfil público/privado, quem segue, quem vê cada seção) fica logo abaixo,
 * em SocialSettings — uma única fonte, sem atalho paralelo.
 *
 * V3.3:
 *  - sem "ID da conta" (não servia ao usuário: nem suporte, nem cópia);
 *  - e-mail é só leitura e diz por quê (antes: formulário que parecia
 *    funcionar e só mostrava um aviso ao enviar);
 *  - senha atual obrigatória (a API exige; o campo dizia "Recomendado");
 *  - "Não tenho interesse" mudou para Streaming (é preferência de
 *    recomendação, não de conta);
 *  - exclusão num diálogo acessível (Esc, foco preso, devolve o foco).
 */

type AccountData = {
  email: string;
  displayName: string;
};

function initials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "MC";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

  return source.slice(0, 2).toUpperCase();
}

export function AccountPrivacy() {
  const toast = useToast();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const passwordStrength = useMemo(() => {
    let score = 0;

    if (newPassword.length >= 8) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;

    return score;
  }, [newPassword]);

  useEffect(() => {
    let alive = true;

    authClient
      .getSession()
      .then((res) => {
        const user = res?.data?.user;

        if (!alive) return;
        if (!user) {
          setAccount(null);
          return;
        }

        const next = { email: user.email || "", displayName: user.name || user.email?.split("@")[0] || "" };

        setAccount(next);
        setDisplayName(next.displayName);
      })
      .catch((error) => {
        if (alive) toast.error("Não foi possível carregar sua conta", { description: errorMessage(error) });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveName(event: FormEvent) {
    event.preventDefault();

    const clean = displayName.trim();

    if (clean.length < 2) {
      toast.error("Nome muito curto", { description: "Use pelo menos 2 caracteres." });
      return;
    }

    try {
      setSavingProfile(true);

      const updateRes = await authClient.updateUser({ name: clean });

      if (updateRes.error) throw updateRes.error;

      setAccount((current) => (current ? { ...current, displayName: clean } : current));

      // O nome público do perfil acompanha o nome da conta. Fase 6: antes a falha era engolida
      // (.catch(() => {})) e o aviso dizia "salvo" com o perfil público desatualizado.
      try {
        await apiFetch("/api/auth/profile", { method: "PATCH", json: { display_name: clean } });
        toast.success("Nome de exibição salvo.");
      } catch (profileError) {
        toast.error("Nome da conta salvo, mas o perfil público não foi atualizado", {
          description: errorMessage(profileError, "Tente salvar de novo em instantes."),
        });
      }
      // Faz AccountMenu/Home perceberem o nome novo.
      window.dispatchEvent(new Event("mycatalog:account-updated"));
    } catch (error) {
      toast.error("Não foi possível salvar o nome", { description: errorMessage(error) });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();

    if (!currentPassword) {
      toast.error("Digite sua senha atual");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Use pelo menos 8 caracteres na nova senha");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação não é igual à nova senha");
      return;
    }

    try {
      setSavingPassword(true);

      const res = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });

      if (res.error) throw new Error(res.error.message || "A senha atual está incorreta ou a nova senha é inválida.");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada.", {
        description: "Você continua conectado aqui; os outros aparelhos foram desconectados.",
      });
    } catch (error) {
      toast.error("Não foi possível alterar a senha", { description: errorMessage(error) });
    } finally {
      setSavingPassword(false);
    }
  }

  function closeDelete() {
    if (deleting) return;

    setDeleteOpen(false);
    setDeleteConfirm("");
  }

  async function deleteAccount() {
    if (deleteConfirm !== "EXCLUIR") return;

    try {
      setDeleting(true);
      await apiFetch("/api/account/delete", { method: "DELETE", retries: 0, timeout: 30000 });

      try {
        await authClient.signOut();
      } catch {
        // a conta já não existe; a sessão local é descartada pelo redirect
      }

      location.href = "/?account=deleted";
    } catch (error) {
      toast.error("Não foi possível excluir sua conta", { description: errorMessage(error) });
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <section className="panel settings-panel account-settings-panel">
        <div className="account-settings-loading" role="status">
          <Loader2 size={19} className="spin" aria-hidden="true" />
          Carregando sua conta…
        </div>
      </section>
    );
  }

  if (!account) {
    return (
      <section className="panel settings-panel account-settings-panel">
        <div className="account-settings-empty">
          <LockKeyhole size={22} aria-hidden="true" />
          <div>
            <strong>Entre para gerenciar sua conta</strong>
            <span>Preferências da conta só ficam disponíveis para usuários autenticados.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section id="account" className="panel settings-panel account-settings-panel" aria-labelledby="account-title">
        <div className="settings-panel-head">
          <div className="settings-icon">
            <UserRound size={19} aria-hidden="true" />
          </div>
          <div>
            <h2 id="account-title">Conta</h2>
            <p className="muted">
              Seu nome e e-mail. Foto, bio, @ e Top 5 ficam no{" "}
              <Link href="/profile">seu perfil</Link>.
            </p>
          </div>
        </div>

        <div className="account-settings-identity">
          <div className="account-settings-avatar" aria-hidden="true">
            {initials(displayName, account.email)}
          </div>
          <div>
            <strong>{account.displayName}</strong>
            <span>{account.email}</span>
          </div>
        </div>

        <div className="account-settings-grid">
          <form className="account-settings-card" onSubmit={saveName}>
            <div className="account-settings-card-head">
              <UserRound size={17} aria-hidden="true" />
              <div>
                <strong>Nome de exibição</strong>
                <span>Aparece no seu perfil e para quem você segue.</span>
              </div>
            </div>
            <label>
              <span>Nome</span>
              <input value={displayName} maxLength={60} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <button
              type="submit"
              className="btn"
              disabled={savingProfile || displayName.trim() === account.displayName}
            >
              {savingProfile ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              Salvar nome
            </button>
          </form>

          <div className="account-settings-card">
            <div className="account-settings-card-head">
              <Mail size={17} aria-hidden="true" />
              <div>
                <strong>E-mail</strong>
                <span>Usado para entrar e recuperar a conta. Só você vê.</span>
              </div>
            </div>
            <label>
              <span>E-mail da conta</span>
              <input type="email" value={account.email} readOnly aria-readonly="true" />
            </label>
            <p className="muted account-settings-note">
              Por segurança, o provedor de login mantém o e-mail do cadastro — ele não pode ser trocado por aqui.
            </p>
          </div>
        </div>
      </section>

      <section id="security" className="panel settings-panel account-settings-panel" aria-labelledby="security-title">
        <div className="settings-panel-head">
          <div className="settings-icon">
            <KeyRound size={19} aria-hidden="true" />
          </div>
          <div>
            <h2 id="security-title">Senha</h2>
            <p className="muted">Ao trocar, você continua conectado aqui e os outros aparelhos são desconectados.</p>
          </div>
        </div>

        <form className="account-password-form" onSubmit={savePassword}>
          <label>
            <span>Senha atual</span>
            <div className="account-password-input">
              <LockKeyhole size={15} aria-hidden="true" />
              <input
                type={showPasswords ? "text" : "password"}
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
          </label>

          <label>
            <span>Nova senha</span>
            <div className="account-password-input">
              <KeyRound size={15} aria-hidden="true" />
              <input
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
              <button
                type="button"
                aria-label={showPasswords ? "Ocultar senhas" : "Mostrar senhas"}
                aria-pressed={showPasswords}
                onClick={() => setShowPasswords((value) => !value)}
              >
                {showPasswords ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              </button>
            </div>
            {newPassword && (
              <div className="account-password-strength">
                <span aria-hidden="true">
                  {[1, 2, 3, 4].map((level) => (
                    <i key={level} className={passwordStrength >= level ? "active" : ""} />
                  ))}
                </span>
                <small>
                  {passwordStrength <= 1 ? "Fraca" : passwordStrength === 2 ? "Razoável" : passwordStrength === 3 ? "Boa" : "Forte"}
                </small>
              </div>
            )}
          </label>

          <label>
            <span>Confirmar nova senha</span>
            <div className="account-password-input">
              <Check size={15} aria-hidden="true" />
              <input
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
          </label>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="set-error" role="alert">
              A confirmação não é igual à nova senha.
            </p>
          )}

          <button
            type="submit"
            className="btn primary"
            disabled={savingPassword || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
          >
            {savingPassword ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
            Alterar senha
          </button>
        </form>
      </section>

      <section
        id="danger-zone"
        className="panel settings-panel account-settings-panel account-danger-zone"
        aria-labelledby="danger-title"
      >
        <div className="settings-panel-head">
          <div className="settings-icon danger">
            <AlertTriangle size={19} aria-hidden="true" />
          </div>
          <div>
            <h2 id="danger-title">Zona de risco</h2>
            <p className="muted">A exclusão da conta é permanente.</p>
          </div>
        </div>

        <div className="account-delete-row">
          <div>
            <strong>Excluir minha conta</strong>
            <span>
              Apaga sua conta e tudo que é seu: biblioteca, notas, resenhas, diário, progresso de séries, listas,
              seguidores, notificações e preferências.
            </span>
          </div>
          <button type="button" className="btn danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={14} aria-hidden="true" />
            Excluir conta
          </button>
        </div>
      </section>

      <Dialog
        open={deleteOpen}
        onClose={closeDelete}
        role="alertdialog"
        labelledBy="account-delete-title"
        describedBy="account-delete-desc"
        className="mycatalog-confirm-modal account-delete-modal"
      >
        <div className="mycatalog-confirm-icon danger" aria-hidden="true">
          <Trash2 size={20} />
        </div>
        <div className="eyebrow">EXCLUSÃO PERMANENTE</div>
        <h3 id="account-delete-title">Excluir sua conta do MyCatalog?</h3>
        <div id="account-delete-desc">
          <p className="muted">
            Isso apaga sua biblioteca, notas, resenhas, diário, progresso de séries, listas, seguidores e
            preferências, e encerra suas sessões. Não tem Desfazer.
          </p>
          <p className="muted">
            Quer guardar seus dados? Exporte um backup em <Link href="/settings?tab=data">Dados e backup</Link> antes.
          </p>
        </div>
        <label className="account-delete-confirm-field">
          <span>
            Digite <strong>EXCLUIR</strong> para confirmar
          </span>
          <input
            autoFocus
            value={deleteConfirm}
            disabled={deleting}
            onChange={(event) => setDeleteConfirm(event.target.value.toUpperCase())}
            placeholder="EXCLUIR"
          />
        </label>
        <div className="mycatalog-confirm-actions">
          <button type="button" className="btn" disabled={deleting} onClick={closeDelete}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={deleting || deleteConfirm !== "EXCLUIR"}
            onClick={deleteAccount}
          >
            {deleting ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
            Excluir definitivamente
          </button>
        </div>
      </Dialog>
    </>
  );
}
