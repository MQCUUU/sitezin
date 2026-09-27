"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Activity, Ban, BookOpen, Check, Film, Heart, List, Loader2, LockKeyhole, MessageSquareText, Pencil, PlusCircle, Repeat, Search as SearchIcon, Star, Trophy, UserCheck, UserMinus, UserPlus, Users, X } from "lucide-react";
import { Search } from "@/components/Search";
import { useToast } from "@/components/ToastProvider";
import { img } from "@/lib/tmdb";
import { CarouselRail } from "@/components/CarouselRail";
import { useConfirm } from "@/components/ConfirmProvider";
import { ProfileShowcaseEditor } from "@/components/ProfileShowcaseEditor";
import { AvatarSettings } from "@/components/AvatarSettings";

type Tab = "activity" | "reviews" | "likes" | "lists" | "connections";
type PersonRow = { follower_id?: string; following_id?: string; profile: { id: string; username: string; display_name: string; avatar_url?: string } };
type ConnectionType = "followers" | "following" | "incoming" | "outgoing";
type ConnectionList = { items: PersonRow[]; page: number; total: number; hasMore: boolean; loading: boolean; loaded: boolean };
const CONNECTION_PAGE_SIZE = 24;
const emptyConnectionList: ConnectionList = { items: [], page: 0, total: 0, hasMore: false, loading: false, loaded: false };
type ConnectionCounts = { followers: number; following: number; incoming: number; outgoing: number };
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

/*
 * E1 — event_type é restrito por CHECK no banco a 5 valores, mas a UI
 * não confia nisso: qualquer `event_type` fora do mapa cai no
 * fallback neutro (ícone genérico + metadata.title cru), sem quebrar
 * o render (item 37 da fase).
 */
const ACTIVITY_LABELS: Record<string, { icon: typeof Activity; label: (metadata: any) => string }> = {
  library_added: { icon: PlusCircle, label: () => "Adicionou à biblioteca" },
  status_changed: {
    icon: Check,
    label: (metadata) => {
      const labels: Record<string, string> = {
        want: "quer assistir",
        watching: "está assistindo",
        watched: "assistiu",
        dropped: "abandonou",
        rewatching: "está reassistindo",
        rewatched: "reassistiu",
      };
      return `Marcou como ${labels[metadata?.to] || metadata?.to || "atualizado"}`;
    },
  },
  rewatch_started: { icon: Repeat, label: () => "Começou a reassistir" },
  season_completed: { icon: Trophy, label: () => "Completou uma temporada" },
  series_completed: { icon: Trophy, label: () => "Completou a série" },
};

