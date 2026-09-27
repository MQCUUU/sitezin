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
 * as preferências: quem pode seguir, e as 8 visibilidades por seção.
 * Notificações de follow já vivem em NotificationSettings, não aqui.
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

const DEFAULT_SETTINGS: Settings = {
  visibility: "private",
  follow_policy: "profile",
  followers_visibility: "profile",
  following_visibility: "profile",
  activity_visibility: "profile",
  diary_visibility: "profile",
  lists_visibility: "profile",
  likes_visibility: "profile",
};

export function SocialSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;

    Promise.all([
      fetch("/api/profile/social-settings", { cache: "no-store" }),
      fetch("/api/profile/username", { cache: "no-store" }),
    ]).then(async ([settingsResponse, usernameResponse]) => {
      if (!alive) return;
      if (settingsResponse.ok) setSettings(await settingsResponse.json());
      if (usernameResponse.ok) {
        const data = await usernameResponse.json();
        setUsername(data?.username || null);
      }
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  async function saveSettings() {
    setSaving(true);
    const response = await fetch("/api/profile/social-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    response.ok ? toast.success("Configurações sociais salvas") : toast.error("Não foi possível salvar");
  }

  return (
    <section className="section social-settings">
      <div className="section-head">
        <div>
          <h2>Seguidores e privacidade</h2>
          <p className="muted">Controle suas conexões sem transformar seu catálogo em uma rede social.</p>
        </div>
        <Users size={21} />
      </div>

      <div className="panel social-preferences">
        {loading ? (
          <p className="muted">
            <Loader2 className="spin" size={15} /> Carregando...
          </p>
        ) : (
          <>
            <label>
              Visibilidade do perfil
              <select value={settings.visibility} onChange={(e) => setSettings({ ...settings, visibility: e.target.value })}>
                <option value="public">Público — qualquer pessoa pode ver</option>
                <option value="private">Privado — somente seguidores aceitos</option>
              </select>
            </label>
            <label>
              Quem pode seguir você?
              <select value={settings.follow_policy} onChange={(e) => setSettings({ ...settings, follow_policy: e.target.value })}>
                <option value="profile">Automático em perfil público; aprovação no privado</option>
                <option value="approval">Sempre pedir sua aprovação</option>
                <option value="nobody">Não aceitar novos seguidores</option>
              </select>
            </label>
            <label>
              Quem vê seus seguidores?
              <select value={settings.followers_visibility} onChange={(e) => setSettings({ ...settings, followers_visibility: e.target.value })}>
                <option value="profile">Mesma regra do perfil</option>
                <option value="followers">Somente seguidores aceitos</option>
                <option value="private">Somente eu</option>
              </select>
            </label>
            <label>
              Quem vê quem você segue?
              <select value={settings.following_visibility} onChange={(e) => setSettings({ ...settings, following_visibility: e.target.value })}>
                <option value="profile">Mesma regra do perfil</option>
                <option value="followers">Somente seguidores aceitos</option>
                <option value="private">Somente eu</option>
              </select>
            </label>
            <label>
              Quem vê sua atividade?
              <select value={settings.activity_visibility} onChange={(e) => setSettings({ ...settings, activity_visibility: e.target.value })}>
                <option value="profile">Mesma regra do perfil</option>
                <option value="followers">Somente seguidores aceitos</option>
                <option value="private">Somente eu</option>
              </select>
            </label>
            <label>
              Quem vê seu diário?
              <select value={settings.diary_visibility} onChange={(e) => setSettings({ ...settings, diary_visibility: e.target.value })}>
                <option value="profile">Mesma regra do perfil</option>
                <option value="followers">Somente seguidores aceitos</option>
                <option value="private">Somente eu</option>
              </select>
            </label>
            <label>
              Quem vê suas listas?
              <select value={settings.lists_visibility} onChange={(e) => setSettings({ ...settings, lists_visibility: e.target.value })}>
                <option value="profile">Mesma regra do perfil</option>
                <option value="followers">Somente seguidores aceitos</option>
                <option value="private">Somente eu</option>
              </select>
            </label>
            <label>
              Quem vê seus curtidos?
              <select value={settings.likes_visibility} onChange={(e) => setSettings({ ...settings, likes_visibility: e.target.value })}>
                <option value="profile">Mesma regra do perfil</option>
                <option value="followers">Somente seguidores aceitos</option>
                <option value="private">Somente eu</option>
              </select>
            </label>
            <button type="button" className="btn primary" disabled={saving} onClick={saveSettings}>
              {saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Salvar preferências
            </button>
          </>
        )}
      </div>

      {!loading && (
        <div className="panel social-connections-link">
          <div>
            <strong>Seguidores, seguindo e solicitações</strong>
            <p className="muted">Gerenciar quem você segue e quem te segue agora fica no seu perfil.</p>
          </div>
          <Link className="btn primary" href={username ? `/u/${username}?tab=connections` : "/profile"}>
            <Users size={15} /> Abrir minhas conexões
          </Link>
        </div>
      )}
    </section>
  );
}
