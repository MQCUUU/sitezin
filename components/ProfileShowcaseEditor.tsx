"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AtSign, ExternalLink, Film, Loader2, Plus, Save, Search, Tv, X } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { img } from "@/lib/tmdb";

const ALLOWED = new Set(["watched", "rewatching", "rewatched"]);
const titleOf = (item: any) => item?.media?.title || item?.media?.name || "Sem título";

function FavoriteShelf({ type, title, library, selected, onPick, onRemove }: any) {
  return <div className="profile-poster-shelf"><div className="profile-poster-shelf-head">{type === "movie" ? <Film size={16} /> : <Tv size={16} />}<h3>{title}</h3><span>até 5</span></div><div className="profile-poster-slots">{[1,2,3,4,5].map((position) => {
    const item = library.find((entry: any) => Number(entry.media?.id) === Number(selected[`${type}-${position}`]));
    return <div className="profile-poster-slot-wrap" key={position}><button type="button" className={`profile-poster-slot ${item ? "filled" : ""}`} onClick={() => onPick(type, position)}>{item?.media?.poster_path ? <img src={img(item.media.poster_path, "w342")} alt={titleOf(item)} /> : <div className="profile-poster-empty"><Plus size={22} /><span>Escolher</span></div>}<i>{position}</i></button>{item ? <><strong title={titleOf(item)}>{titleOf(item)}</strong><button type="button" className="profile-poster-remove" aria-label="Remover favorito" onClick={() => onRemove(type, position)}><X size={12} /></button></> : <small>Posição {position}</small>}</div>;
  })}</div></div>;
}

