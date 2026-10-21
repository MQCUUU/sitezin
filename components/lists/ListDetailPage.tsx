"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Clapperboard, Link2, ListOrdered, Pencil, Plus, Search as SearchIcon, Trash2, X } from "lucide-react";

import { Search } from "@/components/Search";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";
import { useAuthState } from "@/hooks/useLibraryAuth";
import { loginHref } from "@/lib/auth/pending-action";
import { img } from "@/lib/tmdb";
import { mediaStatusLabel } from "@/lib/media-status";
import { moveInOrder, plural } from "@/lib/lists/validate";

import { AddTitlesDialog } from "./AddTitlesDialog";
import { ListCover } from "./ListCover";
import { ListFormDialog } from "./ListFormDialog";
import { ListMenu } from "./ListMenu";
import { Visibility, copyListLink } from "./ListsPage";

/*
 * Detalhe da lista. Itens na ordem editorial do dono (position). "Reorganizar"
 * troca o card por controles ↑ ↓ (teclado e toque; sem depender de arrastar).
 * "Remover da lista" nunca mexe na Biblioteca. Busca local (?q=) filtra só esta
 * lista mantendo a ordem. Visitante de lista pública não vê ações nem a
 * Biblioteca do dono; lista privada para outros = "não encontrada".
 */

type Item = { rank: number; media_id: number; tmdb_id: number; media_type: "movie" | "tv"; title: string; original_title: string | null; poster_path: string | null; release_date: string | null; first_air_date: string | null; library_status: string | null };
type Meta = { id: string; name: string; description: string | null; is_public: boolean; is_owner: boolean; item_count: number; covers: string[]; owner: { username: string | null; display_name: string | null } };

function Skeleton() {
  return (
    <div role="status" aria-label="Carregando a lista">
      <div className="lst-detail-head">
        <div className="mc-skeleton lst-cover lst-cover--lg" />
        <div style={{ flex: 1, display: "grid", gap: 10 }}>
          <div className="mc-skeleton lst-skel-line" />
          <div className="mc-skeleton lst-skel-line is-wide" />
        </div>
      </div>
      <div className="lst-items">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="mc-skeleton lst-skel-poster" />
        ))}
      </div>
    </div>
  );
}

