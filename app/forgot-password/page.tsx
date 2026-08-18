"use client";

import {
  FormEvent,
  useState,
} from "react";

import Link from "next/link";

import {
  ArrowLeft,
  Loader2,
  Mail,
  Send,
} from "lucide-react";

import {
  createClient,
} from "@/lib/supabase/client";
import { authRedirectOrigin } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    sent,
    setSent,
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

    setError(
      ""
    );

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

    try {
      setLoading(
        true
      );

      const origin = authRedirectOrigin();

      const {
        error,
      } =
        await createClient()
          .auth
          .resetPasswordForEmail(
            email.trim(),
            {
              redirectTo:
                `${origin}/auth/callback?next=/reset-password`,
            }
          );

      if (
        error
      ) {
        throw error;
      }

      setSent(
        true
      );
    } catch (
      error
    ) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o e-mail."
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
        <Link
          href="/login"
          className="auth-back-link"
        >
          <ArrowLeft
            size={14}
          />

          Voltar
        </Link>

        <div className="eyebrow">
          RECUPERAR ACESSO
        </div>

        <h1>
          Esqueceu sua senha?
        </h1>

        <p className="muted">
          Digite seu e-mail e enviaremos um link seguro para criar uma nova senha.
        </p>

        {sent ? (
          <div className="auth-success-message">
            <Send
              size={21}
            />

            <strong>
              E-mail enviado
            </strong>

            <span>
              Confira sua caixa de entrada e também a pasta de spam.
            </span>
          </div>
        ) : (
          <form
            className="auth-form"
            onSubmit={
              submit
            }
          >
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
                <Send
                  size={16}
                />
              )}

              Enviar link
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
