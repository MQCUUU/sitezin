"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Ban, BookOpen, Check, Film, Heart, List, Loader2, LockKeyhole, MessageSquareText, Pencil, Search as SearchIcon, Star, UserCheck, UserMinus, UserPlus, Users, X } from "lucide-react";
import { Search } from "@/components/Search";
import { useToast } from "@/components/ToastProvider";
import { img } from "@/lib/tmdb";
import { CarouselRail } from "@/components/CarouselRail";
import { useConfirm } from "@/components/ConfirmProvider";
import { ProfileShowcaseEditor } from "@/components/ProfileShowcaseEditor";
import { AvatarSettings } from "@/components/AvatarSettings";

type Tab = "activity" | "reviews" | "likes" | "lists" | "connections";
type PersonRow = { follower_id?: string; following_id?: string; profile: { id: string; username: string; display_name: string; avatar_url?: string } };
type OwnConnections = { following: PersonRow[]; followers: PersonRow[]; incoming: PersonRow[]; outgoing: PersonRow[] };
const mediaOf = (row: any) => Array.isArray(row?.media) ? row.media[0] : row?.media;
const normalizePerson = (row: any): PersonRow | null => {
  const profile = Array.isArray(row?.profile) ? row.profile[0] : row?.profile;
  return profile?.id ? { ...row, profile } : null;
};

function PosterRow({ items, empty }: { items: any[]; empty: string }) {
  if (!items.length) return <div className="profile-tab-empty">{empty}</div>;
  return <CarouselRail className="profile-media-row profile-media-carousel">{items.map((row, index) => { const media = mediaOf(row); return media && <Link href={`/title/${media.media_type}/${media.tmdb_id}`} key={row.id || `${media.media_type}-${media.tmdb_id}-${index}`}><div>{media.poster_path ? <img src={img(media.poster_path, "w342")} alt={media.title} /> : <Film />}</div><strong>{media.title}</strong>{row.personal_rating != null && <small><Star size={11} fill="currentColor" /> {Number(row.personal_rating).toFixed(1)}</small>}</Link>; })}</CarouselRail>;
}

