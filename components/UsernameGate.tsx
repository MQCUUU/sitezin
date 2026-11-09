"use client";


import "@/styles/features/username-gate.css";
import { fetchProfileMe, invalidateProfileMe } from "@/lib/profile-me";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useModal } from "@/hooks/useModal";
import { usePathname } from "next/navigation";
import { AtSign, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { clearPendingSignup, readPendingSignup } from "@/lib/auth/pending-signup";
import { Button } from "@/components/ui/Button";

const AUTH_PATHS = ["/login", "/signup", "/verify-email", "/forgot-password", "/reset-password", "/auth/"];

export function UsernameGate() {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const profileUserId = session?.user?.id ?? null;
  const previousProfileUserId = useRef<string | null>(null);
  const [required, setRequired] = useState(false);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Fase 7: modal obrigatório — trava a rolagem e prende o Tab; Escape não fecha (travado).
  const gateRef = useModal(required, () => {}, true, "input");

  useEffect(() => {
    if (previousProfileUserId.current !== profileUserId) {
      previousProfileUserId.current = profileUserId;
      invalidateProfileMe();
      setRequired(false);
    }

    if (AUTH_PATHS.some((path) => pathname.startsWith(path)) || isPending) {
      setRequired(false);
      return;
    }
    const userEmail = session?.user?.email;
    if (!userEmail) {
      setRequired(false);
      return;
    }

    const pendingSignup = readPendingSignup(userEmail);
    setUsername(pendingSignup?.username || "");
    if (pendingSignup?.username) setRequired(false);
    let cancelled = false;
    let checkVersion = 0;
    const checkProfile = () => {
      const currentCheck = ++checkVersion;
      fetchProfileMe()
        .then((data) => { if (!cancelled && currentCheck === checkVersion) setRequired(Boolean(data?.authenticated && !data?.username)); })
        // Auxiliar: sem a leitura do perfil, o aviso de @ pendente só não aparece agora.
        .catch((error) => console.warn("[UsernameGate]", error instanceof Error ? error.message : error));
    };

    const restorePendingProfile = async () => {
      if (pendingSignup?.username) {
        try {
          const response = await fetch("/api/auth/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: pendingSignup.name, username: pendingSignup.username }),
          });
          if (response.ok) {
            clearPendingSignup(pendingSignup.email);
            if (!cancelled) setRequired(false);
            window.dispatchEvent(new Event("mycatalog:account-updated"));
            return;
          }
        } catch {
          // Se a sessão ainda estiver sincronizando, o gate continua com o @ já escolhido.
        }
      }
      checkProfile();
    };

    void restorePendingProfile();
    window.addEventListener("mycatalog:account-updated", checkProfile);
    return () => {
      cancelled = true;
      window.removeEventListener("mycatalog:account-updated", checkProfile);
    };
  }, [pathname, isPending, profileUserId, session?.user?.email]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return setError("Use de 3 a 24 letras, números ou _.");
    setSaving(true);
    try {
      const response = await fetch("/api/profile/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Não foi possível salvar.");
        return;
      }
      clearPendingSignup(session?.user?.email);
      setRequired(false);
      window.dispatchEvent(new Event("mycatalog:account-updated"));
    } catch {
      setError("Não foi possível salvar agora. Confira sua conexão e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (!required) return null;
  return <div className="username-gate" role="dialog" aria-modal="true" aria-labelledby="username-gate-title"><form ref={gateRef as React.RefObject<HTMLFormElement>} className="username-gate-card" onSubmit={submit}><div className="username-gate-icon"><AtSign size={24} /></div><h2 id="username-gate-title">Escolha seu @ de usuário</h2><p>O @ agora identifica seu único perfil no MyCatalog. Você precisa defini-lo para continuar usando o site.</p><label><span>Seu endereço</span><div><b>mycatalog.com/u/</b><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength={3} maxLength={24} placeholder="seu_usuario" /></div></label>{error && <div className="auth-error">{error}</div>}<Button variant="primary" disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <AtSign size={16} />} Salvar e continuar</Button><small>Seu perfil começa privado: só seguidores que você aceitar podem vê-lo.</small></form></div>;
}
