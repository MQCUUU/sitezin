"use client";


import "@/styles/features/username-gate.css";
import { fetchProfileMe } from "@/lib/profile-me";
import { FormEvent, useEffect, useState } from "react";
import { useModal } from "@/hooks/useModal";
import { usePathname } from "next/navigation";
import { AtSign, Loader2 } from "lucide-react";

const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/"];

export function UsernameGate() {
  const pathname = usePathname();
  const [required, setRequired] = useState(false);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Fase 7: modal obrigatório — trava a rolagem e prende o Tab; Escape não fecha (travado).
  const gateRef = useModal(required, () => {}, true, "input");

  useEffect(() => {
    if (AUTH_PATHS.some((path) => pathname.startsWith(path))) return;
    let cancelled = false;
    fetchProfileMe()
      .then((data) => { if (!cancelled) setRequired(Boolean(data?.authenticated && !data?.username)); })
      // Auxiliar: sem a leitura do perfil, o aviso de @ pendente só não aparece agora.
      .catch((error) => console.warn("[UsernameGate]", error instanceof Error ? error.message : error));
    return () => { cancelled = true; };
  }, [pathname]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return setError("Use de 3 a 24 letras, números ou _.");
    setSaving(true);
    const availability = await fetch(`/api/auth/username?username=${encodeURIComponent(username)}`, { cache: "no-store" });
    const available = await availability.json();
    if (!availability.ok || !available.available) { setSaving(false); return setError(available.error || "Esse @ já está em uso."); }
    const response = await fetch("/api/profile/username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
    const data = await response.json(); setSaving(false);
    if (!response.ok) return setError(data.error || "Não foi possível salvar.");
    setRequired(false); window.dispatchEvent(new Event("mycatalog:account-updated"));
  }

  if (!required) return null;
  return <div className="username-gate" role="dialog" aria-modal="true" aria-labelledby="username-gate-title"><form ref={gateRef as React.RefObject<HTMLFormElement>} className="username-gate-card" onSubmit={submit}><div className="username-gate-icon"><AtSign size={24} /></div><span className="eyebrow">COMPLETE SEU PERFIL</span><h2 id="username-gate-title">Escolha seu @ de usuário</h2><p>O @ agora identifica seu único perfil no MyCatalog. Você precisa defini-lo para continuar usando o site.</p><label><span>Seu endereço</span><div><b>mycatalog.com/u/</b><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength={3} maxLength={24} placeholder="seu_usuario" /></div></label>{error && <div className="auth-error">{error}</div>}<button className="btn primary" disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <AtSign size={16} />} Salvar e continuar</button><small>Seu perfil começa privado: só seguidores que você aceitar podem vê-lo.</small></form></div>;
}
