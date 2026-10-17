"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Users } from "lucide-react";

import { useToast } from "@/components/ToastProvider";

/*
 * E1 — SocialSettings deixou de reimplementar a lista de
 * followers/following/solicitações (decisão de produto #1/#20 da
 * fase). `/u/[username]` (aba "Conexões") é agora a única superfície
 * que gerencia seguir/deixar de seguir/aceitar/recusar — aqui ficam só
 * as preferências: quem pode seguir, e as visibilidades por seção.
 *
 * V3.3: a regra é aplicada no SERVIDOR (lib/social/visibility.ts): uma seção
 * nunca abre mais que o perfil. O PUT é mesclado com o que já está salvo.
 * Termos: o domínio é "seguir" (não amizade) — "seguidores aceitos".
 */

type Settings = {
  visibility: string;
  follow_policy: string;
  followers_visibility: string;
  following_visibility: string;
  activity_visibility: string;
  diary_visibility: string;
  lists_visibility: string;
  likes_visibility: string;
};

const SECTIONS: { key: keyof Settings; label: string }[] = [
  { key: "followers_visibility", label: "Quem vê seus seguidores?" },
  { key: "following_visibility", label: "Quem vê quem você segue?" },
  { key: "activity_visibility", label: "Quem vê sua atividade e reviews?" },
  { key: "diary_visibility", label: "Quem vê seu diário?" },
  { key: "lists_visibility", label: "Quem vê suas listas públicas?" },
  { key: "likes_visibility", label: "Quem vê seus curtidos?" },
];

export function SocialSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);

  async function load() {
    setStatus("loading");

    try {
      const [settingsResponse, usernameResponse] = await Promise.all([
        fetch("/api/profile/social-settings", { cache: "no-store" }),
        fetch("/api/profile/username", { cache: "no-store" }),
      ]);

      if (!settingsResponse.ok) throw new Error();

      const data = (await settingsResponse.json()) as Settings;

      setSettings(data);
      setSaved(JSON.stringify(data));
      if (usernameResponse.ok) setUsername((await usernameResponse.json())?.username || null);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const dirty = status === "ready" && JSON.stringify(settings) !== saved;
  const set = (key: keyof Settings, value: string) => setSettings((current) => (current ? { ...current, [key]: value } : current));

  async function saveSettings() {
    if (!settings) return;

    setSaving(true);

    try {
      const response = await fetch("/api/profile/social-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error();

      setSaved(JSON.stringify(settings));
      toast.success("Privacidade e seguidores salvos.");
    } catch {
      toast.error("Não foi possível salvar a privacidade", { description: "Nada foi alterado. Tente de novo." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section social-settings" aria-labelledby="social-settings-title">
      <div className="section-head">
        <div>
          <h2 id="social-settings-title">Privacidade e seguidores</h2>
          <p className="muted">
            Quem pode ver seu perfil e cada parte dele. Seu e-mail nunca aparece para outras pessoas.
          </p>
        </div>
        <Users size={21} aria-hidden="true" />
      </div>

      <div className="panel social-preferences">
        {status === "loading" && (
          <p className="muted" role="status">
            <Loader2 className="spin" size={15} aria-hidden="true" /> Carregando…
          </p>
        )}

        {status === "error" && (
          <div className="set-inline-error" role="alert">
            <span>Não foi possível carregar sua privacidade.</span>
            <button type="button" className="btn" onClick={() => void load()}>
              Tentar de novo
            </button>
          </div>
        )}

        {status === "ready" && settings && (
          <>
            <label>
              Visibilidade do perfil
              <select value={settings.visibility} onChange={(e) => set("visibility", e.target.value)}>
                <option value="public">Público — qualquer pessoa pode ver</option>
                <option value="private">Privado — só seguidores aceitos</option>
              </select>
            </label>
            <label>
              Quem pode seguir você?
              <select value={settings.follow_policy} onChange={(e) => set("follow_policy", e.target.value)}>
                <option value="profile">Automático no perfil público; com aprovação no privado</option>
                <option value="approval">Sempre pedir minha aprovação</option>
                <option value="nobody">Não aceitar novos seguidores</option>
              </select>
            </label>
            {SECTIONS.map((section) => (
              <label key={section.key}>
                {section.label}
                <select value={settings[section.key]} onChange={(e) => set(section.key, e.target.value)}>
                  <option value="profile">Quem pode ver meu perfil</option>
                  <option value="followers">Só seguidores aceitos</option>
                  <option value="private">Só eu</option>
                </select>
              </label>
            ))}

            <p className="muted social-preferences-note">
              Uma seção nunca fica mais aberta que o perfil. Listas marcadas como privadas nunca aparecem para
              outras pessoas, qualquer que seja a regra acima.
            </p>

            <div className="set-save-row">
              <button type="button" className="btn primary" disabled={saving || !dirty} onClick={saveSettings}>
                {saving ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}{" "}
                Salvar privacidade
              </button>
              <span className="muted" role="status" aria-live="polite">
                {dirty ? "Alterações não salvas." : ""}
              </span>
            </div>
          </>
        )}
      </div>

      {status === "ready" && (
        <div className="panel social-connections-link">
          <div>
            <strong>Seguidores, seguindo e solicitações</strong>
            <p className="muted">Aceite pedidos e gerencie conexões no seu perfil.</p>
          </div>
          <Link className="btn primary" href={username ? `/u/${username}?tab=connections` : "/profile"}>
            <Users size={15} aria-hidden="true" /> Abrir minhas conexões
          </Link>
        </div>
      )}
    </section>
  );
}