export function ProfileShowcaseEditor() {
  const toast = useToast();
  const [library, setLibrary] = useState<any[]>([]);
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [remainingChanges, setRemainingChanges] = useState(2);
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [selected, setSelected] = useState<Record<string, number | "">>({});
  const [picker, setPicker] = useState<{ type: "movie" | "tv"; position: number } | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [confirmUsername, setConfirmUsername] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { Promise.all([fetch("/api/profile/showcase"), fetch("/api/library", { cache: "no-store" })]).then(async ([profileResponse, libraryResponse]) => {
    const profileData = await profileResponse.json(); const libraryData = await libraryResponse.json(); const loadedUsername = profileData.profile?.username || "";
    setUsername(loadedUsername); setOriginalUsername(loadedUsername); setRemainingChanges(Number(profileData.username_changes?.remaining ?? 2)); setBio(profileData.profile?.bio || ""); setAvatarUrl(profileData.profile?.avatar_url || ""); setVisibility(profileData.profile?.visibility === "public" || profileData.profile?.is_public ? "public" : "private");
    const choices: Record<string, number> = {}; for (const item of profileData.favorites || []) choices[`${item.media_type}-${item.position}`] = Number(item.media_id);
    setSelected(choices); setLibrary(Array.isArray(libraryData) ? libraryData : libraryData?.items || []); setLoading(false);
  }).catch(() => setLoading(false)); }, []);

  const pickerOptions = useMemo(() => {
    if (!picker) return [];
    const query = pickerSearch.trim().toLocaleLowerCase("pt-BR");
    return library.filter((item: any) => item.media?.media_type === picker.type && ALLOWED.has(item.status) && (!query || titleOf(item).toLocaleLowerCase("pt-BR").includes(query))).sort((a: any, b: any) => titleOf(a).localeCompare(titleOf(b), "pt-BR", { sensitivity: "base" }));
  }, [library, picker, pickerSearch]);

  function choose(item: any) {
    if (!picker) return;
    setSelected((current) => { const next = { ...current }; for (const key of Object.keys(next)) if (Number(next[key]) === Number(item.media.id)) next[key] = ""; next[`${picker.type}-${picker.position}`] = Number(item.media.id); return next; });
    setPicker(null); setPickerSearch("");
  }

  async function persistSave() {
    setSaving(true);
    const favorites = Object.entries(selected).filter(([, mediaId]) => mediaId).map(([key, mediaId]) => { const [media_type, position] = key.split("-"); return { media_id: Number(mediaId), media_type, position: Number(position) }; });
    const response = await fetch("/api/profile/showcase", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, bio, avatar_url: avatarUrl, visibility, favorites }) });
    const data = await response.json(); setSaving(false); setConfirmUsername(false);
    if (!response.ok) return toast.error("Não foi possível salvar", { description: data.error });
    if (username !== originalUsername) { setOriginalUsername(username); setRemainingChanges(Number(data.username_change?.changes_remaining ?? Math.max(0, remainingChanges - 1))); }
    toast.success("Perfil atualizado");
    window.dispatchEvent(new CustomEvent("mycatalog:profile-updated", {
      detail: { username, closeEditor: true },
    }));
  }

  function save() { if (username !== originalUsername) { setConfirmUsername(true); return; } persistSave(); }

  if (loading) return <section className="panel profile-showcase-editor"><Loader2 className="spin" /> Carregando perfil...</section>;
  return <section className="panel profile-showcase-editor"><div className="profile-showcase-editor-head"><div><span className="eyebrow">SEU PERFIL</span><h2>Sua vitrine</h2><p className="muted">Uma apresentação visual do que você mais gosta.</p></div>{originalUsername && <Link className="btn" href={`/u/${originalUsername}`}><ExternalLink size={15} /> Ver como está</Link>}</div><div className="profile-public-fields"><label>@ de usuário<div className="profile-username-input"><span>mycatalog.com/u/</span><input value={username} readOnly={remainingChanges <= 0} maxLength={24} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} /></div><small className="muted">{remainingChanges > 0 ? `${remainingChanges} troca(s) disponível(is) nos próximos 30 dias.` : "Limite de 2 trocas atingido. Aguarde a liberação."}</small></label><label>Biografia<textarea value={bio} maxLength={280} onChange={(event) => setBio(event.target.value)} placeholder="Conte um pouco sobre seu gosto por filmes e séries." /></label><fieldset className="profile-visibility-choice"><legend>Quem pode ver seu perfil?</legend><label><input type="radio" name="profile-visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} /><span><b>Privado</b><small>Apenas seguidores que você aceitar.</small></span></label><label><input type="radio" name="profile-visibility" checked={visibility === "public"} onChange={() => setVisibility("public")} /><span><b>Público</b><small>Qualquer pessoa pode abrir seu perfil.</small></span></label></fieldset></div><div className="profile-favorite-editor-grid"><FavoriteShelf type="movie" title="Filmes favoritos" library={library} selected={selected} onPick={(type: "movie", position: number) => setPicker({ type, position })} onRemove={(type: string, position: number) => setSelected((current) => ({ ...current, [`${type}-${position}`]: "" }))} /><FavoriteShelf type="tv" title="Séries favoritas" library={library} selected={selected} onPick={(type: "tv", position: number) => setPicker({ type, position })} onRemove={(type: string, position: number) => setSelected((current) => ({ ...current, [`${type}-${position}`]: "" }))} /></div><button className="btn primary profile-save-showcase" disabled={saving} onClick={save}>{saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Salvar perfil</button>

  {picker && <div className="profile-picker-backdrop" onMouseDown={() => setPicker(null)}><div className="profile-picker-modal" onMouseDown={(event) => event.stopPropagation()}><div className="profile-picker-head"><div><span className="eyebrow">POSIÇÃO {picker.position}</span><h3>Escolher {picker.type === "movie" ? "filme" : "série"}</h3></div><button onClick={() => setPicker(null)}><X size={18} /></button></div><div className="profile-picker-search"><Search size={15} /><input autoFocus value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Buscar entre seus títulos assistidos..." /></div><div className="profile-picker-grid">{pickerOptions.map((item: any) => <button type="button" onClick={() => choose(item)} key={item.id}><div>{item.media.poster_path ? <img src={img(item.media.poster_path, "w342")} alt={titleOf(item)} /> : <span><Film size={22} /></span>}</div><strong>{titleOf(item)}</strong></button>)}{pickerOptions.length === 0 && <p className="muted">Nenhum título elegível encontrado.</p>}</div></div></div>}

  {confirmUsername && <div className="mycatalog-confirm-backdrop"><div className="mycatalog-confirm-modal"><div className="mycatalog-confirm-icon"><AtSign size={20} /></div><div className="eyebrow">ALTERAR @ DE USUÁRIO</div><h3>Confirmar @{username}?</h3><p className="muted">Seu endereço mudará de <b>/u/{originalUsername}</b> para <b>/u/{username}</b>. Links antigos deixarão de funcionar. Depois desta alteração, restarão {Math.max(0, remainingChanges - 1)} troca(s) nos próximos 30 dias.</p><div className="mycatalog-confirm-actions"><button className="btn" onClick={() => { setUsername(originalUsername); setConfirmUsername(false); }}>Cancelar</button><button className="btn primary" disabled={saving} onClick={persistSave}>{saving ? <Loader2 className="spin" size={15} /> : <AtSign size={15} />} Confirmar alteração</button></div></div></div>}
  </section>;
}
