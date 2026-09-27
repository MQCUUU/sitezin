"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Globe, Loader2, Lock, Pencil, Plus, Search as SearchIcon, Trash2, X } from "lucide-react";

import { Search } from "@/components/Search";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";
import { img } from "@/lib/tmdb";
import { STATUS_LABELS } from "@/lib/types";
import type { LibraryItem } from "@/lib/types";

/*
 * app/lists/[id]/page.tsx — detalhe de uma lista (D1)
 *
 * Não reaproveita <PosterGrid> aqui: o botão de remover do PosterGrid
 * chama DELETE /api/library/[id] (apaga o título da biblioteca inteira).
 * Numa lista, "remover" precisa significar "tirar desta lista" —
 * DELETE /api/lists/items — então a grade é própria, deliberadamente
 * mais simples, para não correr o risco de apagar a biblioteca do
 * usuário por engano.
 */

type ListItem = LibraryItem & { library_id: string };

type ListMeta = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  is_owner: boolean;
  owner: { username: string | null; display_name: string | null };
};

type Estado = "carregando" | "privada" | "nao-encontrada" | "erro" | "pronto";

export default function ListDetailPage() {
  const params = useParams<{ id: string }>();
  const listId = params?.id;
  const toast = useToast();
  const confirmAction = useConfirm();

  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [estado, setEstado] = useState<Estado>("carregando");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPublic, setEditPublic] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    if (!listId) return;
    setEstado("carregando");

    try {
      const response = await fetch(`/api/lists/items?list_id=${encodeURIComponent(listId)}`, {
        cache: "no-store",
      });

      if (response.status === 403) {
        setEstado("privada");
        return;
      }

      if (response.status === 404) {
        setEstado("nao-encontrada");
        return;
      }

      if (!response.ok) throw new Error(String(response.status));

      const result = await response.json();

      setMeta(result.list);
      setItems(
        Array.isArray(result.items)
          ? result.items.map((row: any) => ({
              ...row,
              library_id: row.id,
              ...row.media,
            }))
          : []
      );
      setEstado("pronto");
    } catch (error) {
      console.error("Erro ao carregar lista:", error);
      setEstado("erro");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  function startEditing() {
    if (!meta) return;
    setEditName(meta.name);
    setEditDescription(meta.description || "");
    setEditPublic(meta.is_public);
    setEditing(true);
  }

  async function saveEdit() {
    if (!meta) return;
    const trimmed = editName.trim();
    if (trimmed.length < 2) {
      toast.error("Use pelo menos 2 caracteres no nome.");
      return;
    }

    setSavingEdit(true);

    try {
      const response = await fetch("/api/lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: meta.id,
          name: trimmed,
          description: editDescription.trim() || null,
          is_public: editPublic,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        toast.error(result.error || "Não foi possível salvar.");
        return;
      }

      setMeta((current) =>
        current ? { ...current, name: trimmed, description: editDescription.trim() || null, is_public: editPublic } : current
      );
      setEditing(false);
      toast.success("Lista atualizada.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteList() {
    if (!meta) return;

    const confirmed = await confirmAction({
      title: "Excluir lista?",
      description: `"${meta.name}" será removida permanentemente. Os títulos continuam na sua biblioteca.`,
      confirmLabel: "Excluir lista",
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/lists?id=${encodeURIComponent(meta.id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        toast.error(result.error || "Não foi possível excluir a lista.");
        return;
      }

      toast.success("Lista excluída.");
      window.location.href = "/lists";
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível excluir a lista.");
    }
  }

  async function removeItem(item: ListItem) {
    if (!meta) return;
    setRemovingId(item.library_id);

    try {
      const response = await fetch(
        `/api/lists/items?list_id=${encodeURIComponent(meta.id)}&library_item_id=${encodeURIComponent(item.library_id)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        toast.error("Não foi possível remover o título da lista.");
        return;
      }

      setItems((current) => current.filter((row) => row.library_id !== item.library_id));
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível remover o título da lista.");
    } finally {
      setRemovingId(null);
    }
  }

  async function openPicker() {
    setShowPicker(true);
    if (libraryItems.length > 0) return;

    setLibraryLoading(true);
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const rows = await response.json();
      setLibraryItems(
        Array.isArray(rows)
          ? rows.map((row: any) => ({ ...row, library_id: row.id, ...row.media }))
          : []
      );
    } catch (error) {
      console.error("Erro ao carregar sua biblioteca:", error);
      toast.error("Não foi possível carregar sua biblioteca.");
    } finally {
      setLibraryLoading(false);
    }
  }

  const inListIds = useMemo(() => new Set(items.map((item) => item.library_id)), [items]);

  const pickerResults = useMemo(() => {
    const term = pickerSearch.trim().toLowerCase();
    return libraryItems
      .filter((item) => !inListIds.has((item as any).library_id))
      .filter((item) => !term || String(item.title || "").toLowerCase().includes(term))
      .slice(0, 40);
  }, [libraryItems, pickerSearch, inListIds]);

  async function addItem(item: LibraryItem & { library_id: string }) {
    if (!meta) return;
    setAddingId(item.library_id);

    try {
      const response = await fetch("/api/lists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: meta.id, library_item_id: item.library_id }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        toast.error(result.error || "Não foi possível adicionar o título.");
        return;
      }

      setItems((current) => [...current, item as ListItem]);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível adicionar o título.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <>
      <Search />

      {estado === "carregando" && (
        <div className="empty library-page-loading" role="status" aria-live="polite">
          <Loader2 size={25} className="spin" />
          <span>Carregando lista...</span>
        </div>
      )}

      {estado === "privada" && (
        <div className="empty" role="alert">
          <Lock size={28} />
          <strong>Esta lista é privada.</strong>
          <p className="muted">Só quem criou pode vê-la.</p>
        </div>
      )}

      {estado === "nao-encontrada" && (
        <div className="empty" role="alert">
          <strong>Lista não encontrada.</strong>
          <Link className="btn primary" href="/lists">
            Voltar para minhas listas
          </Link>
        </div>
      )}

      {estado === "erro" && (
        <div className="empty" role="alert">
          <strong>Não foi possível carregar esta lista.</strong>
          <button type="button" className="btn primary" onClick={load}>
            Tentar de novo
          </button>
        </div>
      )}

      {estado === "pronto" && meta && (
        <>
          <div className="library-head">
            <div>
              <div className="eyebrow">
                {meta.is_owner ? "Sua lista" : `Lista de ${meta.owner.display_name || meta.owner.username || "outro usuário"}`}
              </div>

              {!editing ? (
                <>
                  <h1 style={{ margin: "5px 0" }}>{meta.name}</h1>
                  <div className="muted">
                    {meta.description || "Sem descrição"}
                    {" · "}
                    {meta.is_public ? (
                      <span className="library-list-visibility">
                        <Globe size={11} /> Pública
                      </span>
                    ) : (
                      <span className="library-list-visibility">
                        <Lock size={11} /> Privada
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="library-list-create-form">
                  <input value={editName} maxLength={80} onChange={(event) => setEditName(event.target.value)} placeholder="Nome da lista" />
                  <input
                    value={editDescription}
                    maxLength={300}
                    onChange={(event) => setEditDescription(event.target.value)}
                    placeholder="Descrição (opcional)"
                  />
                  <label className="library-list-public-toggle">
                    <input type="checkbox" checked={editPublic} onChange={(event) => setEditPublic(event.target.checked)} />
                    Lista pública (qualquer pessoa com o link pode ver)
                  </label>
                  <div className="library-list-create-actions">
                    <button type="button" className="btn primary" disabled={savingEdit} onClick={saveEdit}>
                      {savingEdit ? <Loader2 size={15} className="spin" /> : "Salvar"}
                    </button>
                    <button type="button" className="btn" onClick={() => setEditing(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {meta.is_owner && !editing && (
              <div className="library-head-actions">
                <button type="button" className="btn" onClick={startEditing}>
                  <Pencil size={16} /> Editar
                </button>
                <button type="button" className="btn" onClick={deleteList}>
                  <Trash2 size={16} /> Excluir
                </button>
                <button type="button" className="btn primary" onClick={openPicker}>
                  <Plus size={16} /> Adicionar título
                </button>
              </div>
            )}
          </div>

          {showPicker && (
            <div className="library-list-picker-panel">
              <div className="library-list-picker-head">
                <strong>Adicionar da sua biblioteca</strong>
                <button type="button" title="Fechar" aria-label="Fechar" onClick={() => setShowPicker(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="library-search" style={{ marginBottom: 10 }}>
                <SearchIcon size={17} />
                <input
                  value={pickerSearch}
                  onChange={(event) => setPickerSearch(event.target.value)}
                  placeholder="Buscar na sua biblioteca..."
                />
              </div>

              {libraryLoading ? (
                <div className="empty library-page-loading" role="status" aria-live="polite">
                  <Loader2 size={20} className="spin" />
                </div>
              ) : (
                <div className="library-list-picker-results">
                  {pickerResults.map((item) => {
                    const libId = (item as any).library_id as string;
                    return (
                      <button
                        type="button"
                        key={libId}
                        className="library-list-picker-item"
                        disabled={addingId === libId}
                        onClick={() => addItem(item as LibraryItem & { library_id: string })}
                      >
                        <img
                          src={img(item.poster_path, "w92")}
                          alt=""
                          loading="lazy"
                          width={40}
                        />
                        <span>{item.title}</span>
                        {addingId === libId ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                      </button>
                    );
                  })}
                  {!pickerResults.length && <p className="muted">Nenhum título encontrado.</p>}
                </div>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <div className="empty">
              <strong>Esta lista ainda não tem títulos.</strong>
              {meta.is_owner && <p className="muted">Use &ldquo;Adicionar título&rdquo; para começar.</p>}
            </div>
          ) : (
            <div className="library-list-items-grid">
              {items.map((item) => {
                const year = (item.media_type === "tv" ? item.first_air_date : item.release_date)?.slice(0, 4);
                return (
                  <article key={item.library_id} className="library-list-item-card">
                    <Link href={`/title/${item.media_type}/${item.tmdb_id}`}>
                      <img src={img(item.poster_path, "w342")} alt={item.title} loading="lazy" />
                    </Link>
                    <div className="library-list-item-info">
                      <strong>{item.title}</strong>
                      <small className="muted">
                        {year} · {STATUS_LABELS[item.status] || item.status}
                      </small>
                    </div>
                    {meta.is_owner && (
                      <button
                        type="button"
                        className="library-list-item-remove"
                        title="Remover da lista"
                        aria-label={`Remover ${item.title} da lista`}
                        disabled={removingId === item.library_id}
                        onClick={() => removeItem(item)}
                      >
                        {removingId === item.library_id ? <Loader2 size={14} className="spin" /> : <X size={14} />}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
