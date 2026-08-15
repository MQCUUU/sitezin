"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function CadastroPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  async function handleSignup(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError(
        "A senha precisa ter pelo menos 6 caracteres."
      );
      return;
    }

    if (
      password !== confirmPassword
    ) {
      setError(
        "As senhas não são iguais."
      );
      return;
    }

    setLoading(true);

    const { data, error } =
      await supabase.auth.signUp({
        email,
        password,
      });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    /*
     * Se o Supabase estiver configurado
     * para exigir confirmação de e-mail,
     * o usuário receberá um e-mail.
     */
    if (!data.session) {
      setSuccess(
        "Conta criada! Verifique seu e-mail para confirmar a conta."
      );

      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          MyCatalog
        </div>

        <h1>Criar conta</h1>

        <p className="muted">
          Crie sua conta e comece a montar
          seu catálogo pessoal.
        </p>

        <form
          onSubmit={handleSignup}
          className="auth-form"
        >
          <label>
            E-mail

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="seu@email.com"
              required
            />
          </label>

          <label>
            Senha

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="Mínimo de 6 caracteres"
              required
            />
          </label>

          <label>
            Confirmar senha

            <input
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              placeholder="Digite novamente"
              required
            />
          </label>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          {success && (
            <div className="auth-success">
              {success}
            </div>
          )}

          <button
            className="btn primary auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Criando..."
              : "Criar conta"}
          </button>
        </form>

        <p className="auth-footer">
          Já possui uma conta?{" "}
          <Link href="/login">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}