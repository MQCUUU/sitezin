"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandMark";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Film,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

import { authClient } from "@/lib/auth/client";

import {
  useToast,
} from "@/components/ToastProvider";
import { authErrorMessage, authFormPasswordError, authRedirectOrigin, PASSWORD_HINT } from "@/lib/auth-client";
import { describeIntent, peekPendingAction, takePendingAction } from "@/lib/auth/pending-action";
import { runLibraryAction } from "@/lib/library/actions";
import { mediaStatusLabel } from "@/lib/media-status";
import { safeNextPath } from "@/lib/safe-next";

type Mode =
  | "login"
  | "signup";

function passwordScore(
  password:
    string
) {
  let score =
    0;

  if (
    password.length >=
    8
  ) {
    score++;
  }

  if (
    /[A-Z]/.test(
      password
    )
  ) {
    score++;
  }

  if (
    /[0-9]/.test(
      password
    )
  ) {
    score++;
  }

  if (
    /[^A-Za-z0-9]/.test(
      password
    )
  ) {
    score++;
  }

  return score;
}

function friendlyAuthError(
  message:
    string
) {
  const clean =
    message.toLowerCase();

  if (
    clean.includes(
      "invalid login credentials"
    )
  ) {
    return "E-mail ou senha incorretos.";
  }

  if (
    clean.includes(
      "user already registered"
    )
  ) {
    return "Já existe uma conta com este e-mail.";
  }

  if (
    clean.includes(
      "password should be"
    )
  ) {
    return "Sua senha ainda é muito curta.";
  }

  if (clean.includes("database error saving new user")) {
    return "Não foi possível criar o perfil. Atualize a página e tente novamente.";
  }

  if (
    clean.includes(
      "email not confirmed"
    )
  ) {
    return "Confirme seu e-mail antes de entrar.";
  }

  if (
    clean.includes(
      "rate limit"
    )
  ) {
    return "Muitas tentativas em pouco tempo. Aguarde um pouco.";
  }

  return message;
}

