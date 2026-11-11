"use client";


import { Poster } from "@/components/Poster";
import "@/styles/features/profile.css";
import "@/styles/features/screen-kit.css";
import { motion } from "motion/react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api-client";
import { ListCover } from "@/components/lists/ListCover";
import { useEffect, useMemo, useRef, useState, useEffectEvent } from "react";
import { useModal } from "@/hooks/useModal";
import { ConnectedPosterActions } from "@/components/media/ConnectedPosterActions";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Activity, Ban, Check, Film, List, Loader2, LockKeyhole, Pencil, PlusCircle, Search as SearchIcon, Star, Trophy, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { img } from "@/lib/tmdb";
import { CarouselRail } from "@/components/CarouselRail";
import { useConfirm } from "@/components/ConfirmProvider";
import { ProfileShowcaseEditor } from "@/components/ProfileShowcaseEditor";
import { AvatarSettings } from "@/components/AvatarSettings";
import { BannerSettings } from "@/components/BannerSettings";
import "@/styles/features/screen-band.css";
import { tasteAffinityLabel } from "@/lib/social/ratings";
import { Button } from "@/components/ui/Button";

type Tab = "activity" | "reviews" | "likes" | "lists" | "connections";
const isTab = (value: string | null): value is Tab =>
  value === "activity" || value === "reviews" || value === "likes" || value === "lists" || value === "connections";
type PersonRow = { follower_id?: string; following_id?: string; affinity_score?: number | null; profile: { id?: string; username: string; display_name: string; avatar_url?: string; follows_viewer?: boolean } };
type ConnectionType = "followers" | "following" | "friends" | "incoming" | "outgoing";
type ConnectionList = { items: PersonRow[]; page: number; total: number; hasMore: boolean; loading: boolean; loaded: boolean };
const CONNECTION_PAGE_SIZE = 24;
const emptyConnectionList: ConnectionList = { items: [], page: 0, total: 0, hasMore: false, loading: false, loaded: false };
const isConnectionType = (value: string | null): value is ConnectionType =>
  value === "followers" || value === "following" || value === "friends" || value === "incoming" || value === "outgoing";
type ConnectionCounts = { followers: number; following: number; friends: number; incoming: number; outgoing: number };
const mediaOf = (row: any) => Array.isArray(row?.media) ? row.media[0] : row?.media;
const normalizePerson = (row: any): PersonRow | null => {
  const profile = Array.isArray(row?.profile) ? row.profile[0] : row?.profile;
  // O perfil público não expõe id: a pessoa é identificada pelo username.
  return profile?.id || profile?.username ? { ...row, profile } : null;
};