function ActivityFeed({ items, hasMore, loading, onLoadMore }: { items: any[]; hasMore: boolean; loading: boolean; onLoadMore: () => void }) {
  if (!items.length && !loading) {
    return <div className="profile-tab-empty">Nenhuma atividade pública ainda.</div>;
  }

  return (
    <div className="profile-activity-feed">
      {items.map((event) => {
        const media = Array.isArray(event.media) ? event.media[0] : event.media;
        const config = ACTIVITY_LABELS[event.event_type] || { icon: Activity, label: () => "Atualização" };
        const Icon = config.icon;
        const title = media?.title || event.metadata?.title || "Título removido";
        const content = (
          <>
            <span className="profile-activity-icon"><Icon size={15} /></span>
            <div>
              <strong>{config.label(event.metadata)}</strong>
              <small>{title} · {new Date(event.occurred_at).toLocaleDateString("pt-BR")}</small>
            </div>
          </>
        );
        return media?.tmdb_id ? (
          <Link className="profile-activity-row" href={`/title/${media.media_type}/${media.tmdb_id}`} key={event.id}>
            {content}
          </Link>
        ) : (
          <div className="profile-activity-row" key={event.id}>
            {content}
          </div>
        );
      })}
      {loading && <p className="muted"><Loader2 className="spin" size={15} /> Carregando...</p>}
      {hasMore && !loading && (
        <button type="button" className="btn profile-activity-more" onClick={onLoadMore}>
          Carregar mais
        </button>
      )}
    </div>
  );
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
  const [connectionCounts, setConnectionCounts] = useState<ConnectionCounts | null>(null);
  const [connectionSubTab, setConnectionSubTab] = useState<ConnectionType>("followers");
  const [connectionLists, setConnectionLists] = useState<Record<ConnectionType, ConnectionList>>({
    followers: emptyConnectionList,
    following: emptyConnectionList,
    incoming: emptyConnectionList,
    outgoing: emptyConnectionList,
  });
  const [editingProfile, setEditingProfile] = useState(false);
  const [activityFeed, setActivityFeed] = useState<{ items: any[]; page: number; hasMore: boolean; loading: boolean; loaded: boolean }>({
    items: [],
    page: 0,
    hasMore: false,
    loading: false,
    loaded: false,
  });

  /*
   * `activityPageRef`/`activityLoadedRef` (não `activityFeed.page`/
   * `.loaded` direto) evitam duas armadilhas de closure:
   * 1. O efeito de montagem roda 2x em desenvolvimento (React Strict
   *    Mode) — sem uma guarda síncrona (ref), as duas invocações viam
   *    `loaded: false` e disparavam duas cargas da página 1 em
   *    paralelo.
   * 2. `onLoadMore` é um closure criado no render — se ele lesse
   *    `activityFeed.page` diretamente, capturaria o valor daquele
   *    render específico; combinado com o Strict Mode acima, a
   *    segunda chamada de página 1 podia resolver DEPOIS da primeira
   *    página de "carregar mais", sobrescrevendo o append com um
   *    replace. Ref é sempre o valor atual, nunca capturado.
   */
  const activityPageRef = useRef(0);
  const activityLoadedRef = useRef(false);

  async function loadActivity(options: { append?: boolean } = {}) {
    setActivityFeed((current) => ({ ...current, loading: true }));
    const nextPage = options.append ? activityPageRef.current + 1 : 1;

    try {
      const response = await fetch(`/api/public-profile/${encodeURIComponent(username)}/activity?page=${nextPage}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json();
      const items = Array.isArray(result.items) ? result.items : [];

      activityPageRef.current = nextPage;
      activityLoadedRef.current = true;

      setActivityFeed((current) => ({
        items: options.append ? [...current.items, ...items] : items,
        page: nextPage,
        hasMore: Boolean(result.has_more),
        loading: false,
        loaded: true,
      }));
    } catch {
      setActivityFeed((current) => ({ ...current, loading: false }));
    }
  }

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
  /*
   * E1 — antes buscava o grafo INTEIRO de follows sempre que o dono
   * abria o próprio perfil (E0 §22, HIGH). Agora busca só o resumo
   * (contagens via COUNT, mesmo endpoint do FollowRequestNotifier) e
   * carrega cada lista sob demanda, paginada, quando a aba "Conexões"
   * é aberta — ver loadConnectionList/openConnectionsTab abaixo.
   */
  useEffect(() => {
    if (data?.social?.relationship !== "self") return;
    fetch("/api/follows", { cache: "no-store" }).then(async (response) => {
      if (response.ok) {
        const summary = await response.json();
        setConnectionCounts(summary.counts || null);
      }
    });
  }, [data?.social?.relationship]);

  async function loadConnectionList(type: ConnectionType, options: { append?: boolean } = {}) {
    setConnectionLists((current) => ({
      ...current,
      [type]: { ...current[type], loading: true },
    }));

    const nextPage = options.append ? connectionLists[type].page + 1 : 1;

    try {
      const response = await fetch(`/api/follows?type=${type}&page=${nextPage}&limit=${CONNECTION_PAGE_SIZE}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json();
      const items: PersonRow[] = Array.isArray(result.items) ? result.items : [];

      setConnectionLists((current) => ({
        ...current,
        [type]: {
          items: options.append ? [...current[type].items, ...items] : items,
          page: nextPage,
          total: Number(result.total || 0),
          hasMore: Boolean(result.has_more),
          loading: false,
          loaded: true,
        },
      }));
    } catch {
      setConnectionLists((current) => ({
        ...current,
        [type]: { ...current[type], loading: false },
      }));
      toast.error("Não foi possível carregar essa lista.");
    }
  }

  function refreshConnectionCounts() {
    fetch("/api/follows", { cache: "no-store" }).then(async (response) => {
      if (response.ok) {
        const summary = await response.json();
        setConnectionCounts(summary.counts || null);
      }
    });
  }

  useEffect(() => {
    const refreshFollows = () => {
      if (data?.social?.relationship === "self") {
        refreshConnectionCounts();
        void loadConnectionList(connectionSubTab);
      }
      void load();
    };
    window.addEventListener("mycatalog:follows-updated", refreshFollows);
    return () => window.removeEventListener("mycatalog:follows-updated", refreshFollows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, data?.social?.relationship, connectionSubTab]);
  useEffect(() => { const requested = searchParams.get("tab"); if (["activity","reviews","likes","lists","connections"].includes(requested || "")) setTab(requested as Tab); }, [searchParams]);

  useEffect(() => {
    if (tab !== "connections" || data?.social?.relationship !== "self") return;
    if (!connectionLists[connectionSubTab].loaded) void loadConnectionList(connectionSubTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, connectionSubTab, data?.social?.relationship]);

  const activityUsernameRef = useRef<string | null>(null);

  useEffect(() => {
    /*
     * Troca de usuário de verdade (navegou para outro perfil) reseta o
     * feed. Isso teria que ser um efeito separado em `[username]`, mas
     * esse efeito TAMBÉM roda no mount inicial (username já está
     * definido no primeiro render) — em React 18 Strict Mode (dev), o
     * mount roda effect→cleanup→effect de novo, e um efeito de reset
     * em `[username]` sozinho reseta `activityLoadedRef` DEPOIS que o
     * efeito abaixo já tinha marcado `loaded = true`, causando uma
     * segunda carga real (não só a dupla invocação inofensiva de
     * Strict Mode). Comparar com o último username visto evita reset
     * nessa primeira vez — só reseta numa troca de perfil genuína.
     */
    if (activityUsernameRef.current !== null && activityUsernameRef.current !== username) {
      activityPageRef.current = 0;
      activityLoadedRef.current = false;
      setActivityFeed({ items: [], page: 0, hasMore: false, loading: false, loaded: false });
    }
    activityUsernameRef.current = username;

    if (tab !== "activity" || !data) return;
    if (!activityLoadedRef.current) {
      activityLoadedRef.current = true;
      void loadActivity();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, data, username]);

  useEffect(() => {
    if (!connectionModal) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setConnectionModal(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [connectionModal]);

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
    refreshConnectionCounts();
    void loadConnectionList(connectionSubTab);
    toast.success(action === "accept" ? "Solicitação aceita" : action === "reject" ? "Solicitação recusada" : action === "remove_follower" ? "Seguidor removido" : action === "cancel" ? "Solicitação cancelada" : "Você deixou de seguir");
    load();
  }

  async function createList() { if (!listName.trim()) return; const response=await fetch("/api/lists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:listName})});const result=await response.json();if(!response.ok)return toast.error("Não foi possível criar a lista",{description:result.error});setData((current:any)=>({...current,lists:[{...result,items:[{count:0}]},...(current.lists||[])]}));setListName("");toast.success("Lista criada"); }

  const modalRows: PersonRow[] = connectionModal
    ? ((data?.social?.[connectionModal]) || []).map(normalizePerson).filter(Boolean) as PersonRow[]
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

    <nav className="profile-tabs" role="tablist" aria-label="Conteúdo do perfil">{([['activity','Atividade',BookOpen],['reviews','Reviews',MessageSquareText],['likes','Curtidos',Heart],['lists','Listas',List],['connections',relationship === "self" && connectionCounts?.incoming ? `Solicitações (${connectionCounts.incoming})` : 'Seguidores / Seguindo',Users]] as const).map(([value,label,Icon]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><Icon size={15} />{label}</button>)}</nav>
    <section className="panel profile-tab-content">
      {tab === "activity" && <><div className="profile-tab-heading"><div><span className="eyebrow">ATIVIDADE</span><h2>O que aconteceu recentemente</h2></div></div>{data.section_visibility?.activity ? <ActivityFeed items={activityFeed.items} hasMore={activityFeed.hasMore} loading={activityFeed.loading} onLoadMore={() => loadActivity({ append: true })} /> : <div className="profile-tab-empty">Esta atividade é privada.</div>}{data.recent_reviews?.length > 0 && <div className="profile-reviews"><h3>Avaliações recentes</h3>{data.recent_reviews.slice(0, 4).map((row: any) => { const media = mediaOf(row); return <Link href={`/title/${media.media_type}/${media.tmdb_id}`} key={row.id}><strong>{media.title}</strong><span>{row.personal_rating != null ? `★ ${Number(row.personal_rating).toFixed(1)}` : "Resenha"}</span>{row.review && <p>{row.review}</p>}</Link>; })}</div>}{data.diary?.length > 0 && <div className="profile-diary"><h3>Diário recente</h3>{data.diary.slice(0, 5).map((entry: any) => { const library = Array.isArray(entry.library) ? entry.library[0] : entry.library; const media = mediaOf(library); return media && <div key={entry.id}><span>{new Date(entry.watched_at).toLocaleDateString("pt-BR")}</span><Link href={`/title/${media.media_type}/${media.tmdb_id}`}>{media.title}</Link>{entry.rating != null && <b>★ {Number(entry.rating).toFixed(1)}</b>}</div>; })}</div>}</>}
      {tab === "reviews" && <><div className="profile-tab-heading"><div><span className="eyebrow">REVIEWS</span><h2>Todas as reviews</h2></div><span className="profile-tab-total">{data.reviews?.length || 0}</span></div><ReviewList items={data.reviews || []} /></>}
      {tab === "lists" && <><div className="profile-tab-heading"><div><span className="eyebrow">COLEÇÕES</span><h2>Listas criadas</h2></div></div>{relationship === "self" && <div className="profile-list-create"><input value={listName} maxLength={80} onChange={event=>setListName(event.target.value)} onKeyDown={event=>event.key==="Enter"&&createList()} placeholder="Nome da nova lista"/><button className="btn primary" onClick={createList}><List size={15}/> Criar lista</button></div>}<div className="profile-list-grid">{data.lists?.map((list: any) => <Link href={`/lists/${list.id}`} key={list.id} className="profile-list-card"><article><List /><div><strong>{list.name}</strong><p>{list.description || "Lista pessoal"}</p><small>{list.items?.[0]?.count || 0} títulos</small></div></article></Link>)}</div>{!data.lists?.length && <div className="profile-tab-empty">Nenhuma lista criada ainda.</div>}</>}
      {tab === "likes" && <><div className="profile-tab-heading"><div><span className="eyebrow">CURTIDAS</span><h2>Títulos curtidos</h2></div></div><PosterRow items={data.liked_titles || []} empty="Nenhum título curtido ainda." /></>}
      {tab === "connections" && <><div className="profile-tab-heading"><div><span className="eyebrow">CONEXÕES</span><h2>Seguidores, seguindo e solicitações</h2></div></div>{relationship === "self" ? (() => {
        const currentList = connectionLists[connectionSubTab];
        const subTabs: { type: ConnectionType; label: string }[] = [
          { type: "incoming", label: "Solicitações" },
          { type: "outgoing", label: "Enviadas" },
          { type: "followers", label: "Seguidores" },
          { type: "following", label: "Seguindo" },
        ];
        const rowAction: Record<ConnectionType, { label: string; icon: typeof Check; danger?: boolean; onClick: (row: PersonRow) => void }[]> = {
          incoming: [
            { label: "Aceitar", icon: Check, onClick: (row) => manageConnection(row, "accept") },
            { label: "Recusar", icon: X, danger: true, onClick: (row) => manageConnection(row, "reject") },
          ],
          outgoing: [{ label: "Cancelar", icon: Ban, onClick: (row) => manageConnection(row, "cancel") }],
          following: [{ label: "Deixar de seguir", icon: UserMinus, onClick: (row) => manageConnection(row, "unfollow") }],
          followers: [{ label: "Remover", icon: UserMinus, onClick: (row) => manageConnection(row, "remove_follower") }],
        };
        const emptyLabel: Record<ConnectionType, string> = {
          incoming: "Nenhuma solicitação pendente.",
          outgoing: "Nenhuma solicitação enviada.",
          followers: "Você ainda não tem seguidores.",
          following: "Você ainda não segue ninguém.",
        };
        return (
          <div className="profile-own-connections">
            <div className="profile-own-connections-tabs" role="tablist" aria-label="Tipo de conexão">
              {subTabs.map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={connectionSubTab === type}
                  className={connectionSubTab === type ? "active" : ""}
                  onClick={() => setConnectionSubTab(type)}
                >
                  {label}
                  {connectionCounts?.[type] ? <span>{connectionCounts[type]}</span> : null}
                </button>
              ))}
            </div>
            <div className="profile-own-connections-list" role="tabpanel">
              {currentList.loading && !currentList.items.length ? (
                <p className="muted"><Loader2 className="spin" size={15} /> Carregando...</p>
              ) : !currentList.items.length ? (
                <p className="muted">{emptyLabel[connectionSubTab]}</p>
              ) : (
                currentList.items.map((row) => {
                  const key = row.follower_id || row.following_id || row.profile.id;
                  return (
                    <div className="profile-own-connection" key={key}>
                      <Link href={`/u/${row.profile.username}`}>
                        <span className="profile-own-avatar">
                          {row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : row.profile.display_name?.slice(0, 2).toUpperCase()}
                        </span>
                        <div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small></div>
                      </Link>
                      <div>
                        {rowAction[connectionSubTab].map(({ label, icon: Icon, danger, onClick }) => (
                          <button key={label} type="button" className={danger ? "btn" : "btn primary"} onClick={() => onClick(row)}>
                            <Icon size={14} />{label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
              {currentList.hasMore && (
                <button
                  type="button"
                  className="btn profile-own-connections-more"
                  disabled={currentList.loading}
                  onClick={() => loadConnectionList(connectionSubTab, { append: true })}
                >
                  {currentList.loading ? <Loader2 className="spin" size={14} /> : null} Carregar mais
                </button>
              )}
            </div>
          </div>
        );
      })() : <div className="profile-connection-actions"><button className="btn" disabled={!data.social.followers} onClick={()=>setConnectionModal("followers")}><Users size={15}/>{data.social.followers_count} seguidores</button><button className="btn" disabled={!data.social.following} onClick={()=>setConnectionModal("following")}><UserCheck size={15}/>{data.social.following_count} seguindo</button></div>}</>}
    </section>
  </main>

  {connectionModal && <div className="profile-connections-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConnectionModal(null)}><section className="profile-connections-modal panel" role="dialog" aria-modal="true" aria-label={connectionModal === "followers" ? "Seguidores" : "Seguindo"}><header><div><h2>{connectionModal === "followers" ? "Seguidores" : "Seguindo"}</h2><span>{modalRows.length} pessoas</span></div><button type="button" title="Fechar" aria-label="Fechar" onClick={() => setConnectionModal(null)}><X /></button></header><label><SearchIcon size={16} /><input autoFocus value={connectionSearch} onChange={(e) => setConnectionSearch(e.target.value)} placeholder="Pesquisar nesta lista" /></label><div className="profile-connections-list">{filteredRows.map((row) => { const followed = data.social.viewer_following_ids.includes(row.profile.id); return <div key={row.profile.id}><Link href={`/u/${row.profile.username}`} onClick={() => setConnectionModal(null)}>{row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : <span>{row.profile.display_name?.slice(0,2).toUpperCase()}</span>}<div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small></div></Link>{relationship === "self" ? <button className="btn" onClick={() => manageConnection(row, connectionModal === "followers" ? "remove_follower" : "unfollow")}><UserMinus size={14}/>{connectionModal === "followers" ? "Remover" : "Deixar de seguir"}</button> : row.profile.id !== data.profile.id ? <button className={`btn ${followed ? "" : "primary"}`} onClick={() => quickFollow(row)}>{followed ? <><Check size={14} /> Seguindo</> : <><UserPlus size={14} /> Seguir</>}</button> : null}</div>; })}{!filteredRows.length && <div className="profile-tab-empty">Nenhum usuário encontrado.</div>}</div></section></div>}
  </>;
}
