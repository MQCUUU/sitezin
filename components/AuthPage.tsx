"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

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

import {
  createClient,
} from "@/lib/supabase/client";

import {
  useToast,
} from "@/components/ToastProvider";

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

function safeNext(
  value:
    string |
    null
) {
  if (
    !value ||
    !value.startsWith(
      "/"
    ) ||
    value.startsWith(
      "//"
    )
  ) {
    return "/";
  }

  /*
   * Não permitimos redirecionar de volta para
   * telas de autenticação.
   */
  if (
    value.startsWith(
      "/login"
    ) ||
    value.startsWith(
      "/signup"
    )
  ) {
    return "/";
  }

  return value;
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

  const returnTo =
    safeNext(
      searchParams.get(
        "next"
      )
    );

  const sessionReason =
    searchParams.get(
      "reason"
    ) ===
    "session";

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

    if (
      password.length <
      8
    ) {
      setError(
        "Use uma senha com pelo menos 8 caracteres."
      );

      return;
    }

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

      const s =
        createClient();

      if (
        isSignup
      ) {
        const usernameResponse = await fetch(`/api/auth/username?username=${encodeURIComponent(username)}`, { cache: "no-store" });
        const usernameData = await usernameResponse.json();
        if (!usernameResponse.ok || !usernameData.available) {
          throw new Error(usernameData.error || "Este @ de usuário já está em uso.");
        }

        const origin =
          window.location.origin;

        const {
          data,
          error,
        } =
          await s.auth.signUp({
            email:
              email.trim(),

            password,

            options: {
              data: {
                display_name:
                  name.trim(),
                username,
                profile_visibility: "private",
              },

              emailRedirectTo:
                `${origin}/auth/callback?next=${encodeURIComponent(
                  returnTo
                )}`,
            },
          });

        if (
          error
        ) {
          throw error;
        }

        if (
          data.session
        ) {
          toast.success(
            "Conta criada com sucesso"
          );

          router.replace(
            returnTo
          );

          router.refresh();

          return;
        }

        router.replace(
          `/signup/success?email=${encodeURIComponent(
            email.trim()
          )}`
        );

        return;
      }

      const {
        error,
      } =
        await s.auth
          .signInWithPassword({
            email:
              email.trim(),

            password,
          });

      if (
        error
      ) {
        throw error;
      }

      toast.success(
        "Bem-vindo de volta"
      );

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
      const message =
        friendlyAuthError(
          error instanceof Error
            ? error.message
            : "Não foi possível continuar."
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
    <main className="auth-page">
      <Link
        href="/"
        className="auth-brand"
      >
        My<span>Catalog</span>
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

          {sessionReason &&
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
                ? "Criar minha conta"
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
    </main>
  );
}
