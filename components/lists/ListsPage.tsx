"use client";

import "@/styles/features/lists.css";
import "@/styles/features/screen-kit.css";
import { apiFetch, errorMessage, isApiError } from "@/lib/api-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronRight, Globe, Link2, Lock, Pencil, Plus, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";
import { plural } from "@/lib/lists/validate";

import { ListCover } from "./ListCover";
import { ListFormDialog, type ListFormValue } from "./ListFormDialog";
import { ListMenu } from "./ListMenu";
import { Button } from "@/components/ui/Button";

/*
 * Listas V2.7 — "seleções de títulos que eu escolhi colocar juntos".
 * Card inteiro abre a lista; ações administrativas no menu ⋯.
 */

export type ListSummary = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  item_count: number;
  covers: (string | null)[];
  updated_at: string;
};

export async function copyListLink(id: string) {
  const url = `${window.location.origin}/lists/${id}`;

  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export function Visibility({ isPublic }: { isPublic: boolean }) {
  return isPublic ? (
    <span className="lst-visibility">
      <Globe size={12} aria-hidden="true" /> Pública
    </span>
  ) : (
    <span className="lst-visibility">
      <Lock size={12} aria-hidden="true" /> Privada
    </span>
  );
}

function Skeleton() {
  return (
    <div className="lst-grid" role="status" aria-label="Carregando suas listas">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="lst-card lst-card--skeleton">
          <div className="mc-skeleton lst-cover lst-cover--md" />
          <div className="mc-skeleton lst-skel-line is-wide" />
          <div className="mc-skeleton lst-skel-line" />
        </div>
      ))}
    </div>
  );
}

export function ListsPage() {
  const router = useRouter();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<"loading" | "auth" | "error" | "ready">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [form, setForm] = useState<{ open: boolean; initial: ListFormValue | null }>({ open: false, initial: null });

  const load = useCallback(async (target = 1) => {
    if (target === 1) setState("loading");
    else setLoadingMore(true);

    try {
      const result = await apiFetch(`/api/lists?page=${target}`, { cache: "no-store" });

      setLists((current) => (target === 1 ? result.custom_lists : [...current, ...result.custom_lists]));
      setTotal(result.total);
      setPage(result.page);
      setTotalPages(result.total_pages);
      setState("ready");
    } catch (error) {
      if (isApiError(error, "UNAUTHENTICATED")) setState("auth");
      else if (target === 1) setState("error");
      else toast.error("Não foi possível carregar mais listas.", { description: errorMessage(error) });
    } finally {
      setLoadingMore(false);
    }
  }, [toast]);

  useEffect(() => {
    void load(1);
  }, [load]);

  async function remove(list: ListSummary) {
    const confirmed = await confirmAction({
      title: "Excluir esta lista?",
      description: `"${list.name}" deixa de existir. Os títulos continuam na sua Biblioteca e o histórico não é alterado.`,
      confirmLabel: "Excluir lista",
    });

    if (!confirmed) return;

    // Fase 6: antes o fetch ficava fora de try — falha de rede virava erro sem aviso.
    try {
      await apiFetch(`/api/lists?id=${encodeURIComponent(list.id)}`, { method: "DELETE" });
    } catch (error) {
      toast.error("Não foi possível excluir a lista.", { description: errorMessage(error) });
      return;
    }

    setLists((current) => current.filter((row) => row.id !== list.id));
    setTotal((n) => n - 1);
    toast.success("Lista excluída.");
  }

  async function share(list: ListSummary) {
    if (await copyListLink(list.id)) toast.success("Link da lista copiado.");
    else toast.error("Não foi possível copiar o link.");
  }

  return (
    <>

      <header className="sk-head">
        <div className="sk-head-text">
          <h1>Listas</h1>
          <p>Seleções de filmes e séries feitas por você, na ordem que você escolher.</p>
        </div>
        {state === "ready" ? (
          <Button variant="primary" type="button" className="lst-new" onClick={() => setForm({ open: true, initial: null })}>
            <Plus size={16} aria-hidden="true" /> Nova lista
          </Button>
        ) : null}
      </header>

      {/* Watchlist automática: a fila "Quero assistir" com prioridade (fica fixa no topo das listas). */}
      <Link href="/watchlist" className="lst-watchlist-card">
        <Bookmark size={20} aria-hidden="true" />
        <span>
          <strong>Watchlist</strong>
          <small>Automática: tudo que está como Quero assistir, na ordem que você escolher.</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>

      {state === "loading" ? <Skeleton /> : null}

      {state === "auth" ? (
        <div className="sk-empty" role="alert">
          <h2>Entre para ver suas listas</h2>
          <a className="btn primary" href="/login?reason=session&next=/lists">
            Entrar
          </a>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="sk-empty" role="alert">
          <h2>Não foi possível carregar suas listas</h2>
          <Button variant="primary" type="button" onClick={() => load(1)}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {state === "ready" && lists.length === 0 ? (
        <div className="sk-empty">
          <h2>Nenhuma lista ainda</h2>
          <p>Crie uma lista para juntar filmes e séries do seu jeito: uma maratona, os favoritos do ano, o que indicar a alguém.</p>
        </div>
      ) : null}

      {state === "ready" && lists.length > 0 ? (
        <>
          <p className="lst-count">{plural(total, "lista", "listas")}</p>
          <div className="lst-grid lst-rows">
            {lists.map((list) => (
              <article key={list.id} className="lst-card">
                <Link href={`/lists/${list.id}`} className="lst-card-link" aria-label={`${list.name}, ${plural(list.item_count, "título", "títulos")}, ${list.is_public ? "pública" : "privada"}`}>
                  <ListCover posters={list.covers} count={3} />
                  <div className="lst-card-body">
                    <h2 className="lst-card-title lst-row-title">{list.name}</h2>
                    {list.description ? <p className="lst-card-desc">{list.description}</p> : null}
                    <p className="lst-card-meta">
                      <span>{plural(list.item_count, "título", "títulos")}</span> <Visibility isPublic={list.is_public} />
                    </p>
                  </div>
                </Link>
                <ListMenu
                  className="lst-card-menu"
                  label={`Ações da lista ${list.name}`}
                  items={[
                    { label: "Editar", icon: <Pencil size={16} aria-hidden="true" />, onSelect: () => setForm({ open: true, initial: list }) },
                    ...(list.is_public ? [{ label: "Copiar link", icon: <Link2 size={16} aria-hidden="true" />, onSelect: () => void share(list) }] : []),
                    { label: "Excluir", icon: <Trash2 size={16} aria-hidden="true" />, onSelect: () => void remove(list), danger: true },
                  ]}
                />
              </article>
            ))}
          </div>
          {page < totalPages ? (
            <div className="lst-more">
              <Button type="button" disabled={loadingMore} onClick={() => load(page + 1)}>
                {loadingMore ? "Carregando…" : "Mostrar mais listas"}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <ListFormDialog
        open={form.open}
        initial={form.initial}
        onClose={() => setForm({ open: false, initial: null })}
        onSaved={(saved) => {
          const editing = Boolean(form.initial?.id);

          setForm({ open: false, initial: null });

          if (editing) {
            setLists((current) => current.map((row) => (row.id === saved.id ? { ...row, ...saved } : row)));
            toast.success("Lista atualizada.");
          } else {
            toast.success("Lista criada.");
            router.push(`/lists/${saved.id}`);
          }
        }}
      />
    </>
  );
}
