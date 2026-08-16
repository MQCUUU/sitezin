"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from "lucide-react";

import {
  createClient,
} from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router =
    useRouter();

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirm,
    setConfirm,
  ] =
    useState("");

  const [
    show,
    setShow,
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

  async function submit(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      password.length <
      8
    ) {
      setError(
        "Use pelo menos 8 caracteres."
      );

      return;
    }

    if (
      password !==
      confirm
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

      const {
        error,
      } =
        await createClient()
          .auth
          .updateUser({
            password,
          });

      if (
        error
      ) {
        throw error;
      }

      router.replace(
        "/login?password=updated"
      );
    } catch (
      error
    ) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar a senha."
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  return (
    <main className="auth-page auth-centered-page">
      <section className="auth-card auth-small-card">
        <div className="eyebrow">
          NOVA SENHA
        </div>

        <h1>
          Crie uma nova senha
        </h1>

        <p className="muted">
          Use uma senha diferente da anterior e fácil de lembrar só para você.
        </p>

        <form
          className="auth-form"
          onSubmit={
            submit
          }
        >
          <label>
            <span>
              Nova senha
            </span>

            <div className="auth-input">
              <LockKeyhole
                size={16}
              />

              <input
                type={
                  show
                    ? "text"
                    : "password"
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
              />

              <button
                type="button"
                onClick={() =>
                  setShow(
                    (
                      value
                    ) =>
                      !value
                  )
                }
              >
                {show ? (
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
                  show
                    ? "text"
                    : "password"
                }
                value={
                  confirm
                }
                onChange={(
                  event
                ) =>
                  setConfirm(
                    event.target
                      .value
                  )
                }
              />
            </div>
          </label>

          {error && (
            <div className="auth-error">
              {
                error
              }
            </div>
          )}

          <button
            className="btn primary auth-submit"
            disabled={
              loading
            }
          >
            {loading ? (
              <Loader2
                size={16}
                className="spin"
              />
            ) : (
              <Check
                size={16}
              />
            )}

            Salvar nova senha
          </button>
        </form>
      </section>
    </main>
  );
}