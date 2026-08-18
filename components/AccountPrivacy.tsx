"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  ShieldCheck,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";

import {
  createClient,
} from "@/lib/supabase/client";

import {
  useToast,
} from "@/components/ToastProvider";

import {
  apiFetch,
  errorMessage,
} from "@/lib/api-client";

type HiddenTitle = {
  id:
    string;

  tmdb_id:
    number;

  media_type:
    "movie" |
    "tv";

  reason:
    string;

  created_at:
    string;

  title:
    string;

  poster_path:
    string |
    null;

  year:
    string;

  vote_average:
    number |
    null;
};

type AccountData = {
  id:
    string;

  email:
    string;

  displayName:
    string;

  visibility:
    "private" |
    "public";
};

function initials(
  name:
    string,
  email:
    string
) {
  const source =
    name.trim() ||
    email
      .split(
        "@"
      )[0] ||
    "MC";

  const parts =
    source
      .split(
        /\s+/
      )
      .filter(
        Boolean
      );

  if (
    parts.length >
    1
  ) {
    return (
      parts[0][0] +
      parts[
        parts.length -
        1
      ][0]
    ).toUpperCase();
  }

  return source
    .slice(
      0,
      2
    )
    .toUpperCase();
}

export function AccountPrivacy() {
  const toast =
    useToast();

  const [
    account,
    setAccount,
  ] =
    useState<
      AccountData |
      null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    displayName,
    setDisplayName,
  ] =
    useState("");

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    currentPassword,
    setCurrentPassword,
  ] =
    useState("");

  const [
    newPassword,
    setNewPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    showPasswords,
    setShowPasswords,
  ] =
    useState(
      false
    );

  const [
    savingProfile,
    setSavingProfile,
  ] =
    useState(
      false
    );

  const [
    savingEmail,
    setSavingEmail,
  ] =
    useState(
      false
    );

  const [
    savingPassword,
    setSavingPassword,
  ] =
    useState(
      false
    );

  const [
    hidden,
    setHidden,
  ] =
    useState<
      HiddenTitle[]
    >([]);

  const [
    hiddenLoading,
    setHiddenLoading,
  ] =
    useState(
      true
    );

  const [
    hiddenError,
    setHiddenError,
  ] =
    useState("");

  const [
    removingHidden,
    setRemovingHidden,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    deleteOpen,
    setDeleteOpen,
  ] =
    useState(
      false
    );

  const [
    deleteConfirm,
    setDeleteConfirm,
  ] =
    useState("");

  const [
    deleting,
    setDeleting,
  ] =
    useState(
      false
    );

  const passwordStrength =
    useMemo(
      () => {
        let score =
          0;

        if (
          newPassword.length >=
          8
        ) {
          score++;
        }

        if (
          /[A-Z]/.test(
            newPassword
          )
        ) {
          score++;
        }

        if (
          /[0-9]/.test(
            newPassword
          )
        ) {
          score++;
        }

        if (
          /[^A-Za-z0-9]/.test(
            newPassword
          )
        ) {
          score++;
        }

        return score;
      },
      [
        newPassword,
      ]
    );

  async function loadAccount() {
    try {
      setLoading(
        true
      );

      const s =
        createClient();

      const {
        data: {
          user,
        },
        error,
      } =
        await s.auth.getUser();

      if (
        error
      ) {
        throw error;
      }

      if (
        !user
      ) {
        setAccount(
          null
        );

        return;
      }

      const next = {
        id:
          user.id,

        email:
          user.email ||
          "",

        displayName:
          user.user_metadata
            ?.display_name ||
          user.user_metadata
            ?.full_name ||
          user.user_metadata
            ?.name ||
          user.email
            ?.split(
              "@"
            )[0] ||
          "",

        visibility:
          user.user_metadata
            ?.profile_visibility ===
          "public"
            ? "public"
            : "private",
      } as AccountData;

      setAccount(
        next
      );

      setDisplayName(
        next.displayName
      );

      setEmail(
        next.email
      );
    } catch (
      error
    ) {
      toast.error(
        "Não foi possível carregar sua conta",
        {
          description:
            errorMessage(
              error
            ),
        }
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  async function loadHidden() {
    try {
      setHiddenLoading(
        true
      );

      setHiddenError(
        ""
      );

      const data =
        await apiFetch<
          HiddenTitle[]
        >(
          "/api/account/hidden-titles",
          {
            cache:
              "no-store",
          }
        );

      setHidden(
        Array.isArray(
          data
        )
          ? data
          : []
      );
    } catch (
      error
    ) {
      setHiddenError(
        errorMessage(
          error,
          "Não foi possível carregar os títulos ocultos."
        )
      );
    } finally {
      setHiddenLoading(
        false
      );
    }
  }

  useEffect(() => {
    loadAccount();

    loadHidden();
  }, []);

  async function saveName(
    event:
      FormEvent
  ) {
    event.preventDefault();

    const clean =
      displayName.trim();

    if (
      clean.length <
      2
    ) {
      toast.error(
        "Nome muito curto"
      );

      return;
    }

    try {
      setSavingProfile(
        true
      );

      const s =
        createClient();

      const {
        data,
        error,
      } =
        await s.auth.updateUser({
          data: {
            display_name:
              clean,

            profile_visibility:
              account
                ?.visibility ||
              "private",
          },
        });

      if (
        error
      ) {
        throw error;
      }

      setAccount(
        (
          current
        ) =>
          current
            ? {
                ...current,

                displayName:
                  clean,
              }
            : current
      );

      toast.success(
        "Nome atualizado"
      );

      /*
       * Faz AccountMenu/Home perceberem o metadata novo.
       */
      window.dispatchEvent(
        new Event(
          "mycatalog:account-updated"
        )
      );
    } catch (
      error
    ) {
      toast.error(
        "Não foi possível atualizar o nome",
        {
          description:
            errorMessage(
              error
            ),
        }
      );
    } finally {
      setSavingProfile(
        false
      );
    }
  }

  async function changeVisibility(
    visibility:
      "private" |
      "public"
  ) {
    const previous =
      account
        ?.visibility ||
      "private";

    setAccount(
      (
        current
      ) =>
        current
          ? {
              ...current,
              visibility,
            }
          : current
    );

    try {
      const {
        error,
      } =
        await createClient()
          .auth
          .updateUser({
            data: {
              display_name:
                displayName.trim() ||
                account
                  ?.displayName ||
                "",

              profile_visibility:
                visibility,
            },
          });

      if (
        error
      ) {
        throw error;
      }

      toast.success(
        visibility ===
          "private"
          ? "Perfil definido como privado"
          : "Perfil definido como público",
        {
          description:
            visibility ===
            "private"
              ? "Seu catálogo não ficará disponível em futuros recursos públicos."
              : "Seu perfil poderá ser usado em recursos sociais quando eles forem ativados.",
        }
      );
    } catch (
      error
    ) {
      setAccount(
        (
          current
        ) =>
          current
            ? {
                ...current,
                visibility:
                  previous,
              }
            : current
      );

      toast.error(
        "Não foi possível salvar a privacidade",
        {
          description:
            errorMessage(
              error
            ),
        }
      );
    }
  }

  async function saveEmail(
    event:
      FormEvent
  ) {
    event.preventDefault();

    const clean =
      email
        .trim()
        .toLowerCase();

    if (
      !clean.includes(
        "@"
      )
    ) {
      toast.error(
        "Digite um e-mail válido"
      );

      return;
    }

    if (
      clean ===
      account?.email
    ) {
      toast.info(
        "Esse já é o seu e-mail"
      );

      return;
    }

    try {
      setSavingEmail(
        true
      );

      const {
        data,
        error,
      } =
        await createClient()
          .auth
          .updateUser({
            email:
              clean,
          });

      if (
        error
      ) {
        throw error;
      }

      toast.success(
        "Confirme o novo e-mail",
        {
          description:
            "Por segurança, o Supabase pode enviar uma confirmação antes de concluir a troca.",
        }
      );

      /*
       * Não assumimos que a mudança foi aplicada
       * imediatamente: projetos Supabase podem exigir
       * confirmação do endereço novo.
       */
      if (
        data.user
          ?.email ===
        clean
      ) {
        setAccount(
          (
            current
          ) =>
            current
              ? {
                  ...current,
                  email:
                    clean,
                }
              : current
        );
      }
    } catch (
      error
    ) {
      toast.error(
        "Não foi possível alterar o e-mail",
        {
          description:
            errorMessage(
              error
            ),
        }
      );
    } finally {
      setSavingEmail(
        false
      );
    }
  }

  async function savePassword(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      newPassword.length <
      8
    ) {
      toast.error(
        "Use pelo menos 8 caracteres"
      );

      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      toast.error(
        "As senhas novas não são iguais"
      );

      return;
    }

    try {
      setSavingPassword(
        true
      );

      const s =
        createClient();

      /*
       * Se o usuário informou a senha atual,
       * fazemos uma reautenticação simples antes.
       * Isso também evita trocar a senha caso ele
       * tenha digitado a senha atual errada.
       */
      if (
        currentPassword &&
        account?.email
      ) {
        const {
          error:
            signInError,
        } =
          await s.auth
            .signInWithPassword({
              email:
                account.email,

              password:
                currentPassword,
            });

        if (
          signInError
        ) {
          throw new Error(
            "A senha atual está incorreta."
          );
        }
      }

      const {
        error,
      } =
        await s.auth
          .updateUser({
            password:
              newPassword,
          });

      if (
        error
      ) {
        throw error;
      }

      setCurrentPassword(
        ""
      );

      setNewPassword(
        ""
      );

      setConfirmPassword(
        ""
      );

      toast.success(
        "Senha alterada com sucesso"
      );
    } catch (
      error
    ) {
      toast.error(
        "Não foi possível alterar a senha",
        {
          description:
            errorMessage(
              error
            ),
        }
      );
    } finally {
      setSavingPassword(
        false
      );
    }
  }

  async function restoreHidden(
    item:
      HiddenTitle
  ) {
    try {
      setRemovingHidden(
        item.id
      );

      const params =
        new URLSearchParams({
          tmdb_id:
            String(
              item.tmdb_id
            ),

          media_type:
            item.media_type,
        });

      await apiFetch(
        `/api/not-interested?${params.toString()}`,
        {
          method:
            "DELETE",

          retries:
            0,
        }
      );

      setHidden(
        (
          current
        ) =>
          current.filter(
            (
              entry
            ) =>
              entry.id !==
              item.id
          )
      );

      toast.success(
        `${item.title} pode aparecer novamente`,
        {
          description:
            "O título voltou a ser elegível para recomendações.",
        }
      );
    } catch (
      error
    ) {
      toast.error(
        "Não foi possível restaurar o título",
        {
          description:
            errorMessage(
              error
            ),
        }
      );
    } finally {
      setRemovingHidden(
        null
      );
    }
  }

  async function deleteAccount() {
    if (
      deleteConfirm !==
      "EXCLUIR"
    ) {
      return;
    }

    try {
      setDeleting(
        true
      );

      await apiFetch(
        "/api/account/delete",
        {
          method:
            "DELETE",

          retries:
            0,

          timeout:
            30000,
        }
      );

      await createClient()
        .auth
        .signOut();

      location.href =
        "/?account=deleted";
    } catch (
      error
    ) {
      toast.error(
        "Não foi possível excluir sua conta",
        {
          description:
            errorMessage(
              error
            ),
        }
      );

      setDeleting(
        false
      );
    }
  }

  if (
    loading
  ) {
    return (
      <section className="panel settings-panel account-settings-panel">
        <div className="account-settings-loading">
          <Loader2
            size={19}
            className="spin"
          />

          Carregando sua conta...
        </div>
      </section>
    );
  }

  if (
    !account
  ) {
    return (
      <section className="panel settings-panel account-settings-panel">
        <div className="account-settings-empty">
          <LockKeyhole
            size={22}
          />

          <div>
            <strong>
              Entre para gerenciar sua conta
            </strong>

            <span>
              Preferências da conta só ficam disponíveis para usuários autenticados.
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        id="account"
        className="panel settings-panel account-settings-panel"
      >
        <div className="settings-panel-head">
          <div className="settings-icon">
            <UserRound
              size={19}
            />
          </div>

          <div>
            <h2>
              Conta
            </h2>

            <p className="muted">
              Nome, e-mail e informações usadas para identificar sua conta.
            </p>
          </div>
        </div>

        <div className="account-settings-identity">
          <div className="account-settings-avatar">
            {initials(
              displayName,
              email
            )}
          </div>

          <div>
            <strong>
              {
                account.displayName
              }
            </strong>

            <span>
              {
                account.email
              }
            </span>
          </div>

          <div className="account-settings-id">
            ID da conta
            <code>
              {account.id.slice(
                0,
                8
              )}
              …
            </code>
          </div>
        </div>

        <div className="account-settings-grid">
          <form
            className="account-settings-card"
            onSubmit={
              saveName
            }
          >
            <div className="account-settings-card-head">
              <UserRound
                size={17}
              />

              <div>
                <strong>
                  Nome de exibição
                </strong>

                <span>
                  É o nome mostrado no MyCatalog.
                </span>
              </div>
            </div>

            <label>
              <span>
                Nome
              </span>

              <input
                value={
                  displayName
                }
                maxLength={
                  60
                }
                onChange={(
                  event
                ) =>
                  setDisplayName(
                    event.target
                      .value
                  )
                }
              />
            </label>

            <button
              type="submit"
              className="btn"
              disabled={
                savingProfile ||
                displayName.trim() ===
                  account.displayName
              }
            >
              {savingProfile ? (
                <Loader2
                  size={14}
                  className="spin"
                />
              ) : (
                <Check
                  size={14}
                />
              )}

              Salvar nome
            </button>
          </form>

          <form
            className="account-settings-card"
            onSubmit={
              saveEmail
            }
          >
            <div className="account-settings-card-head">
              <Mail
                size={17}
              />

              <div>
                <strong>
                  E-mail
                </strong>

                <span>
                  Usado para entrar e recuperar a conta.
                </span>
              </div>
            </div>

            <label>
              <span>
                Novo e-mail
              </span>

              <input
                type="email"
                autoComplete="email"
                value={
                  email
                }
                onChange={(
                  event
                ) =>
                  setEmail(
                    event.target
                      .value
                  )
                }
              />
            </label>

            <button
              type="submit"
              className="btn"
              disabled={
                savingEmail ||
                email.trim() ===
                  account.email
              }
            >
              {savingEmail ? (
                <Loader2
                  size={14}
                  className="spin"
                />
              ) : (
                <Mail
                  size={14}
                />
              )}

              Alterar e-mail
            </button>
          </form>
        </div>
      </section>

      <section
        id="privacy"
        className="panel settings-panel account-settings-panel"
      >
        <div className="settings-panel-head">
          <div className="settings-icon">
            <ShieldCheck
              size={19}
            />
          </div>

          <div>
            <h2>
              Privacidade
            </h2>

            <p className="muted">
              Controle como seu perfil poderá aparecer em recursos sociais do MyCatalog.
            </p>
          </div>
        </div>

        <div className="account-privacy-options">
          <Link href="/profile" className="active">
            <UserRound size={18} />
            <div>
              <strong>Configurar no seu perfil</strong>
              <span>O perfil não é separado da conta. Escolha lá entre Público ou Somente amigos e edite sua vitrine.</span>
            </div>
          </Link>
        </div>
      </section>

      <section
        id="security"
        className="panel settings-panel account-settings-panel"
      >
        <div className="settings-panel-head">
          <div className="settings-icon">
            <KeyRound
              size={19}
            />
          </div>

          <div>
            <h2>
              Segurança
            </h2>

            <p className="muted">
              Troque sua senha sem precisar sair da conta.
            </p>
          </div>
        </div>

        <form
          className="account-password-form"
          onSubmit={
            savePassword
          }
        >
          <label>
            <span>
              Senha atual
            </span>

            <div className="account-password-input">
              <LockKeyhole
                size={15}
              />

              <input
                type={
                  showPasswords
                    ? "text"
                    : "password"
                }
                autoComplete="current-password"
                value={
                  currentPassword
                }
                onChange={(
                  event
                ) =>
                  setCurrentPassword(
                    event.target
                      .value
                  )
                }
                placeholder="Recomendado para confirmar sua identidade"
              />
            </div>
          </label>

          <label>
            <span>
              Nova senha
            </span>

            <div className="account-password-input">
              <KeyRound
                size={15}
              />

              <input
                type={
                  showPasswords
                    ? "text"
                    : "password"
                }
                autoComplete="new-password"
                value={
                  newPassword
                }
                onChange={(
                  event
                ) =>
                  setNewPassword(
                    event.target
                      .value
                  )
                }
                placeholder="Mínimo de 8 caracteres"
              />

              <button
                type="button"
                aria-label={
                  showPasswords
                    ? "Ocultar senhas"
                    : "Mostrar senhas"
                }
                onClick={() =>
                  setShowPasswords(
                    (
                      value
                    ) =>
                      !value
                  )
                }
              >
                {showPasswords ? (
                  <EyeOff
                    size={15}
                  />
                ) : (
                  <Eye
                    size={15}
                  />
                )}
              </button>
            </div>

            {newPassword && (
              <div className="account-password-strength">
                <span>
                  {[
                    1,
                    2,
                    3,
                    4,
                  ].map(
                    (
                      level
                    ) => (
                      <i
                        key={
                          level
                        }
                        className={
                          passwordStrength >=
                          level
                            ? "active"
                            : ""
                        }
                      />
                    )
                  )}
                </span>

                <small>
                  {passwordStrength <=
                  1
                    ? "Fraca"
                    : passwordStrength ===
                        2
                      ? "Razoável"
                      : passwordStrength ===
                          3
                        ? "Boa"
                        : "Forte"}
                </small>
              </div>
            )}
          </label>

          <label>
            <span>
              Confirmar nova senha
            </span>

            <div className="account-password-input">
              <Check
                size={15}
              />

              <input
                type={
                  showPasswords
                    ? "text"
                    : "password"
                }
                autoComplete="new-password"
                value={
                  confirmPassword
                }
                onChange={(
                  event
                ) =>
                  setConfirmPassword(
                    event.target
                      .value
                  )
                }
              />
            </div>
          </label>

          <button
            type="submit"
            className="btn primary"
            disabled={
              savingPassword ||
              newPassword.length <
                8 ||
              newPassword !==
                confirmPassword
            }
          >
            {savingPassword ? (
              <Loader2
                size={14}
                className="spin"
              />
            ) : (
              <KeyRound
                size={14}
              />
            )}

            Alterar senha
          </button>
        </form>
      </section>

      <section
        id="hidden-titles"
        className="panel settings-panel account-settings-panel"
      >
        <div className="settings-panel-head">
          <div className="settings-icon">
            <EyeOff
              size={19}
            />
          </div>

          <div>
            <h2>
              Não tenho interesse
            </h2>

            <p className="muted">
              Títulos dessa lista deixam de aparecer nas recomendações personalizadas.
            </p>
          </div>

          {!hiddenLoading && (
            <span className="account-hidden-count">
              {
                hidden.length
              }
            </span>
          )}
        </div>

        {hiddenLoading ? (
          <div className="account-settings-loading small">
            <Loader2
              size={17}
              className="spin"
            />

            Carregando títulos...
          </div>
        ) : hiddenError ? (
          <div className="account-hidden-error">
            <span>
              {
                hiddenError
              }
            </span>

            <button
              type="button"
              className="btn"
              onClick={
                loadHidden
              }
            >
              Tentar novamente
            </button>
          </div>
        ) : hidden.length ===
          0 ? (
          <div className="account-hidden-empty">
            <Eye
              size={22}
            />

            <div>
              <strong>
                Nenhum título oculto
              </strong>

              <span>
                Quando marcar “Não tenho interesse”, ele aparecerá aqui.
              </span>
            </div>
          </div>
        ) : (
          <div className="account-hidden-list">
            {hidden.map(
              (
                item
              ) => (
                <article
                  key={
                    item.id
                  }
                  className="account-hidden-item"
                >
                  <div className="account-hidden-poster">
                    {item.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w154${item.poster_path}`}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <div>
                        {item.media_type ===
                        "tv"
                          ? "S"
                          : "F"}
                      </div>
                    )}
                  </div>

                  <div className="account-hidden-copy">
                    <strong>
                      {
                        item.title
                      }
                    </strong>

                    <span>
                      {item.media_type ===
                      "tv"
                        ? "Série"
                        : "Filme"}

                      {item.year
                        ? ` · ${item.year}`
                        : ""}

                      {item.vote_average
                        ? ` · ★ ${item.vote_average.toFixed(
                            1
                          )}`
                        : ""}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    disabled={
                      removingHidden ===
                      item.id
                    }
                    onClick={() =>
                      restoreHidden(
                        item
                      )
                    }
                  >
                    {removingHidden ===
                    item.id ? (
                      <Loader2
                        size={14}
                        className="spin"
                      />
                    ) : (
                      <Undo2
                        size={14}
                      />
                    )}

                    Voltar a recomendar
                  </button>
                </article>
              )
            )}
          </div>
        )}
      </section>

      <section
        id="danger-zone"
        className="panel settings-panel account-settings-panel account-danger-zone"
      >
        <div className="settings-panel-head">
          <div className="settings-icon danger">
            <AlertTriangle
              size={19}
            />
          </div>

          <div>
            <h2>
              Zona de risco
            </h2>

            <p className="muted">
              A exclusão da conta é permanente.
            </p>
          </div>
        </div>

        <div className="account-delete-row">
          <div>
            <strong>
              Excluir minha conta
            </strong>

            <span>
              Remove sua conta, biblioteca, notas, histórico e preferências vinculadas ao usuário.
            </span>
          </div>

          <button
            type="button"
            className="btn danger"
            onClick={() =>
              setDeleteOpen(
                true
              )
            }
          >
            <Trash2
              size={14}
            />

            Excluir conta
          </button>
        </div>
      </section>

      {deleteOpen && (
        <div
          className="mycatalog-confirm-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget &&
              !deleting
            ) {
              setDeleteOpen(
                false
              );

              setDeleteConfirm(
                ""
              );
            }
          }}
        >
          <div className="mycatalog-confirm-modal account-delete-modal">
            <div className="mycatalog-confirm-icon danger">
              <Trash2
                size={20}
              />
            </div>

            <div className="eyebrow">
              EXCLUSÃO PERMANENTE
            </div>

            <h3>
              Excluir sua conta do MyCatalog?
            </h3>

            <p className="muted">
              Essa ação não tem Desfazer. Exporte um backup antes se quiser guardar seus dados.
            </p>

            <label className="account-delete-confirm-field">
              <span>
                Digite <strong>EXCLUIR</strong> para confirmar
              </span>

              <input
                autoFocus
                value={
                  deleteConfirm
                }
                disabled={
                  deleting
                }
                onChange={(
                  event
                ) =>
                  setDeleteConfirm(
                    event.target
                      .value
                      .toUpperCase()
                  )
                }
                placeholder="EXCLUIR"
              />
            </label>

            <div className="mycatalog-confirm-actions">
              <button
                type="button"
                className="btn"
                disabled={
                  deleting
                }
                onClick={() => {
                  setDeleteOpen(
                    false
                  );

                  setDeleteConfirm(
                    ""
                  );
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn danger"
                disabled={
                  deleting ||
                  deleteConfirm !==
                    "EXCLUIR"
                }
                onClick={
                  deleteAccount
                }
              >
                {deleting ? (
                  <Loader2
                    size={14}
                    className="spin"
                  />
                ) : (
                  <Trash2
                    size={14}
                  />
                )}

                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
