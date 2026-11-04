"use client";

import "@/styles/features/auth.css";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, MailCheck, RotateCw, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth-client";
import { clearPendingSignup, clearPendingVerificationEmail, readPendingSignup, readPendingVerificationEmail, savePendingVerificationEmail } from "@/lib/auth/pending-signup";
import { safeNextPath } from "@/lib/safe-next";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
const COOLDOWN_KEY = "mycatalog.email-verification-resend-at";

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String(error.code || "").toUpperCase();
}

function verificationError(error: unknown): string {
  const code = errorCode(error);
  if (code.includes("EXPIRED")) return "Este código expirou. Solicite um novo código para continuar.";
  if (code.includes("INVALID_OTP") || code.includes("OTP_INVALID") || code.includes("INVALID_CODE")) return "O código não confere. Revise os seis dígitos e tente novamente.";
  if (code.includes("TOO_MANY") || code.includes("RATE") || code.includes("LIMIT")) return "Houve muitas tentativas. Aguarde antes de solicitar ou confirmar outro código.";
  return authErrorMessage(error as { code?: string; message?: string; status?: number }, "Não foi possível confirmar o código. Confira os dígitos ou peça outro código.");
}

export function EmailVerificationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => safeNextPath(searchParams.get("next")) || "/", [searchParams]);
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verified, setVerified] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const resendLock = useRef(false);

  useEffect(() => {
    const storedEmail = readPendingVerificationEmail() || readPendingSignup()?.email || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Read client-only storage after hydration to keep SSR output deterministic.
    setEmail(storedEmail);
    let resendAt = 0;
    try { resendAt = Number(window.sessionStorage.getItem(COOLDOWN_KEY) || 0); } catch { /* Keep the in-memory cooldown only. */ }
    const remaining = Math.ceil((resendAt - Date.now()) / 1000);
    if (remaining > 0) setSecondsLeft(remaining);
    else {
      setSecondsLeft(0);
      refs.current[0]?.focus();
    }
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const beginCooldown = useCallback((duration = RESEND_COOLDOWN_SECONDS) => {
    const resendAt = Date.now() + duration * 1000;
    try { window.sessionStorage.setItem(COOLDOWN_KEY, String(resendAt)); } catch { /* Keep the in-memory cooldown only. */ }
    setSecondsLeft(duration);
  }, []);

  function distributeCode(value: string, start = 0) {
    const code = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!code) return;
    const next = Array(CODE_LENGTH).fill("");
    for (let index = 0; index < code.length && start + index < CODE_LENGTH; index++) next[start + index] = code[index];
    setDigits(next);
    refs.current[Math.min(start + code.length, CODE_LENGTH - 1)]?.focus();
  }

  function handleDigitChange(index: number, value: string) {
    setError("");
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      distributeCode(clean, index);
      return;
    }
    const next = [...digits];
    next[index] = clean.slice(-1);
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) refs.current[index + 1]?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    const otp = digits.join("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Digite o endereço de e-mail usado para criar a conta.");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError("Digite os seis números do código recebido por e-mail.");
      refs.current[Math.min(otp.length, CODE_LENGTH - 1)]?.focus();
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.emailOtp.verifyEmail({ email: cleanEmail, otp });
      if (result.error) throw result.error;
      setVerified(true);
      clearPendingVerificationEmail();
      const pendingSignup = readPendingSignup(cleanEmail);
      const session = await authClient.getSession();
      const signedInUser = session.data?.user;
      if (signedInUser?.emailVerified === true && signedInUser.email?.toLowerCase() === cleanEmail) {
        if (pendingSignup) {
          const profileResponse = await fetch("/api/auth/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: pendingSignup.name, username: pendingSignup.username }),
          });
          if (profileResponse.ok) clearPendingSignup();
        }
        window.setTimeout(() => {
          router.replace(pendingSignup?.next || nextPath);
          router.refresh();
        }, 1000);
      } else {
        clearPendingSignup();
      }
    } catch (cause) {
      setDigits(Array(CODE_LENGTH).fill(""));
      setError(verificationError(cause));
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (resendLock.current || secondsLeft > 0) return;
    setError("");
    setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Digite um endereço de e-mail válido para receber o código.");
      return;
    }
    resendLock.current = true;
    setResending(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email: cleanEmail, type: "email-verification" });
      if (result.error) throw result.error;
      savePendingVerificationEmail(cleanEmail);
      beginCooldown();
      setDigits(Array(CODE_LENGTH).fill(""));
      setNotice("Enviamos um novo código. O código anterior foi substituído; use o mais recente.");
      refs.current[0]?.focus();
    } catch (cause) {
      const code = errorCode(cause);
      if (code.includes("TOO_MANY") || code.includes("RATE") || code.includes("LIMIT") || (cause && typeof cause === "object" && "status" in cause && cause.status === 429)) {
        beginCooldown();
        setError("Você pediu códigos muitas vezes. Aguarde um minuto antes de tentar novamente.");
      } else {
        setError(authErrorMessage(cause as { code?: string; message?: string; status?: number }, "Não foi possível enviar o código agora. Aguarde e tente novamente."));
      }
    } finally {
      resendLock.current = false;
      setResending(false);
    }
  }

  return (
    <main className="auth-page auth-centered-page">
      <Link href="/" className="auth-brand">My<span>Catalog</span></Link>
      <section className="auth-card auth-small-card verify-card">
        <Link href="/signup" className="auth-back-link"><ArrowLeft size={15} /> Voltar ao cadastro</Link>
        <div className={`verify-icon${verified ? " is-verified" : ""}`} aria-hidden="true">
          {verified ? <CheckCircle2 size={27} /> : <MailCheck size={27} />}
        </div>
        <p className="verify-eyebrow">{verified ? "E-MAIL CONFIRMADO" : "SÓ MAIS UM PASSO"}</p>
        <h1>{verified ? "Tudo certo!" : "Confirme seu e-mail"}</h1>
        <p className="verify-copy">
          {verified
            ? "Seu endereço foi confirmado com segurança. Sua conta está pronta."
            : "Enviamos um código de 6 dígitos para confirmar que este endereço é seu."}
        </p>

        {!verified && (
          <form className="auth-form verify-form" onSubmit={submit}>
            <label>
              <span>Seu endereço de e-mail</span>
              <div className="auth-input"><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" required /></div>
            </label>
            <fieldset className="verify-code-fieldset">
              <legend>Digite o código recebido</legend>
              <div className="verify-code-inputs" dir="ltr" onPaste={(event) => { event.preventDefault(); distributeCode(event.clipboardData.getData("text")); }}>
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => { refs.current[index] = element; }}
                    aria-label={`Dígito ${index + 1} de 6`}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(event) => handleDigitChange(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    disabled={loading}
                  />
                ))}
              </div>
            </fieldset>
            {error && <p className="verify-message is-error" role="alert">{error}</p>}
            {notice && <p className="verify-message is-notice" role="status">{notice}</p>}
            <button className="auth-submit" type="submit" disabled={loading || digits.join("").length !== CODE_LENGTH}>
              {loading ? <><Loader2 size={17} className="spin" /> Confirmando…</> : <><ShieldCheck size={17} /> Confirmar e-mail</>}
            </button>
          </form>
        )}

        {verified && (
          <div className="verify-success" role="status">
            <CheckCircle2 size={18} />
            <span>Confirmação concluída para <strong>{email}</strong>.</span>
          </div>
        )}

        {!verified && (
          <div className="verify-resend">
            <span>Não encontrou o e-mail? Confira também o spam.</span>
            <button type="button" onClick={resendCode} disabled={resending || secondsLeft > 0}>
              {resending ? <Loader2 size={15} className="spin" /> : <RotateCw size={15} />}
              {secondsLeft > 0 ? `Reenviar em ${secondsLeft}s` : resending ? "Enviando…" : "Reenviar código"}
            </button>
          </div>
        )}

        {verified && (
          <div className="verify-footer"><Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Entrar na minha conta</Link></div>
        )}
      </section>
    </main>
  );
}