function PosterRow({ items, empty }: { items: any[]; empty: string }) {
  if (!items.length) return <div className="profile-tab-empty">{empty}</div>;
  return <CarouselRail className="profile-media-row profile-media-carousel">{items.map((row, index) => { const media = mediaOf(row); return media && <div className="profile-poster-cell mc-pa-host mc-frame" key={row.id || `${media.media_type}-${media.tmdb_id}-${index}`}><Link href={`/title/${media.media_type}/${media.tmdb_id}`}><div>{media.poster_path ? <img src={img(media.poster_path, "w342")} alt={media.title} /> : <Film />}</div><strong>{media.title}</strong>{row.personal_rating != null && <small><Star size={12} fill="currentColor" /> {Number(row.personal_rating).toFixed(1)}</small>}</Link><ConnectedPosterActions media={{ tmdbId: Number(media.tmdb_id), mediaType: media.media_type === "tv" ? "tv" : "movie", title: media.title, posterPath: media.poster_path ?? null }} /></div>; })}</CarouselRail>;
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
          ? <Poster path={media.poster_path} alt={media.title} sizes="72px" tmdbSize="w185" />
          : <Film size={24} />}
      </div>
      <article>
        <header>
          <div>
            <strong>{media.title}</strong>
            <small>{media.media_type === "movie" ? "Filme" : "Série"}{date ? `, ${new Date(date).toLocaleDateString("pt-BR")}` : ""}</small>
          </div>
          {row.personal_rating != null && <span><Star size={14} fill="currentColor" /> {Number(row.personal_rating).toFixed(1)}</span>}
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
const ACTIVITY_LABELS: Record<string, { icon: typeof Activity; label: (metadata: any, mediaType?: string) => string }> = {
  library_added: { icon: PlusCircle, label: () => "Adicionou à biblioteca" },
  status_changed: {
    icon: Check,
    label: (metadata) => {
      const labels: Record<string, string> = {
        want: "quer assistir",
        watching: "está assistindo",
        watched: "assistiu",
        paused: "pausado", // Fase 7: faltava — o feed mostrava "Marcou como paused"
        dropped: "abandonou",
      };
      return `Marcou como ${labels[metadata?.to] || metadata?.to || "atualizado"}`;
    },
  },
  season_completed: { icon: Trophy, label: () => "Completou uma temporada" },
  // Legado: `series_completed` era gravado em toda mudança para "Assistido", inclusive
  // em filmes — para filme significa "assistiu" (docs/V2.5-DIARY.md §1.4).
  series_completed: { icon: Trophy, label: (_metadata, mediaType) => (mediaType === "movie" ? "Assistiu" : "Completou a série") },
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
            <span className="profile-activity-icon"><Icon size={16} /></span>
            <div>
              <strong>{config.label(event.metadata, media?.media_type)}</strong>
              <small>{title}, {new Date(event.occurred_at).toLocaleDateString("pt-BR")}</small>
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
      {loading && <p className="muted"><Loader2 className="spin" size={16} /> Carregando...</p>}
      {hasMore && !loading && (
        <Button type="button" className="profile-activity-more" onClick={onLoadMore}>
          Carregar mais
        </Button>
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
  // Fase 6: falha ao carregar ≠ "perfil não existe".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab");
    return isTab(requested) ? requested : "activity";
  });
  const [connectionModal, setConnectionModal] = useState<"followers" | "following" | "friends" | null>(null);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [listName, setListName] = useState("");
  const [connectionCounts, setConnectionCounts] = useState<ConnectionCounts | null>(null);
  const [connectionSubTab, setConnectionSubTab] = useState<ConnectionType>(() => {
    const requested = searchParams.get("connection");
    return isConnectionType(requested) ? requested : "followers";
  });
  const [connectionLists, setConnectionLists] = useState<Record<ConnectionType, ConnectionList>>({
    followers: emptyConnectionList,
    following: emptyConnectionList,
    friends: emptyConnectionList,
    incoming: emptyConnectionList,
    outgoing: emptyConnectionList,
  });
  const connectionLoadsRef = useRef(new Map<ConnectionType, Promise<void>>());
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

  function syncProfileTabs(tabValue: Tab, connectionValue = connectionSubTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tabValue === "activity") params.delete("tab");
    else params.set("tab", tabValue);
    if (tabValue === "connections") params.set("connection", connectionValue);
    else params.delete("connection");
    const query = params.toString();
    router.replace(`/u/${encodeURIComponent(username)}${query ? `?${query}` : ""}`, { scroll: false });
  }

  function selectProfileTab(nextTab: Tab) {
    setTab(nextTab);
    syncProfileTabs(nextTab);
  }

  function selectConnectionTab(nextTab: ConnectionType) {
    setConnectionSubTab(nextTab);
    syncProfileTabs("connections", nextTab);
  }

  async function loadActivity(options: { append?: boolean } = {}) {
    setActivityFeed((current) => ({ ...current, loading: true }));
    const nextPage = options.append ? activityPageRef.current + 1 : 1;

    try {
      const result = await apiFetch(`/api/public-profile/${encodeURIComponent(username)}/activity?page=${nextPage}`, {
        cache: "no-store",
      });
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
    } catch (error) {
      // Recuperável: a atividade fica como estava (o botão de carregar continua disponível).
      console.warn("[perfil] atividade:", errorMessage(error));
      setActivityFeed((current) => ({ ...current, loading: false }));
    }
  }

  async function load() {
    /*
     * Fase 6: 404 = perfil não existe; outro erro mantém o que já estava na tela (a página recarrega
     * ao voltar o foco — uma falha passageira não pode apagar o perfil) ou mostra o erro de verdade.
     * Antes: qualquer erro virava "não existe" e falha de rede deixava a tela carregando para sempre.
     */
    try {
      setData(await apiFetch(`/api/public-profile/${encodeURIComponent(username)}`, { cache: "no-store" }));
      setLoadError(null);
    } catch (error) {
      if (isApiError(error, "NOT_FOUND")) {
        setData(null);
        setLoadError(null);
      } else {
        setLoadError(errorMessage(error, "Não foi possível carregar o perfil."));
      }
    } finally {
      setLoading(false);
    }
  }
  // Os efeitos abaixo disparam por username/eventos; useEffectEvent chama sempre o load mais recente.
  const loadFromEffect = useEffectEvent(() => { void load(); });
  useEffect(() => { loadFromEffect(); }, [username]);
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") loadFromEffect(); };
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
      loadFromEffect();
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
    refreshConnectionCounts();
  }, [data?.social?.relationship]);

  async function loadConnectionList(type: ConnectionType, options: { append?: boolean } = {}) {
    const pending = connectionLoadsRef.current.get(type);
    if (pending) return pending;

    const nextPage = options.append ? connectionLists[type].page + 1 : 1;
    const request = (async () => {
    setConnectionLists((current) => ({
      ...current,
      [type]: { ...current[type], loading: true },
    }));

    try {
      const result = await apiFetch(`/api/follows?type=${type}&page=${nextPage}&limit=${CONNECTION_PAGE_SIZE}`, {
        cache: "no-store",
      });
      const items: PersonRow[] = Array.isArray(result.items) ? result.items : [];

      setConnectionLists((current) => ({
        ...current,
        [type]: {
          items: [...new Map<string, PersonRow>(
            (options.append ? [...current[type].items, ...items] : items)
                .map((item, index) => [String(item.profile.id || item.profile.username?.trim().toLowerCase() || item.follower_id || item.following_id || index), item] as const)
          ).values()],
          page: nextPage,
          total: Number(result.total || 0),
          hasMore: Boolean(result.has_more),
          loading: false,
          loaded: true,
        },
      }));
    } catch (error) {
      setConnectionLists((current) => ({
        ...current,
        [type]: { ...current[type], loading: false },
      }));
      toast.error("Não foi possível carregar essa lista.", { description: errorMessage(error) });
    } finally {
      connectionLoadsRef.current.delete(type);
    }
    })();
    connectionLoadsRef.current.set(type, request);
    return request;
  }

  function openConnectionModal(type: "followers" | "following" | "friends") {
    setConnectionModal(type);
    if ((relationship === "self" || (type === "friends" && data?.social?.friends !== null)) && !connectionLists[type].loaded) void loadConnectionList(type);
  }

  function refreshConnectionCounts() {
    // Recuperável: sem o resumo, as contagens ficam como estavam. Antes não havia catch (erro solto).
    apiFetch("/api/follows", { cache: "no-store" })
      .then((summary) => setConnectionCounts(summary?.counts || null))
      .catch((error) => console.warn("[perfil] contagens de conexões:", errorMessage(error)));
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
  const hasData = data != null;
  const viewerRelationship = data?.social?.relationship;
  useEffect(() => {
    if (hasData && viewerRelationship !== "self" && tab === "connections") setTab("activity");
  }, [hasData, viewerRelationship, tab]);

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

  // Fase 7: Escape, laço do Tab, foco na busca ao abrir, devolução de foco e trava de rolagem.
  const connectionModalRef = useModal(Boolean(connectionModal), () => setConnectionModal(null), false, "input");

  async function toggleFollow() {
    if (busy || !data) return;
    if (!data.social.viewer_username) {
      router.push(`/login?next=${encodeURIComponent(`/u/${username}`)}`);
      return;
    }
    setBusy(true);
    const relationship = data.social.relationship;
    try {
      const result = relationship === "accepted" || relationship === "pending"
        ? await apiFetch("/api/follows", { method: "DELETE", json: { username, mode: relationship === "pending" ? "cancel" : "unfollow" } })
        : await apiFetch("/api/follows", { method: "POST", json: { username } });
      await load();
      toast.success(relationship === "accepted" ? "Você deixou de seguir" : relationship === "pending" ? "Solicitação cancelada" : result?.status === "pending" ? "Solicitação enviada" : "Agora você está seguindo");
    } catch (error) {
      toast.error("Não foi possível atualizar", { description: errorMessage(error) });
    } finally {
      // Fase 6: antes, falha de rede deixava o botão preso.
      setBusy(false);
    }
  }

  async function quickFollow(person: PersonRow) {
    if (!data.social.viewer_username) {
      router.push(`/login?next=${encodeURIComponent(`/u/${username}`)}`);
      return;
    }
    const followed = data.social.viewer_following_usernames.includes(person.profile.username);
    const pending = (data.social.viewer_pending_usernames || []).includes(person.profile.username);
    let nextStatus: "accepted" | "pending" | "none" = "none";
    try {
      if (followed || pending) {
        await apiFetch("/api/follows", { method: "DELETE", json: { username: person.profile.username, mode: pending ? "cancel" : "unfollow" } });
      } else {
        const result = await apiFetch("/api/follows", { method: "POST", json: { username: person.profile.username } });
        nextStatus = result?.status === "pending" ? "pending" : "accepted";
      }
    } catch (error) {
      return toast.error("Não foi possível atualizar a conexão.", { description: errorMessage(error) });
    }
    setData((current: any) => {
      const followingNames: string[] = current.social.viewer_following_usernames || [];
      const pendingNames: string[] = current.social.viewer_pending_usernames || [];
      return {
        ...current,
        social: {
          ...current.social,
          viewer_following_usernames: nextStatus === "accepted"
            ? [...new Set([...followingNames, person.profile.username])]
            : followingNames.filter((name) => name !== person.profile.username),
          viewer_pending_usernames: nextStatus === "pending"
            ? [...new Set([...pendingNames, person.profile.username])]
            : pendingNames.filter((name) => name !== person.profile.username),
        },
      };
    });
    toast.success(followed ? "Você deixou de seguir" : pending ? "Solicitação cancelada" : nextStatus === "pending" ? "Solicitação enviada" : "Agora você está seguindo");
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
    try {
      if (action === "accept" || action === "reject") {
        await apiFetch("/api/follows", { method: "PATCH", json: { follower_id: row.follower_id || targetId, action } });
      } else {
        await apiFetch("/api/follows", { method: "DELETE", json: { ...(targetId ? { user_id: targetId } : { username: row.profile.username }), mode: action === "remove_follower" ? "remove_follower" : "unfollow" } });
      }
    } catch (error) {
      return toast.error("Não foi possível atualizar a conexão.", { description: errorMessage(error) });
    }
    refreshConnectionCounts();
    void loadConnectionList(connectionSubTab);
    toast.success(action === "accept" ? "Solicitação aceita" : action === "reject" ? "Solicitação recusada" : action === "remove_follower" ? "Seguidor removido" : action === "cancel" ? "Solicitação cancelada" : "Você deixou de seguir");
    load();
  }

  async function createList() { if (!listName.trim()) return; let result; try { result = await apiFetch("/api/lists", { method: "POST", json: { name: listName } }); } catch (error) { return toast.error("Não foi possível criar a lista", { description: errorMessage(error) }); }setData((current:any)=>({...current,lists:[{...result,items:[{count:0}]},...(current.lists||[])]}));setListName("");toast.success("Lista criada"); }

  const socialData = data?.social;
  const modalRows = useMemo<PersonRow[]>(
    () =>
      connectionModal
        ? (((socialData?.relationship === "self" || connectionModal === "friends") ? connectionLists[connectionModal].items : socialData?.[connectionModal]) || []).map(normalizePerson).filter(Boolean) as PersonRow[]
        : [],
    [connectionModal, connectionLists, socialData]
  );
  const filteredRows = useMemo(() => modalRows.filter((row) => `${row.profile.display_name || ""} ${row.profile.username || ""}`.toLowerCase().includes(connectionSearch.trim().toLowerCase())), [modalRows, connectionSearch]);
  if (loading) return <><div className="empty"><Loader2 className="spin" /> Carregando perfil...</div></>;
  if (!data && loadError) return <><div className="empty" role="alert">{loadError}</div></>;
  if (!data) return <><div className="empty"><LockKeyhole /> Este perfil não existe ou é privado.</div></>;

  const relationship = data.social?.relationship;
  const favoriteMovies = data.favorites.filter((item: any) => item.media_type === "movie").slice(0, 5);
  const favoriteSeries = data.favorites.filter((item: any) => item.media_type === "tv").slice(0, 5);
  return <>{/* Fase 5 (P2-10): <div> — o <main> é do layout raiz. */}<div className="public-profile profile-v2">
    {/* Banner do perfil (como em outras redes); sem banner, o cabeçalho fica como antes. */}
    <div className={`profile-v2-top${data.profile.banner_url ? " has-banner" : ""}`}>
    {data.profile.banner_url ? (
      <div className="tt-band profile-v2-banner"><div className="tt-band-screen">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Blob, como o avatar */}
        <img src={data.profile.banner_url} alt="" />
      </div></div>
    ) : null}
    <header className="profile-v2-hero">
      {data.profile.avatar_url ? <img src={data.profile.avatar_url} alt={data.profile.display_name} /> : <div className="public-profile-avatar">{data.profile.display_name?.slice(0, 2).toUpperCase()}</div>}
      <div className="profile-v2-copy"><span>@{data.profile.username}</span><h1>{data.profile.display_name}</h1>{data.profile.bio && <p>{data.profile.bio}</p>}<div className="profile-v2-counts"><button disabled={relationship !== "self" && data.social.followers == null} onClick={() => openConnectionModal("followers")}><strong>{data.social.followers_count}</strong> seguidores</button><span aria-hidden="true">, </span><button disabled={relationship !== "self" && data.social.following == null} onClick={() => openConnectionModal("following")}><strong>{data.social.following_count}</strong> seguindo</button>{relationship === "self" && <><span aria-hidden="true">, </span><button onClick={() => openConnectionModal("friends")}><strong>{data.social.friends_count || 0}</strong> amigos</button></>}</div></div>
      {relationship === "self" ? <Button variant={editingProfile ? "secondary" : "primary"} className="profile-v2-action" onClick={() => setEditingProfile((value) => !value)}>{editingProfile ? <X size={16}/> : <Pencil size={16} />}{editingProfile ? "Fechar edição" : "Editar perfil"}</Button> : data.social.can_follow && <Button variant={relationship === "none" ? "primary" : "secondary"} className="profile-v2-action" disabled={busy} onClick={toggleFollow}>{busy ? <Loader2 className="spin" size={16} /> : relationship === "accepted" ? <UserCheck size={16} /> : <UserPlus size={16} />}{relationship === "accepted" ? data.social.viewer_follows_you ? "Seguindo de volta" : "Seguindo" : relationship === "pending" ? "Solicitação enviada" : data.social.viewer_follows_you ? "Seguir de volta" : "Seguir"}</Button>}
    </header>
    </div>
    {relationship === "self" && editingProfile && <section className="profile-inline-editor"><div className="profile-inline-editor-head"><div><h2>Personalize sua página</h2><p className="muted">Foto, informações e seus Top 5 ficam todos aqui.</p></div><Link className="btn" href="/settings">Configurações da conta</Link></div><AvatarSettings/><BannerSettings current={data.profile.banner_url ?? null} onChange={(banner_url) => setData((d: typeof data) => (d ? { ...d, profile: { ...d.profile, banner_url } } : d))} /><ProfileShowcaseEditor/></section>}
    {data.locked && <section className="panel profile-locked"><LockKeyhole size={30} /><h2>Este perfil é privado</h2><p>Comece a seguir e aguarde a aprovação para ver atividades, favoritos e listas.</p></section>}

    {/* V3.3: Top 5 vazio não vira duas linhas em branco — some para quem visita; o dono vê onde configurar. */}{!data.locked && (favoriteMovies.length > 0 || favoriteSeries.length > 0) && <section className="profile-top5-fold">{favoriteMovies.length > 0 && <div><h3 className="pf-subhead">Top 5 filmes</h3><div className="profile-top5-row">{favoriteMovies.map((item:any)=><div className="profile-poster-cell mc-pa-host" key={`movie-${item.position}`}><Link href={`/title/movie/${item.media.tmdb_id}`}>{item.media.poster_path?<img loading="lazy" src={img(item.media.poster_path,"w342")} alt={item.media.title}/>:<Film/>}<small>{item.media.title}</small></Link><ConnectedPosterActions media={{ tmdbId: Number(item.media.tmdb_id), mediaType: "movie", title: item.media.title, posterPath: item.media.poster_path ?? null }} /></div>)}</div></div>}{favoriteSeries.length > 0 && <div><h3 className="pf-subhead">Top 5 séries</h3><div className="profile-top5-row">{favoriteSeries.map((item:any)=><div className="profile-poster-cell mc-pa-host" key={`tv-${item.position}`}><Link href={`/title/tv/${item.media.tmdb_id}`}>{item.media.poster_path?<img loading="lazy" src={img(item.media.poster_path,"w342")} alt={item.media.title}/>:<Film/>}<small>{item.media.title}</small></Link><ConnectedPosterActions media={{ tmdbId: Number(item.media.tmdb_id), mediaType: "tv", title: item.media.title, posterPath: item.media.poster_path ?? null }} /></div>)}</div></div>}</section>}{!data.locked && relationship === "self" && favoriteMovies.length === 0 && favoriteSeries.length === 0 && <section className="panel profile-top5-fold profile-top5-empty"><p className="muted">Seu Top 5 de filmes e séries aparece aqui. Escolha em <strong>Editar perfil</strong>, entre os títulos que você já assistiu.</p></section>}

    <nav className="sk-tabs pf-tabs" role="tablist" aria-label="Conteúdo do perfil">{([['activity','Atividade'],['reviews','Reviews'],['likes','Curtidos'],['lists','Listas'],['connections',connectionCounts?.incoming ? `Solicitações (${connectionCounts.incoming})` : 'Seguidores e seguindo']] as const).filter(([value]) => value !== "connections" || relationship === "self").map(([value,label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className="sk-tab" onClick={() => selectProfileTab(value)}>{label}{tab === value && <motion.span layoutId="profile-tab-indicator" className="sk-tab-indicator" transition={{ type: "spring", duration: 0.32, bounce: 0 }} aria-hidden="true" />}</button>)}</nav>
    <section className="profile-tab-content">
      {tab === "activity" && <><div className="profile-tab-heading"><div><h2>O que aconteceu recentemente</h2></div></div>{data.section_visibility?.activity ? <ActivityFeed items={activityFeed.items} hasMore={activityFeed.hasMore} loading={activityFeed.loading} onLoadMore={() => loadActivity({ append: true })} /> : <div className="profile-tab-empty">Esta atividade é privada.</div>}{data.recent_reviews?.length > 0 && <div className="profile-reviews"><h3>Avaliações recentes</h3>{data.recent_reviews.slice(0, 4).map((row: any) => { const media = mediaOf(row); return <Link href={`/title/${media.media_type}/${media.tmdb_id}`} key={row.id}><strong>{media.title}</strong><span>{row.personal_rating != null ? `★ ${Number(row.personal_rating).toFixed(1)}` : "Resenha"}</span>{row.review && <p>{row.review}</p>}</Link>; })}</div>}{data.diary?.length > 0 && <div className="profile-diary"><h3>Diário recente</h3>{data.diary.slice(0, 5).map((entry: any) => { const library = Array.isArray(entry.library) ? entry.library[0] : entry.library; const media = mediaOf(library); return media && <div key={entry.id}><span>{new Date(entry.watched_at).toLocaleDateString("pt-BR")}</span><Link href={`/title/${media.media_type}/${media.tmdb_id}`}>{media.title}</Link>{entry.rating != null && <b>★ {Number(entry.rating).toFixed(1)}</b>}</div>; })}</div>}</>}
      {tab === "reviews" && <><div className="profile-tab-heading"><div><h2>Todas as reviews</h2></div><span className="profile-tab-total">{data.reviews?.length || 0}</span></div><ReviewList items={data.reviews || []} /></>}
      {tab === "lists" && <><div className="profile-tab-heading"><div><h2>Listas criadas</h2></div></div>{relationship === "self" && <div className="profile-list-create"><input value={listName} maxLength={80} onChange={event=>setListName(event.target.value)} onKeyDown={event=>event.key==="Enter"&&createList()} placeholder="Nome da nova lista"/><Button variant="primary" onClick={createList}><List size={16}/> Criar lista</Button></div>}<div className="profile-list-grid">{data.lists?.map((list: any) => <Link href={`/lists/${list.id}`} key={list.id} className="profile-list-card lst-profile-card"><article><ListCover posters={list.covers || []} size="sm" /><div><strong>{list.name}</strong>{list.description ? <p>{list.description}</p> : null}<small>{list.items?.[0]?.count || 0} {(list.items?.[0]?.count || 0) === 1 ? "título" : "títulos"}{relationship === "self" ? (list.is_public ? ", pública" : ", privada") : ""}</small></div></article></Link>)}</div>{!data.lists?.length && <div className="profile-tab-empty">Nenhuma lista criada ainda.</div>}</>}
      {tab === "likes" && <><div className="profile-tab-heading"><div><h2>Títulos curtidos</h2></div></div><PosterRow items={data.liked_titles || []} empty="Nenhum título curtido ainda." /></>}
      {tab === "connections" && relationship === "self" && <><div className="profile-tab-heading"><div><h2>Seguidores, seguindo e solicitações</h2></div></div>{(() => {
        const currentList = connectionLists[connectionSubTab];
        const subTabs: { type: ConnectionType; label: string }[] = [
          { type: "incoming", label: "Solicitações" },
          { type: "outgoing", label: "Enviadas" },
          { type: "followers", label: "Seguidores" },
          { type: "following", label: "Seguindo" },
          { type: "friends", label: "Amigos" },
        ];
        const rowAction: Record<ConnectionType, { label: string; icon: typeof Check; danger?: boolean; onClick: (row: PersonRow) => void }[]> = {
          incoming: [
            { label: "Aceitar", icon: Check, onClick: (row) => manageConnection(row, "accept") },
            { label: "Recusar", icon: X, danger: true, onClick: (row) => manageConnection(row, "reject") },
          ],
          outgoing: [{ label: "Cancelar", icon: Ban, onClick: (row) => manageConnection(row, "cancel") }],
          following: [{ label: "Deixar de seguir", icon: UserMinus, onClick: (row) => manageConnection(row, "unfollow") }],
          friends: [{ label: "Deixar de seguir", icon: UserMinus, onClick: (row) => manageConnection(row, "unfollow") }],
          followers: [{ label: "Remover", icon: UserMinus, danger: true, onClick: (row) => manageConnection(row, "remove_follower") }],
        };
        const emptyLabel: Record<ConnectionType, string> = {
          incoming: "Nenhuma solicitação pendente.",
          outgoing: "Nenhuma solicitação enviada.",
          followers: "Você ainda não tem seguidores.",
          following: "Você ainda não segue ninguém.",
          friends: "As amizades aparecem quando vocês se seguem mutuamente.",
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
                  onClick={() => selectConnectionTab(type)}
                >
                  {label}
                  {connectionCounts?.[type] ? <span>{connectionCounts[type]}</span> : null}
                </button>
              ))}
            </div>
            <div className="profile-own-connections-list" role="tabpanel">
              {(currentList.loading || !currentList.loaded) && !currentList.items.length ? (
                <p className="muted"><Loader2 className="spin" size={16} /> Carregando...</p>
              ) : !currentList.items.length ? (
                <p className="muted">{emptyLabel[connectionSubTab]}</p>
              ) : (
                currentList.items.map((row) => {
                  const key = row.profile.id || row.profile.username?.trim().toLowerCase() || row.follower_id || row.following_id;
                  const isFollowing = data.social.viewer_following_usernames.includes(row.profile.username);
                  const isPending = (data.social.viewer_pending_usernames || []).includes(row.profile.username);
                  const actions = connectionSubTab === "followers"
                    ? [
                        ...rowAction.followers.map((action) => ({ ...action, quiet: true })),
                        {
                          label: isPending ? "Solicitação enviada" : isFollowing ? "Seguindo de volta" : "Seguir de volta",
                          icon: isPending ? Check : isFollowing ? UserCheck : UserPlus,
                          quiet: isFollowing || isPending,
                          onClick: (person: PersonRow) => quickFollow(person),
                        },
                      ]
                    : rowAction[connectionSubTab].map((action) => ({ ...action, quiet: Boolean(action.danger) }));
                  return (
                    <div className="profile-own-connection" key={key}>
                      <Link href={`/u/${row.profile.username}`}>
                        <span className="profile-own-avatar">
                          {row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : row.profile.display_name?.slice(0, 2).toUpperCase()}
                        </span>
                        <div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small>{row.affinity_score != null && <small className="profile-affinity-label">{tasteAffinityLabel(row.affinity_score)}, {row.affinity_score}%</small>}</div>
                      </Link>
                      <div>
                        {actions.map(({ label, icon: Icon, quiet, onClick }) => (
                          <Button key={label} type="button" variant={quiet ? "secondary" : "primary"} onClick={() => onClick(row)}>
                            <Icon size={14} />{label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
              {currentList.hasMore && (
                <Button
                  type="button"
                  className="profile-own-connections-more"
                  disabled={currentList.loading}
                  onClick={() => loadConnectionList(connectionSubTab, { append: true })}
                >
                  {currentList.loading ? <Loader2 className="spin" size={14} /> : null} Carregar mais
                </Button>
              )}
            </div>
          </div>
        );
      })()}</>}
    </section>
  </div>

  {connectionModal && <div className="profile-connections-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConnectionModal(null)}><section ref={connectionModalRef as React.RefObject<HTMLElement>} className="profile-connections-modal panel" role="dialog" aria-modal="true" aria-label={connectionModal === "followers" ? "Seguidores" : connectionModal === "friends" ? "Amigos" : "Seguindo"}><header><div><h2>{connectionModal === "followers" ? "Seguidores" : connectionModal === "friends" ? "Amigos" : "Seguindo"}</h2><span>{connectionModal === "friends" ? (relationship === "self" ? connectionCounts?.friends : data.social.friends_count) : modalRows.length} {connectionModal === "friends" ? "pessoas" : modalRows.length === 1 ? "pessoa" : "pessoas"}</span></div><button type="button" title="Fechar" aria-label="Fechar" onClick={() => setConnectionModal(null)}><X /></button></header><label><SearchIcon size={16} /><input aria-label="Pesquisar nesta lista" value={connectionSearch} onChange={(e) => setConnectionSearch(e.target.value)} placeholder="Pesquisar nesta lista" /></label><div className="profile-connections-list">{filteredRows.map((row) => { const followed = data.social.viewer_following_usernames.includes(row.profile.username); return <div key={row.profile.username}><Link href={`/u/${row.profile.username}`} onClick={() => setConnectionModal(null)}>{row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" /> : <span>{row.profile.display_name?.slice(0,2).toUpperCase()}</span>}<div><strong>{row.profile.display_name}</strong><small>@{row.profile.username}</small>{row.affinity_score != null && <small className="profile-affinity-label">{tasteAffinityLabel(row.affinity_score)}, {row.affinity_score}%</small>}</div></Link>{relationship === "self" ? <Button onClick={() => manageConnection(row, connectionModal === "followers" ? "remove_follower" : "unfollow")}><UserMinus size={14}/>{connectionModal === "followers" ? "Remover" : "Deixar de seguir"}</Button> : row.profile.username !== data.social.viewer_username && row.profile.username !== data.profile.username ? <Button variant={followed ? "secondary" : "primary"} onClick={() => quickFollow(row)}>{followed ? <><Check size={14} /> {row.profile.follows_viewer ? "Seguindo de volta" : "Seguindo"}</> : <><UserPlus size={14} /> {row.profile.follows_viewer ? "Seguir de volta" : "Seguir"}</>}</Button> : null}</div>; })}{!filteredRows.length && <div className="profile-tab-empty">Nenhum usuário encontrado.</div>}</div>{connectionModal === "friends" && connectionLists.friends.hasMore && <Button className="profile-own-connections-more" disabled={connectionLists.friends.loading} onClick={() => loadConnectionList("friends", { append: true })}>Carregar mais amigos</Button>}</section></div>}
  </>;
}
