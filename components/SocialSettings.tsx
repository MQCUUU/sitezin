"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Check, Loader2, Search, UserMinus, UserPlus, Users, X } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";

type Row = { follower_id: string; following_id: string; status: string; profile?: { id: string; username: string; display_name: string; avatar_url?: string } };
type Groups = { following: Row[]; followers: Row[]; incoming: Row[]; outgoing: Row[] };
const emptyGroups: Groups = { following: [], followers: [], incoming: [], outgoing: [] };

export function SocialSettings() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [groups, setGroups] = useState<Groups>(emptyGroups);
  const [settings, setSettings] = useState({ visibility: "private", follow_policy: "profile", followers_visibility: "profile", following_visibility: "profile", activity_visibility: "profile", diary_visibility: "profile", lists_visibility: "profile", likes_visibility: "profile" });
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [connectionsResponse, settingsResponse] = await Promise.all([
      fetch("/api/follows", { cache: "no-store" }),
      fetch("/api/profile/social-settings", { cache: "no-store" }),
    ]);
    if (connectionsResponse.ok) setGroups(await connectionsResponse.json());
    if (settingsResponse.ok) setSettings(await settingsResponse.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function follow() {
    if (!username.trim()) return;
    setSaving(true);
    const response = await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error("Não foi possível seguir", { description: data.error });
    setUsername("");
    toast.success(data.status === "accepted" ? "Você está seguindo este perfil" : "Solicitação enviada");
    load();
  }

  async function respond(follower_id: string, action: "accept" | "reject") {
    await fetch("/api/follows", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ follower_id, action }) });
    toast.success(action === "accept" ? "Seguidor aceito" : "Solicitação recusada");
    load();
  }

  async function remove(user_id: string, mode: "unfollow" | "remove_follower") {
    const message = mode === "unfollow" ? "Deixar de seguir esta pessoa?" : "Remover esta pessoa dos seus seguidores?";
    if (!(await confirmAction({ title: mode === "unfollow" ? "Deixar de seguir?" : "Remover seguidor?", description: message, confirmLabel: "Confirmar" }))) return;
    await fetch("/api/follows", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id, mode }) });
    toast.success(mode === "unfollow" ? "Você deixou de seguir" : "Seguidor removido");
    load();
  }

  async function saveSettings() {
    setSaving(true);
    const response = await fetch("/api/profile/social-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    setSaving(false);
    response.ok ? toast.success("Configurações sociais salvas") : toast.error("Não foi possível salvar");
  }

  const Person = ({ row, action }: { row: Row; action: React.ReactNode }) => (
    <div className="social-person">
      <Link href={`/u/${row.profile?.username}`}>
        {row.profile?.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : <span>{row.profile?.display_name?.slice(0, 2).toUpperCase()}</span>}
        <div><strong>{row.profile?.display_name || row.profile?.username}</strong><small>@{row.profile?.username}</small></div>
      </Link>
      {action}
    </div>
  );

  return <section className="section social-settings">
    <div className="section-head"><div><h2>Seguidores e privacidade</h2><p className="muted">Controle suas conexões sem transformar seu catálogo em uma rede social.</p></div><Users size={21} /></div>
    <div className="panel social-preferences">
      <label>Visibilidade do perfil<select value={settings.visibility} onChange={(e) => setSettings({ ...settings, visibility: e.target.value })}><option value="public">Público — qualquer pessoa pode ver</option><option value="private">Privado — somente seguidores aceitos</option></select></label>
      <label>Quem pode seguir você?<select value={settings.follow_policy} onChange={(e) => setSettings({ ...settings, follow_policy: e.target.value })}><option value="profile">Automático em perfil público; aprovação no privado</option><option value="approval">Sempre pedir sua aprovação</option><option value="nobody">Não aceitar novos seguidores</option></select></label>
      <label>Quem vê seus seguidores?<select value={settings.followers_visibility} onChange={(e) => setSettings({ ...settings, followers_visibility: e.target.value })}><option value="profile">Mesma regra do perfil</option><option value="followers">Somente seguidores aceitos</option><option value="private">Somente eu</option></select></label>
      <label>Quem vê quem você segue?<select value={settings.following_visibility} onChange={(e) => setSettings({ ...settings, following_visibility: e.target.value })}><option value="profile">Mesma regra do perfil</option><option value="followers">Somente seguidores aceitos</option><option value="private">Somente eu</option></select></label>
      <label>Quem vê sua atividade?<select value={settings.activity_visibility} onChange={(e) => setSettings({ ...settings, activity_visibility: e.target.value })}><option value="profile">Mesma regra do perfil</option><option value="followers">Somente seguidores aceitos</option><option value="private">Somente eu</option></select></label>
      <label>Quem vê seu diário?<select value={settings.diary_visibility} onChange={(e) => setSettings({ ...settings, diary_visibility: e.target.value })}><option value="profile">Mesma regra do perfil</option><option value="followers">Somente seguidores aceitos</option><option value="private">Somente eu</option></select></label>
      <label>Quem vê suas listas?<select value={settings.lists_visibility} onChange={(e) => setSettings({ ...settings, lists_visibility: e.target.value })}><option value="profile">Mesma regra do perfil</option><option value="followers">Somente seguidores aceitos</option><option value="private">Somente eu</option></select></label>
      <label>Quem vê seus curtidos?<select value={settings.likes_visibility} onChange={(e) => setSettings({ ...settings, likes_visibility: e.target.value })}><option value="profile">Mesma regra do perfil</option><option value="followers">Somente seguidores aceitos</option><option value="private">Somente eu</option></select></label>
      <button className="btn primary" disabled={saving} onClick={saveSettings}>{saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Salvar preferências</button>
    </div>

    <div className="panel social-connections">
      <div className="friends-add"><Search size={15} /><input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="Buscar por @ de usuário" onKeyDown={(e) => e.key === "Enter" && follow()} /><button className="btn primary" onClick={follow} disabled={saving}><UserPlus size={15} /> Seguir</button></div>
      {loading ? <p className="muted"><Loader2 className="spin" size={15} /> Carregando...</p> : <>
        {groups.incoming.length > 0 && <div className="social-group"><h3>Solicitações ({groups.incoming.length})</h3>{groups.incoming.map((row) => <Person key={row.follower_id} row={row} action={<div className="social-actions"><button className="btn" onClick={() => respond(row.follower_id, "accept")}><Check size={14} /> Aceitar</button><button className="btn danger" onClick={() => respond(row.follower_id, "reject")}><X size={14} /> Recusar</button></div>} />)}</div>}
        {groups.outgoing.length > 0 && <div className="social-group"><h3>Solicitações enviadas ({groups.outgoing.length})</h3>{groups.outgoing.map((row) => <Person key={row.following_id} row={row} action={<button className="btn" onClick={() => remove(row.following_id, "unfollow")}><Ban size={14} /> Cancelar</button>} />)}</div>}
        <div className="social-columns"><div className="social-group"><h3>Seguindo ({groups.following.length})</h3>{groups.following.map((row) => <Person key={row.following_id} row={row} action={<button className="btn" onClick={() => remove(row.following_id, "unfollow")}><UserMinus size={14} /> Deixar de seguir</button>} />)}{!groups.following.length && <p className="muted">Você ainda não segue ninguém.</p>}</div><div className="social-group"><h3>Seguidores ({groups.followers.length})</h3>{groups.followers.map((row) => <Person key={row.follower_id} row={row} action={<button className="btn" onClick={() => remove(row.follower_id, "remove_follower")}><UserMinus size={14} /> Remover</button>} />)}{!groups.followers.length && <p className="muted">Você ainda não tem seguidores.</p>}</div></div>
      </>}
    </div>
  </section>;
}