function ReviewList({ items }: { items: any[] }) {
  if (!items.length) return <div className="profile-tab-empty">Nenhuma review publicada ainda.</div>;
  return <div className="profile-review-list">{items.map((row, index) => {
    const media = mediaOf(row);
    if (!media) return null;
    const date = row.watched_at || row.updated_at || row.added_at;
    return <Link
      className="profile-review-card"
      href={`/title/${media.media_type}/${media.tmdb_id}`}
      key={row.id || `${media.media_type}-${media.tmdb_id}-${index}`}
    >
      <div className="profile-review-poster">
        {media.poster_path
          ? <img loading="lazy" src={img(media.poster_path, "w342")} alt={media.title} />
          : <Film size={24} />}
      </div>
      <article>
        <header>
          <div>
            <strong>{media.title}</strong>
            <small>{media.media_type === "movie" ? "Filme" : "Série"}{date ? ` · ${new Date(date).toLocaleDateString("pt-BR")}` : ""}</small>
          </div>
          {row.personal_rating != null && <span><Star size={13} fill="currentColor" /> {Number(row.personal_rating).toFixed(1)}</span>}
        </header>
        <p>{String(row.review || "").trim() || "Avaliação registrada sem texto."}</p>
      </article>
    </Link>;
  })}</div>;
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("activity");
  const [connectionModal, setConnectionModal] = useState<"followers" | "following" | null>(null);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [listName, setListName] = useState("");
  const [ownConnections, setOwnConnections] = useState<OwnConnections | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  async function load() {
    const response = await fetch(`/api/public-profile/${encodeURIComponent(username)}`, { cache: "no-store" });
    setData(response.ok ? await response.json() : null); setLoading(false);
  }
  useEffect(() => { load(); }, [username]);
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [username]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ username?: string; closeEditor?: boolean }>).detail;
      if (detail?.closeEditor) setEditingProfile(false);
      if (detail?.username && detail.username !== username) {
        router.replace(`/u/${detail.username}`);
        return;
      }
      load();
    };
    window.addEventListener("mycatalog:profile-updated", refresh);
    return () => window.removeEventListener("mycatalog:profile-updated", refresh);
  }, [username, router]);
  useEffect(() => {
    if (data?.social?.relationship !== "self") return;
    fetch("/api/follows", { cache: "no-store" }).then(async (response) => {
      if (response.ok) setOwnConnections(await response.json());
    });
  }, [data?.social?.relationship]);
  useEffect(() => {
    const refreshFollows = (event: Event) => {
      const connections = (event as CustomEvent<OwnConnections>).detail;
      if (data?.social?.relationship === "self" && connections) setOwnConnections(connections);
      void load();
    };
    window.addEventListener("mycatalog:follows-updated", refreshFollows);
    return () => window.removeEventListener("mycatalog:follows-updated", refreshFollows);
  }, [username, data?.social?.relationship]);
  useEffect(() => { const requested = searchParams.get("tab"); if (["activity","reviews","likes","lists","connections"].includes(requested || "")) setTab(requested as Tab); }, [searchParams]);

  async function toggleFollow() {
    if (busy || !data) return;
    setBusy(true);
    const isFollowing = data.social.relationship === "accepted" || data.social.relationship === "pending";
    const response = await fetch("/api/follows", isFollowing
      ? { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: data.profile.id, mode: "unfollow" }) }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
    const result = await response.json();
    if (response.ok) {
      const next = isFollowing ? "none" : result.status;
      await load();
      toast.success(isFollowing ? "Você deixou de seguir" : next === "pending" ? "Solicitação enviada" : "Agora você está seguindo");
    } else toast.error("Não foi possível atualizar", { description: result.error });
    setBusy(false);
  }

  async function quickFollow(person: PersonRow) {
    const followed = data.social.viewer_following_ids.includes(person.profile.id);
    const response = await fetch("/api/follows", followed
      ? { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: person.profile.id, mode: "unfollow" }) }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.profile.username }) });
    if (!response.ok) return toast.error("Não foi possível atualizar a conexão.");
    setData((current: any) => ({ ...current, social: { ...current.social, viewer_following_ids: followed ? current.social.viewer_following_ids.filter((id: string) => id !== person.profile.id) : [...current.social.viewer_following_ids, person.profile.id] } }));
  }

  async function manageConnection(row: PersonRow, action: "accept" | "reject" | "unfollow" | "remove_follower" | "cancel") {
    const targetId = row.profile.id;
    if (["reject", "unfollow", "remove_follower", "cancel"].includes(action)) {
      const labels = {
        reject: ["Recusar solicitação?", "A solicitação será removida."],
        unfollow: ["Deixar de seguir?", `Você deixará de seguir @${row.profile.username}.`],
        remove_follower: ["Remover seguidor?", `@${row.profile.username} deixará de seguir você.`],
        cancel: ["Cancelar solicitação?", `A solicitação enviada para @${row.profile.username} será cancelada.`],
      } as const;
      const [title, description] = labels[action as keyof typeof labels];
      if (!(await confirmAction({ title, description, confirmLabel: "Confirmar" }))) return;
    }
    const response = action === "accept" || action === "reject"
      ? await fetch("/api/follows", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ follower_id: row.follower_id || targetId, action }) })
      : await fetch("/api/follows", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: targetId, mode: action === "remove_follower" ? "remove_follower" : "unfollow" }) });
    if (!response.ok) return toast.error("Não foi possível atualizar a conexão.");
    const refreshed = await fetch("/api/follows", { cache: "no-store" });
    if (refreshed.ok) setOwnConnections(await refreshed.json());
    toast.success(action === "accept" ? "Solicitação aceita" : action === "reject" ? "Solicitação recusada" : action === "remove_follower" ? "Seguidor removido" : action === "cancel" ? "Solicitação cancelada" : "Você deixou de seguir");
    load();
  }

  async function createList() { if (!listName.trim()) return; const response=await fetch("/api/lists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:listName})});const result=await response.json();if(!response.ok)return toast.error("Não foi possível criar a lista",{description:result.error});setData((current:any)=>({...current,lists:[{...result,items:[{count:0}]},...(current.lists||[])]}));setListName("");toast.success("Lista criada"); }

  const modalRows: PersonRow[] = connectionModal
    ? ((data?.social?.relationship === "self" ? ownConnections?.[connectionModal] : data?.social?.[connectionModal]) || []).map(normalizePerson).filter(Boolean) as PersonRow[]
    : [];
  const filteredRows = useMemo(() => modalRows.filter((row) => `${row.profile.display_name || ""} ${row.profile.username || ""}`.toLowerCase().includes(connectionSearch.trim().toLowerCase())), [modalRows, connectionSearch]);
  if (loading) return <><Search /><div className="empty"><Loader2 className="spin" /> Carregando perfil...</div></>;
  if (!data) return <><Search /><div className="empty"><LockKeyhole /> Este perfil não existe ou é privado.</div></>;

  const relationship = data.social?.relationship;
  const favoriteMovies = data.favorites.filter((item: any) => item.media_type === "movie").slice(0, 5);
  const favoriteSeries = data.favorites.filter((item: any) => item.media_type === "tv").slice(0, 5);
  return <><Search /><main className="public-profile profile-v2">
    <header className="profile-v2-hero panel">
      {data.profile.avatar_url ? <img src={data.profile.avatar_url} alt={data.profile.display_name} /> : <div className="public-profile-avatar">{data.profile.display_name?.slice(0, 2).toUpperCase()}</div>}
      <div className="profile-v2-copy"><span>@{data.profile.username}</span><h1>{data.profile.display_name}</h1>{data.profile.bio && <p>{data.profile.bio}</p>}<div className="profile-v2-counts"><button disabled={relationship !== "self" && data.social.followers == null} onClick={() => setConnectionModal("followers")}><strong>{data.social.followers_count}</strong> seguidores</button><button disabled={relationship !== "self" && data.social.following == null} onClick={() => setConnectionModal("following")}><strong>{data.social.following_count}</strong> seguindo</button></div></div>
      {relationship === "self" ? <button className={`btn profile-v2-action ${editingProfile ? "" : "primary"}`} onClick={() => setEditingProfile((value) => !value)}>{editingProfile ? <X size={15}/> : <Pencil size={15} />}{editingProfile ? "Fechar edição" : "Editar perfil"}</button> : data.social.can_follow && <button className={`btn profile-v2-action ${relationship === "none" ? "primary" : ""}`} disabled={busy} onClick={toggleFollow}>{busy ? <Loader2 className="spin" size={15} /> : relationship === "accepted" ? <UserCheck size={15} /> : <UserPlus size={15} />}{relationship === "accepted" ? "Seguindo" : relationship === "pending" ? "Solicitação enviada" : "Seguir"}</button>}
    </header>
    {relationship === "self" && editingProfile && <section className="profile-inline-editor"><div className="profile-inline-editor-head"><div><span className="eyebrow">EDITAR PERFIL</span><h2>Personalize sua página</h2><p className="muted">Foto, informações e seus Top 5 ficam todos aqui.</p></div><Link className="btn" href="/settings">Configurações da conta</Link></div><AvatarSettings/><ProfileShowcaseEditor/></section>}
    {data.locked && <section className="panel profile-locked"><LockKeyhole size={30} /><h2>Este perfil é privado</h2><p>Comece a seguir e aguarde a aprovação para ver atividades, favoritos e listas.</p></section>}

    {!data.locked && <section className="panel profile-top5-fold"><div><span className="eyebrow">TOP 5 FILMES</span><div className="profile-top5-row">{favoriteMovies.map((item:any)=><Link href={`/title/movie/${item.media.tmdb_id}`} key={`movie-${item.position}`}>{item.media.poster_path?<img loading="lazy" src={img(item.media.poster_path,"w342")} alt={item.media.title}/>:<Film/>}<small>{item.media.title}</small></Link>)}</div></div><div><span className="eyebrow">TOP 5 SÉRIES</span><div className="profile-top5-row">{favoriteSeries.map((item:any)=><Link href={`/title/tv/${item.media.tmdb_id}`} key={`tv-${item.position}`}>{item.media.poster_path?<img loading="lazy" src={img(item.media.poster_path,"w342")} alt={item.media.title}/>:<Film/>}<small>{item.media.title}</small></Link>)}</div></div></section>}

    <nav className="profile-tabs" aria-label="Conteúdo do perfil">{([['activity','Atividade',BookOpen],['reviews','Reviews',MessageSquareText],['likes','Curtidos',Heart],['lists','Listas',List],['connections',relationship === "self" && ownConnections?.incoming.length ? `Solicitações (${ownConnections.incoming.length})` : 'Seguidores / Seguindo',Users]] as const).map(([value,label,Icon]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><Icon size={15} />{label}</button>)}</nav>
    <section className="panel profile-tab-content">
      {tab === "activity" && <><div className="profile-tab-heading"><div><span className="eyebrow">ATIVIDADE</span><h2>Assistidos recentemente</h2></div></div><PosterRow items={data.activity?.slice(0, 6) || []} empty="Nenhuma atividade pública ainda." />{data.recent_reviews?.length > 0 && <div className="profile-reviews"><h3>Avaliações recentes</h3>{data.recent_reviews.slice(0, 4).map((row: any) => { const media = mediaOf(row); return <Link href={`/title/${media.media_type}/${media.tmdb_id}`} key={row.id}><strong>{media.title}</strong><span>{row.personal_rating != null ? `★ ${Number(row.personal_rating).toFixed(1)}` : "Resenha"}</span>{row.review && <p>{row.review}</p>}</Link>; })}</div>}{data.diary?.length > 0 && <div className="profile-diary"><h3>Diário recente</h3>{data.diary.slice(0, 5).map((entry: any) => { const library = Array.isArray(entry.library) ? entry.library[0] : entry.library; const media = mediaOf(library); return media && <div key={entry.id}><span>{new Date(entry.watched_at).toLocaleDateString("pt-BR")}</span><Link href={`/title/${media.media_type}/${media.tmdb_id}`}>{media.title}</Link>{entry.rating != null && <b>★ {Number(entry.rating).toFixed(1)}</b>}</div>; })}</div>}</>}
      {tab === "reviews" && <><div className="profile-tab-heading"><div><span className="eyebrow">REVIEWS</span><h2>Todas as reviews</h2></div><span className="profile-tab-total">{data.reviews?.length || 0}</span></div><ReviewList items={data.reviews || []} /></>}
      {tab === "lists" && <><div className="profile-tab-heading"><div><span className="eyebrow">COLEÇÕES</span><h2>Listas criadas</h2></div></div>{relationship === "self" && <div className="profile-list-create"><input value={listName} maxLength={80} onChange={event=>setListName(event.target.value)} onKeyDown={event=>event.key==="Enter"&&createList()} placeholder="Nome da nova lista"/><button className="btn primary" onClick={createList}><List size={15}/> Criar lista</button></div>}<div className="profile-list-grid">{data.lists?.map((list: any) => <article key={list.id}><List /><div><strong>{list.name}</strong><p>{list.description || "Lista pessoal"}</p><small>{list.items?.[0]?.count || 0} títulos</small></div></article>)}</div>{!data.lists?.length && <div className="profile-tab-empty">Nenhuma lista criada ainda.</div>}</>}
      {tab === "likes" && <><div className="profile-tab-heading"><div><span className="eyebrow">CURTIDAS</span><h2>Títulos curtidos</h2></div></div><PosterRow items={data.liked_titles || []} empty="Nenhum título curtido ainda." /></>}
      {tab === "connections" && <><div className="profile-tab-heading"><div><span className="eyebrow">CONEXÕES</span><h2>Seguidores, seguindo e solicitações</h2></div></div>{relationship === "self" && ownConnections ? <div className="profile-own-connections">
        {ownConnections.incoming.length > 0 && <section><h3>Solicitações recebidas <span>{ownConnections.incoming.length}</span></h3>{ownConnections.incoming.map((row) => <div className="profile-own-connection" key={`incoming-${row.follower_id}`}><Link href={`/u/${row.profile.username}`}><span className="profile-own-avatar">{row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : row.profile.display_name?.slice(0,2).toUpperCase()}</span><div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small></div></Link><div><button className="btn primary" onClick={() => manageConnection(row,"accept")}><Check size={14}/>Aceitar</button><button className="btn" onClick={() => manageConnection(row,"reject")}><X size={14}/>Recusar</button></div></div>)}</section>}
        {ownConnections.outgoing.length > 0 && <section><h3>Solicitações enviadas <span>{ownConnections.outgoing.length}</span></h3>{ownConnections.outgoing.map((row) => <div className="profile-own-connection" key={`outgoing-${row.following_id}`}><Link href={`/u/${row.profile.username}`}><span className="profile-own-avatar">{row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : row.profile.display_name?.slice(0,2).toUpperCase()}</span><div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small></div></Link><button className="btn" onClick={() => manageConnection(row,"cancel")}><Ban size={14}/>Cancelar</button></div>)}</section>}
        <div className="profile-own-columns"><section><h3>Seguindo <span>{ownConnections.following.length}</span></h3>{ownConnections.following.map((row) => <div className="profile-own-connection" key={`following-${row.following_id}`}><Link href={`/u/${row.profile.username}`}><span className="profile-own-avatar">{row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : row.profile.display_name?.slice(0,2).toUpperCase()}</span><div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small></div></Link><button className="btn" onClick={() => manageConnection(row,"unfollow")}><UserMinus size={14}/>Deixar de seguir</button></div>)}{!ownConnections.following.length && <p className="muted">Você ainda não segue ninguém.</p>}</section><section><h3>Seguidores <span>{ownConnections.followers.length}</span></h3>{ownConnections.followers.map((row) => <div className="profile-own-connection" key={`follower-${row.follower_id}`}><Link href={`/u/${row.profile.username}`}><span className="profile-own-avatar">{row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : row.profile.display_name?.slice(0,2).toUpperCase()}</span><div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small></div></Link><button className="btn" onClick={() => manageConnection(row,"remove_follower")}><UserMinus size={14}/>Remover</button></div>)}{!ownConnections.followers.length && <p className="muted">Você ainda não tem seguidores.</p>}</section></div>
      </div> : <div className="profile-connection-actions"><button className="btn" disabled={!data.social.followers} onClick={()=>setConnectionModal("followers")}><Users size={15}/>{data.social.followers_count} seguidores</button><button className="btn" disabled={!data.social.following} onClick={()=>setConnectionModal("following")}><UserCheck size={15}/>{data.social.following_count} seguindo</button></div>}</>}
    </section>
  </main>

  {connectionModal && <div className="profile-connections-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConnectionModal(null)}><section className="profile-connections-modal panel"><header><div><h2>{connectionModal === "followers" ? "Seguidores" : "Seguindo"}</h2><span>{modalRows.length} pessoas</span></div><button onClick={() => setConnectionModal(null)}><X /></button></header><label><SearchIcon size={16} /><input autoFocus value={connectionSearch} onChange={(e) => setConnectionSearch(e.target.value)} placeholder="Pesquisar nesta lista" /></label><div className="profile-connections-list">{filteredRows.map((row) => { const followed = data.social.viewer_following_ids.includes(row.profile.id); return <div key={row.profile.id}><Link href={`/u/${row.profile.username}`} onClick={() => setConnectionModal(null)}>{row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : <span>{row.profile.display_name?.slice(0,2).toUpperCase()}</span>}<div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small></div></Link>{relationship === "self" ? <button className="btn" onClick={() => manageConnection(row, connectionModal === "followers" ? "remove_follower" : "unfollow")}><UserMinus size={14}/>{connectionModal === "followers" ? "Remover" : "Deixar de seguir"}</button> : row.profile.id !== data.profile.id ? <button className={`btn ${followed ? "" : "primary"}`} onClick={() => quickFollow(row)}>{followed ? <><Check size={14} /> Seguindo</> : <><UserPlus size={14} /> Seguir</>}</button> : null}</div>; })}{!filteredRows.length && <div className="profile-tab-empty">Nenhum usuário encontrado.</div>}</div></section></div>}
  </>;
}
