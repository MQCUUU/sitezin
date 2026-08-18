"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AtSign, Loader2 } from "lucide-react";

const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/"];

export function UsernameGate() {
  const pathname = usePathname();
  const [required, setRequired] = useState(false);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (AUTH_PATHS.some((path) => pathname.startsWith(path))) return;
    let cancelled = false;
    fetch("/api/profile/username", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled) setRequired(Boolean(data?.authenticated && !data?.username)); })
      .catch(() => null);
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
  return <div className="username-gate" role="dialog" aria-modal="true"><form className="username-gate-card" onSubmit={submit}><div className="username-gate-icon"><AtSign size={24} /></div><span className="eyebrow">COMPLETE SEU PERFIL</span><h2>Escolha seu @ de usuário</h2><p>O @ agora identifica seu único perfil no MyCatalog. Você precisa defini-lo para continuar usando o site.</p><label><span>Seu endereço</span><div><b>mycatalog.com/u/</b><input autoFocus value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength={3} maxLength={24} placeholder="seu_usuario" /></div></label>{error && <div className="auth-error">{error}</div>}<button className="btn primary" disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <AtSign size={16} />} Salvar e continuar</button><small>Seu perfil começará visível somente para amigos aceitos.</small></form></div>;
}