function DetailContent() {
  const params = useParams<{ id: string }>();
  const listId = params?.id;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const q = (search.get("q") || "").trim();
  const toast = useToast();
  const authState = useAuthState();
  const confirmAction = useConfirm();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [state, setState] = useState<"loading" | "missing" | "error" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [reorder, setReorder] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [searchInput, setSearchInput] = useState(q);
  const firstLoad = useRef(true);

  const load = useCallback(
    async (target = 1) => {
      if (!listId) return;
      if (target === 1 && firstLoad.current) setState("loading");
      else setBusy(true);

      try {
        const qs = new URLSearchParams({ list_id: listId, page: String(target) });

        if (q) qs.set("q", q);

        const response = await fetch(`/api/lists/items?${qs}`, { cache: "no-store" });

        if (response.status === 404) {
          setState("missing");
          return;
        }

        if (!response.ok) throw new Error(String(response.status));

        const result = await response.json();

        setMeta(result.list);
        setItems((current) => (target === 1 ? result.items : [...current, ...result.items]));
        setPage(result.page);
        setTotalPages(result.total_pages);
        setTotalFiltered(result.total_filtered);
        if (result.members) setMembers(new Set(result.members));
        setState("ready");
        firstLoad.current = false;
      } catch {
        if (target === 1 && firstLoad.current) setState("error");
        else toast.error("Não foi possível carregar a lista.");
      } finally {
        setBusy(false);
      }
    },
    [listId, q, toast]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  // Busca local na URL (replace: digitar não empilha histórico).
  useEffect(() => {
    const value = searchInput.trim();

    if (value === q) return;

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(search.toString());

      if (value) next.set("q", value);
      else next.delete("q");
      router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, q, search, pathname, router]);

  useEffect(() => setSearchInput(q), [q]);

  async function move(index: number, delta: number) {
    const item = items[index];
    const target = index + delta;

    if (!item || target < 0 || target >= (meta?.item_count ?? 0) || pending !== null) return;

    const previous = items;

    setPending(item.media_id);
    if (target < items.length) setItems(moveInOrder(items, index, target).map((row, i) => ({ ...row, rank: i + 1 })));

    try {
      const response = await fetch("/api/lists/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: listId, media_id: item.media_id, to_index: target }),
      });

      if (!response.ok) throw new Error("move");

      setAnnounce(`${item.title} movido para a posição ${target + 1}.`);
      if (target >= previous.length) void load(1);
    } catch {
      setItems(previous);
      toast.error("Não foi possível mover o título.");
    } finally {
      setPending(null);
    }
  }

  async function removeItem(item: Item) {
    const previous = items;

    setItems((current) => current.filter((row) => row.media_id !== item.media_id).map((row, i) => ({ ...row, rank: i + 1 })));
    setMeta((current) => (current ? { ...current, item_count: current.item_count - 1 } : current));
    setTotalFiltered((n) => n - 1);

    try {
      const response = await fetch("/api/lists/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: listId, media_id: item.media_id }),
      });

      if (!response.ok) throw new Error("remove");

      setMembers((current) => {
        const next = new Set(current);

        next.delete(`${item.media_type}:${item.tmdb_id}`);
        return next;
      });
      setAnnounce(`${item.title} removido da lista.`);
    } catch {
      setItems(previous);
      setMeta((current) => (current ? { ...current, item_count: current.item_count + 1 } : current));
      setTotalFiltered((n) => n + 1);
      toast.error("Não foi possível remover o título da lista.");
    }
  }

  async function deleteList() {
    if (!meta) return;

    const confirmed = await confirmAction({
      title: "Excluir esta lista?",
      description: `"${meta.name}" deixa de existir. Os títulos continuam na sua Biblioteca e o histórico não é alterado.`,
      confirmLabel: "Excluir lista",
    });

    if (!confirmed) return;

    const response = await fetch(`/api/lists?id=${encodeURIComponent(meta.id)}`, { method: "DELETE" });

    if (!response.ok) {
      toast.error("Não foi possível excluir a lista.");
      return;
    }

    toast.success("Lista excluída.");
    router.push("/lists");
  }

  async function share() {
    if (!meta) return;

    if (await copyListLink(meta.id)) toast.success("Link da lista copiado.");
    else toast.error("Não foi possível copiar o link.");
  }

  // Capa = primeiros pôsteres da lista inteira. Sem busca, os itens carregados já
  // refletem reordenação/remoção otimistas; com busca, vale a capa do servidor.
  const covers = useMemo(() => {
    const local = items.map((item) => item.poster_path).filter((p): p is string => Boolean(p)).slice(0, 4);

    return !q && (local.length >= 4 || items.length >= (meta?.item_count ?? 0)) ? local : meta?.covers ?? [];
  }, [items, q, meta]);

  if (state === "loading") return <Skeleton />;

  if (state === "missing") {
    return (
      <div className="lst-state" role="alert">
        <strong>Lista não encontrada.</strong>
        <span>Ela pode ter sido excluída ou ser privada.</span>
        {/* Fase 3: "minhas listas" é rota privada — visitante recebe um próximo passo público. */}
        {authState === "authenticated" ? (
          <Link className="btn" href="/lists">
            Ir para minhas listas
          </Link>
        ) : (
          <span className="lst-state-actions">
            <Link className="btn" href="/discover">
              Explorar títulos
            </Link>
            {authState === "guest" && (
              <Link className="btn primary" href={loginHref(pathname, "action")}>
                Entrar
              </Link>
            )}
          </span>
        )}
      </div>
    );
  }

  if (state === "error" || !meta) {
    return (
      <div className="lst-state" role="alert">
        <strong>Não foi possível carregar esta lista.</strong>
        <button type="button" className="btn primary" onClick={() => load(1)}>
          Tentar de novo
        </button>
      </div>
    );
  }

  const owner = meta.is_owner;
  const ownerName = meta.owner.display_name || meta.owner.username || "outro usuário";
  const canReorder = owner && !q && meta.item_count > 1;

  return (
    <>
      {owner ? (
        <Link href="/lists" className="lst-back">
          <ArrowLeft size={16} aria-hidden="true" /> Listas
        </Link>
      ) : null}

      <header className="lst-detail-head">
        <ListCover posters={covers} size="lg" />
        <div className="lst-detail-text">
          <span className="lst-eyebrow">{owner ? "Sua lista" : `Lista de ${ownerName}`}</span>
          <h1>{meta.name}</h1>
          {meta.description ? <p className="lst-detail-desc">{meta.description}</p> : null}
          <p className="lst-card-meta">
            {plural(meta.item_count, "título", "títulos")} · <Visibility isPublic={meta.is_public} />
          </p>
          <div className="lst-detail-actions">
            {owner ? (
              <>
                <button type="button" className="btn primary" onClick={() => setAdding(true)}>
                  <Plus size={16} aria-hidden="true" /> Adicionar títulos
                </button>
                {canReorder || reorder ? (
                  <button type="button" className={`btn${reorder ? " primary-soft" : ""}`} aria-pressed={reorder} onClick={() => setReorder((v) => !v)}>
                    {reorder ? <Check size={16} aria-hidden="true" /> : <ListOrdered size={16} aria-hidden="true" />}
                    {reorder ? "Concluir" : "Reorganizar"}
                  </button>
                ) : null}
                <ListMenu
                  label="Mais ações da lista"
                  items={[
                    { label: "Editar lista", icon: <Pencil size={16} aria-hidden="true" />, onSelect: () => setEditing(true) },
                    ...(meta.is_public ? [{ label: "Copiar link", icon: <Link2 size={16} aria-hidden="true" />, onSelect: () => void share() }] : []),
                    { label: "Excluir lista", icon: <Trash2 size={16} aria-hidden="true" />, onSelect: () => void deleteList(), danger: true },
                  ]}
                />
              </>
            ) : meta.is_public ? (
              <button type="button" className="btn" onClick={() => void share()}>
                <Link2 size={16} aria-hidden="true" /> Copiar link
              </button>
            ) : null}
          </div>
          {owner && !meta.is_public ? <p className="lst-hint">Esta lista é privada. Para compartilhar, torne-a pública em “Editar lista”.</p> : null}
        </div>
      </header>

      <p className="lst-sr" role="status" aria-live="polite">
        {announce}
      </p>

      {meta.item_count > 0 ? (
        <label className="lst-search lst-search--local">
          <SearchIcon size={16} aria-hidden="true" />
          <span className="lst-sr">Buscar nesta lista</span>
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar nesta lista…" />
          {searchInput ? (
            <button type="button" className="lst-icon-btn" onClick={() => setSearchInput("")} aria-label="Limpar busca">
              <X size={16} />
            </button>
          ) : null}
        </label>
      ) : null}

      {reorder ? <p className="lst-hint">Use as setas para mudar a ordem. A nova ordem é salva na hora.</p> : null}

      {meta.item_count === 0 ? (
        <div className="lst-state">
          <Clapperboard size={26} aria-hidden="true" />
          <strong>Esta lista ainda está vazia.</strong>
          {owner ? (
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden="true" /> Adicionar títulos
            </button>
          ) : null}
        </div>
      ) : totalFiltered === 0 && q ? (
        <div className="lst-state">
          <strong>Nenhum título desta lista corresponde à busca.</strong>
          <button type="button" className="btn" onClick={() => setSearchInput("")}>
            Limpar busca
          </button>
        </div>
      ) : (
        <ol className={`lst-items${reorder ? " is-reordering" : ""}${busy ? " is-busy" : ""}`} aria-busy={busy}>
          {items.map((item, index) => {
            const year = (item.media_type === "tv" ? item.first_air_date : item.release_date)?.slice(0, 4);
            const href = `/title/${item.media_type}/${item.tmdb_id}`;

            return (
              <li key={item.media_id} className="lst-item">
                <Link href={href} className="lst-item-poster" tabIndex={reorder ? -1 : 0} aria-label={`${item.title}${year ? `, ${year}` : ""}`}>
                  {item.poster_path ? (
                    <img src={img(item.poster_path, "w342")} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="lst-item-fallback" aria-hidden="true">
                      <Clapperboard size={22} />
                    </span>
                  )}
                  {reorder ? <span className="lst-item-rank">{item.rank}</span> : null}
                </Link>
                <div className="lst-item-text">
                  <Link href={href} className="lst-item-title" tabIndex={-1}>
                    {item.title}
                  </Link>
                  <small>
                    {item.media_type === "tv" ? "Série" : "Filme"}
                    {year ? ` · ${year}` : ""}
                    {owner && item.library_status ? ` · ${mediaStatusLabel(item.library_status)}` : ""}
                  </small>
                </div>
                {owner && reorder ? (
                  <div className="lst-item-order" role="group" aria-label={`Ordem de ${item.title}`}>
                    <button type="button" className="lst-icon-btn" disabled={index === 0 || pending !== null} onClick={() => move(index, -1)} aria-label={`Mover ${item.title} para a posição ${item.rank - 1}`}>
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" className="lst-icon-btn" disabled={item.rank >= meta.item_count || pending !== null} onClick={() => move(index, 1)} aria-label={`Mover ${item.title} para a posição ${item.rank + 1}`}>
                      <ArrowDown size={16} />
                    </button>
                  </div>
                ) : owner ? (
                  <button type="button" className="lst-item-remove" onClick={() => removeItem(item)} aria-label={`Remover ${item.title} da lista`} title="Remover da lista">
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {state === "ready" && page < totalPages ? (
        <div className="lst-more">
          <button type="button" className="btn" disabled={busy} onClick={() => load(page + 1)}>
            {busy ? "Carregando…" : `Carregar mais (${totalFiltered - items.length})`}
          </button>
        </div>
      ) : null}

      {owner ? (
        <>
          <AddTitlesDialog
            open={adding}
            listId={meta.id}
            members={members}
            onClose={() => {
              setAdding(false);
              void load(1);
            }}
            onAdded={(key) => {
              setMembers((current) => new Set(current).add(key));
              setMeta((current) => (current ? { ...current, item_count: current.item_count + 1 } : current));
            }}
          />
          <ListFormDialog
            open={editing}
            initial={{ id: meta.id, name: meta.name, description: meta.description, is_public: meta.is_public }}
            onClose={() => setEditing(false)}
            onSaved={(saved) => {
              setEditing(false);
              setMeta((current) => (current ? { ...current, name: saved.name, description: saved.description, is_public: saved.is_public } : current));
              toast.success("Lista atualizada.");
            }}
          />
        </>
      ) : null}
    </>
  );
}

export function ListDetailPage() {
  return (
    <>
      <div className="topbar">
        <Search />
      </div>
      <Suspense fallback={<Skeleton />}>
        <DetailContent />
      </Suspense>
    </>
  );
}