export function AuthPage({
  mode,
}: {
  mode:
    Mode;
}) {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const toast =
    useToast();

  const isSignup =
    mode ===
    "signup";

  // Fase 1: mesma validação do proxy (só caminhos internos; bloqueia "/\evil.com").
  const returnTo =
    safeNextPath(
      searchParams.get(
        "next"
      )
    );

  const sessionReason =
    searchParams.get(
      "reason"
    ) ===
    "session";

  /*
   * Fase 1 — ação pedida antes do login (Adicionar / Curtir / status). A tela
   * só a DESCREVE; a execução acontece uma vez, depois de entrar.
   */
  const [pendingDescription, setPendingDescription] = useState<string | null>(null);

  useEffect(() => {
    const pending = peekPendingAction();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage só existe no cliente
    setPendingDescription(pending && pending.return_to === returnTo ? describeIntent(pending, mediaStatusLabel) : null);
  }, [returnTo]);

  async function completePendingAction() {
    const pending = takePendingAction(returnTo);
    if (!pending) return;

    const what = describeIntent(pending, mediaStatusLabel);

    try {
      await runLibraryAction(pending);
      toast.success("Ação concluída", { description: `Feito: ${what}.` });
    } catch {
      toast.error("Não foi possível concluir a ação", { description: `Você entrou, mas não conseguimos ${what}. Tente de novo na página.` });
    }
  }

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [username, setUsername] = useState("");

  /*
   * Fase 0 — cadastro em dois passos (conta no Auth, depois perfil no banco).
   * Se o perfil falhar, a conta JÁ existe e a sessão já foi aberta: o próximo
   * envio só tenta o perfil de novo (idempotente), nunca recria a conta.
   */
  const [accountCreated, setAccountCreated] = useState(false);

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const score =
    useMemo(
      () =>
        passwordScore(
          password
        ),
      [
        password,
      ]
    );

  async function submit(
    event:
      FormEvent
  ) {
    event.preventDefault();

    setError(
      ""
    );

    if (
      isSignup &&
      name.trim().length <
        2
    ) {
      setError(
        "Digite seu nome."
      );

      return;
    }

    if (isSignup && !/^[a-z0-9_]{3,24}$/.test(username)) {
      setError("Escolha um @ de 3 a 24 letras, números ou _.");
      return;
    }

    if (
      !email.includes(
        "@"
      )
    ) {
      setError(
        "Digite um e-mail válido."
      );

      return;
    }

    // Fase 0 (P1-02): força da senha só no cadastro; no login o provedor decide.
    const passwordError = authFormPasswordError(isSignup ? "signup" : "login", password);
    if (passwordError) { setError(passwordError); return; }

    if (
      isSignup &&
      password !==
        confirmPassword
    ) {
      setError(
        "As senhas não são iguais."
      );

      return;
    }

    try {
      setLoading(
        true
      );

      if (
        isSignup
      ) {
        if (!accountCreated) {
          const usernameResponse = await fetch(`/api/auth/username?username=${encodeURIComponent(username)}`, { cache: "no-store" });
          const usernameData = await usernameResponse.json();
          if (!usernameResponse.ok || !usernameData.available) {
            throw new Error(usernameData.error || "Este @ de usuário já está em uso.");
          }

          const res = await authClient.signUp.email({
            email: email.trim(),
            password,
            name: name.trim(),
          });

          if (res.error) {
            throw new Error(authErrorMessage(res.error, "Erro ao criar conta."));
          }

          setAccountCreated(true);
        }

        const profileRes = await fetch("/api/auth/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            username,
          }),
        });

        const profileData = await profileRes.json().catch(() => ({}));
        if (!profileRes.ok) {
          // A conta existe: a mensagem diz isso e como concluir (sem recriar a conta).
          throw new Error(
            profileRes.status === 401
              ? "Sua conta foi criada, mas a sessão não foi confirmada. Entre com seu e-mail e senha para concluir o perfil."
              : `Sua conta foi criada, mas não conseguimos salvar seu perfil${profileData.error ? ` (${profileData.error})` : ""}. Clique em "Concluir cadastro" para tentar de novo.`
          );
        }

        toast.success(
          "Conta criada com sucesso"
        );

        await completePendingAction();

        router.replace(
          returnTo
        );

        router.refresh();

        return;
      }

      const res = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (res.error) {
        throw new Error(authErrorMessage(res.error, "E-mail ou senha incorretos."));
      }

      toast.success(
        "Bem-vindo de volta"
      );

      await completePendingAction();

      /*
       * replace evita o botão Voltar mandar a
       * pessoa novamente para o login.
       */
      router.replace(
        returnTo
      );

      router.refresh();
    } catch (
      error
    ) {
      // Fase 1 (P2-02): erro do provedor traduzido pelo código; mensagens nossas seguem como estão.
      const message =
        authErrorMessage(
          error as { code?: string; status?: number },
          friendlyAuthError(
            error instanceof Error
              ? error.message
              : "Não foi possível continuar."
          )
        );

      setError(
        message
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  return (
    // V3.5: <div> — o <main> já é do layout raiz (antes havia um main dentro do outro).
    <div className="auth-page">
      <Link
        href="/"
        className="auth-brand"
        aria-label="MyCatalog — página inicial"
      >
        <BrandLogo size={30} />
      </Link>

      <div className="auth-shell">
        <section className="auth-visual">
          <div className="auth-visual-badge">
            <Sparkles
              size={14}
            />

            SEU CATÁLOGO, DO SEU JEITO
          </div>

          <h1>
            {isSignup
              ? "Crie sua conta e comece sua coleção."
              : "Sua biblioteca está esperando por você."}
          </h1>

          <p>
            Organize filmes e séries, registre o que assistiu e receba recomendações baseadas no seu gosto.
          </p>

          <div className="auth-feature-list">
            <div>
              <span>
                <Film
                  size={17}
                />
              </span>

              <div>
                <strong>
                  Biblioteca pessoal
                </strong>

                <small>
                  Status, notas, curtidos e histórico.
                </small>
              </div>
            </div>

            <div>
              <span>
                <Sparkles
                  size={17}
                />
              </span>

              <div>
                <strong>
                  Descobertas melhores
                </strong>

                <small>
                  Para Você e Escolha pra mim.
                </small>
              </div>
            </div>

            <div>
              <span>
                <ShieldCheck
                  size={17}
                />
              </span>

              <div>
                <strong>
                  Seus dados são seus
                </strong>

                <small>
                  Exporte e faça backup quando quiser.
                </small>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card-head">
            <span className="eyebrow">
              {isSignup
                ? "NOVA CONTA"
                : "ENTRAR"}
            </span>

            <h2>
              {isSignup
                ? "Criar conta"
                : "Entrar no MyCatalog"}
            </h2>

            <p>
              {isSignup
                ? "Leva menos de um minuto."
                : "Continue de onde você parou."}
            </p>
          </div>

          {pendingDescription && (
            <div className="auth-session-notice" role="status">
              <LockKeyhole
                size={16}
              />

              <div>
                <strong>
                  {isSignup ? "Crie sua conta para continuar" : "Entre para continuar"}
                </strong>

                <span>
                  Depois do login, vamos {pendingDescription} e você volta para a página onde estava.
                </span>
              </div>
            </div>
          )}

          {sessionReason &&
            !pendingDescription &&
            !isSignup && (
            <div className="auth-session-notice">
              <LockKeyhole
                size={16}
              />

              <div>
                <strong>
                  Entre novamente
                </strong>

                <span>
                  Sua sessão terminou. Depois do login você volta automaticamente para a página anterior.
                </span>
              </div>
            </div>
          )}

          <form
            className="auth-form"
            onSubmit={
              submit
            }
          >
            {isSignup && (
              <>
              <label>
                <span>
                  Nome
                </span>

                <div className="auth-input">
                  <User
                    size={16}
                  />

                  <input
                    autoComplete="name"
                    value={
                      name
                    }
                    onChange={(
                      event
                    ) =>
                      setName(
                        event.target
                          .value
                      )
                    }
                    placeholder="Como devemos te chamar?"
                  />
                </div>
              </label>
              <label>
                <span>@ de usuário</span>
                <div className="auth-input">
                  <User size={16} />
                  <input
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="seu_usuario"
                    minLength={3}
                    maxLength={24}
                    required
                  />
                </div>
                <small className="muted">Seu perfil será mycatalog.com/u/{username || "seu_usuario"}</small>
              </label>
              </>
            )}

            <label>
              <span>
                E-mail
              </span>

              <div className="auth-input">
                <Mail
                  size={16}
                />

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
                  placeholder="voce@email.com"
                />
              </div>
            </label>

            <label>
              <div className="auth-label-row">
                <span>
                  Senha
                </span>

                {!isSignup && (
                  <Link href="/forgot-password">
                    Esqueci minha senha
                  </Link>
                )}
              </div>

              <div className="auth-input">
                <LockKeyhole
                  size={16}
                />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete={
                    isSignup
                      ? "new-password"
                      : "current-password"
                  }
                  value={
                    password
                  }
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target
                        .value
                    )
                  }
                  placeholder="Mínimo de 8 caracteres"
                />

                <button
                  type="button"
                  aria-label={
                    showPassword
                      ? "Ocultar senha"
                      : "Mostrar senha"
                  }
                  onClick={() =>
                    setShowPassword(
                      (
                        value
                      ) =>
                        !value
                    )
                  }
                >
                  {showPassword ? (
                    <EyeOff
                      size={16}
                    />
                  ) : (
                    <Eye
                      size={16}
                    />
                  )}
                </button>
              </div>
            </label>

            {isSignup && (
              <>
                <div className="auth-password-meter">
                  <span>
                    {[1,2,3,4].map(
                      (
                        level
                      ) => (
                        <i
                          key={
                            level
                          }
                          className={
                            score >=
                            level
                              ? "active"
                              : ""
                          }
                        />
                      )
                    )}
                  </span>

                  <small>
                    {score <=
                    1
                      ? "Senha básica"
                      : score ===
                          2
                        ? "Senha razoável"
                        : score ===
                            3
                          ? "Senha boa"
                          : "Senha forte"}
                  </small>
                </div>
                <small className="muted">{PASSWORD_HINT}</small>

                <label>
                  <span>
                    Confirmar senha
                  </span>

                  <div className="auth-input">
                    <Check
                      size={16}
                    />

                    <input
                      type={
                        showPassword
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
                      placeholder="Digite a senha novamente"
                    />
                  </div>
                </label>
              </>
            )}

            {error && (
              <div
                className="auth-error"
                role="alert"
              >
                {
                  error
                }
              </div>
            )}

            <button
              type="submit"
              className="btn primary auth-submit"
              disabled={
                loading
              }
            >
              {loading ? (
                <Loader2
                  size={17}
                  className="spin"
                />
              ) : (
                <ArrowRight
                  size={17}
                />
              )}

              {isSignup
                ? accountCreated
                  ? "Concluir cadastro"
                  : "Criar minha conta"
                : "Entrar"}
            </button>
          </form>

          <div className="auth-switch">
            {isSignup
              ? "Já tem uma conta?"
              : "Ainda não tem conta?"}

            <Link
              href={
                isSignup
                  ? `/login?next=${encodeURIComponent(
                      returnTo
                    )}`
                  : `/signup?next=${encodeURIComponent(
                      returnTo
                    )}`
              }
            >
              {isSignup
                ? "Entrar"
                : "Criar conta"}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
