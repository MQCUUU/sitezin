"use client";


import "@/styles/features/auth.css";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/Button";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandMark";
import { img } from "@/lib/tmdb";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  User,
} from "lucide-react";

import { authClient } from "@/lib/auth/client";

import {
  useToast,
} from "@/components/ToastProvider";
import { authErrorMessage, authFormPasswordError, PASSWORD_HINT, requiresEmailVerification } from "@/lib/auth-client";
import { isLocalDevelopmentHost } from "@/lib/auth/local-development";
import { clearPendingSignup, clearPendingVerificationError, readPendingSignup, savePendingSignup, savePendingVerificationEmail, savePendingVerificationError } from "@/lib/auth/pending-signup";
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
  backdrop = null,
}: {
  mode:
    Mode;
  backdrop?: string | null;
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

  const [username, setUsername] = useState("");

  const [
    password,
    setPassword,
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

  async function redirectToVerification(cleanEmail: string) {
    if (isLocalDevelopmentHost(window.location.hostname)) {
      router.replace(returnTo);
      router.refresh();
      return;
    }

    let sendFailed = false;
    try {
      const otp = await authClient.emailOtp.sendVerificationOtp({
        email: cleanEmail,
        type: "email-verification",
      });
      sendFailed = Boolean(otp.error);
    } catch {
      sendFailed = true;
    }

    savePendingVerificationEmail(cleanEmail);
    if (sendFailed) {
      savePendingVerificationError("Não conseguimos pedir um código novo agora. Se você já recebeu um código, tente usá-lo; caso contrário, aguarde o temporizador e toque em Reenviar código.");
    } else {
      clearPendingVerificationError();
    }
    router.replace(`/verify-email?next=${encodeURIComponent(returnTo)}`);
    router.refresh();
  }

  /*
   * Fase 3 (U3): os campos não são controlados pelo React. Quem digita antes da
   * página terminar de carregar (hidratação) não perde o texto — antes o React
   * reaplicava o estado vazio e o e-mail sumia. O valor de verdade é o do campo;
   * o estado só espelha o que a tela mostra (força da senha, prévia do @).
   */
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const value = (field: string) => (form.elements.namedItem(field) as HTMLInputElement | null)?.value ?? "";
    setUsername(value("username"));
    setPassword(value("password"));
  }, [isSignup]);

  async function submit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const field = (key: string) => String(data.get(key) ?? "");
    const name = field("name");
    const username = field("username").toLowerCase().replace(/[^a-z0-9_]/g, "");
    const email = field("email");
    const password = field("password");
    const confirmPassword = field("confirm-password");

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

        const pendingSignup = { email: email.trim(), name: name.trim(), username: username.trim(), next: returnTo };
        savePendingSignup(pendingSignup);

        if (isLocalDevelopmentHost(window.location.hostname)) {
          try {
            const profileRes = await fetch("/api/auth/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: pendingSignup.name, username: pendingSignup.username }),
            });
            if (profileRes.ok) {
              clearPendingSignup(pendingSignup.email);
              window.dispatchEvent(new Event("mycatalog:account-updated"));
            }
          } catch {
            // Mantém o cadastro pendente para concluir o perfil no próximo login local.
          }
          toast.success("Conta criada. A confirmação de e-mail fica desativada no localhost.");
          router.replace(returnTo);
          router.refresh();
          return;
        }

        await redirectToVerification(email.trim().toLowerCase());
        toast.success("Conta criada. Confira seu e-mail para buscar o código de confirmação.");
        return;
      }

      const res = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (res.error) {
        if (requiresEmailVerification(res.error)) {
          if (isLocalDevelopmentHost(window.location.hostname)) {
            setError("O Neon Auth recusou esta conta ainda não verificada. No localhost a tela de código não abre; use uma conta confirmada para entrar.");
            return;
          }
          await redirectToVerification(email.trim().toLowerCase());
          return;
        }
        throw new Error(authErrorMessage(res.error, "E-mail ou senha incorretos."));
      }

      if (res.data?.user?.emailVerified !== true && !isLocalDevelopmentHost(window.location.hostname)) {
        await redirectToVerification(email.trim().toLowerCase());
        return;
      }

      const pendingSignup = readPendingSignup(email);
      if (pendingSignup) {
        const profileRes = await fetch("/api/auth/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: pendingSignup.name, username: pendingSignup.username }),
        });
        if (profileRes.ok) {
          clearPendingSignup(pendingSignup.email);
          window.dispatchEvent(new Event("mycatalog:account-updated"));
        }
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
      if (!isSignup && requiresEmailVerification(error as { code?: string; message?: string; status?: number })) {
        if (isLocalDevelopmentHost(window.location.hostname)) {
          setError("O Neon Auth recusou esta conta ainda não verificada. No localhost a tela de código não abre; use uma conta confirmada para entrar.");
          return;
        }
        await redirectToVerification(email.trim().toLowerCase());
        return;
      }

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
        <BrandLogo size={28} />
      </Link>

      <div className="auth-shell">
        <section className="auth-visual" data-has-image={backdrop ? "true" : undefined}>
          {backdrop ? <div className="auth-visual-image" style={{ backgroundImage: `url(${img(backdrop, "w1280")})` }} aria-hidden="true" /> : null}

          <h1>
            {isSignup
              ? "Crie sua conta e comece sua coleção."
              : "Sua biblioteca está esperando por você."}
          </h1>

          <p>
            Organize filmes e séries, registre o que assistiu e receba recomendações baseadas no seu gosto.
          </p>
        </section>

        <section className="auth-card">
          {/* Fase 3 (V5): "Entrar" aparece uma vez na tela — no botão. */}
          <div className="auth-card-head">
            <h2>
              {isSignup
                ? "Criar conta"
                : "Acesse sua conta"}
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

          {/*
            * method="dialog": um clique em "Entrar" antes da hidratação não recarrega a
            * página (fora de um <dialog> o envio nativo não faz nada) — o texto fica.
            */}
          <form
            ref={formRef}
            className="auth-form"
            method="dialog"
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
                    name="name"
                    autoComplete="name"
                    placeholder="Como devemos te chamar?"
                  />
                </div>
              </label>
              <label>
                <span>@ de usuário</span>
                <div className="auth-input">
                  <User size={16} />
                  <input
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(event) => {
                      const clean = event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
                      if (clean !== event.target.value) event.target.value = clean;
                      setUsername(clean);
                    }}
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
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
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
                  name="password"
                  autoComplete={
                    isSignup
                      ? "new-password"
                      : "current-password"
                  }
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target
                        .value
                    )
                  }
                  /* No login não sugere regra de senha: contas antigas podem ter senha mais curta (Fase 0). */
                  placeholder={isSignup ? "Mínimo de 8 caracteres" : undefined}
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
                      name="confirm-password"
                      autoComplete="new-password"
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

            <Button variant="primary"
              type="submit"
              className="auth-submit"
              disabled={
                loading
              }
            >
              {loading ? (
                <Loader2
                  size={18}
                  className="spin"
                />
              ) : (
                <ArrowRight
                  size={18}
                />
              )}

              {isSignup ? "Criar minha conta" : "Entrar"}
            </Button>
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
