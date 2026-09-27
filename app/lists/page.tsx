"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { List, Loader2, Lock, Plus, Trash2, Globe } from "lucide-react";

import { Search } from "@/components/Search";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";

/*
 * app/lists/page.tsx — "Minhas listas" (D1)
 *
 * Geração canônica confirmada em runtime: custom_lists/custom_list_items é
 * a única que o perfil público (/api/public-profile/[username]) já lê hoje.
 * public.lists só sobrevive como espelho de metadados (is_public), criado
 * junto em POST/PATCH /api/lists — não é uma segunda fonte de listas.
 */

type ListSummary = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  is_public: boolean;
  item_count: number;
};

type Estado = "carregando" | "auth" | "erro" | "pronto";

export default function ListsPage() {
  const toast = useToast();
  const confirmAction = useConfirm();

  const [lists, setLists] = useState<ListSummary[]>([]);
  const [estado, setEstado] = useState<Estado>("carregando");

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setEstado("carregando");

    try {
      const response = await fetch("/api/lists", { cache: "no-store" });

      if (response.status === 401) {
        setEstado("auth");
        return;
      }

      if (!response.ok) throw new Error(String(response.status));

      const result = await response.json();
      setLists(Array.isArray(result.custom_lists) ? result.custom_lists : []);
      setEstado("pronto");
    } catch (error) {
      console.error("Erro ao carregar listas:", error);
      setEstado("erro");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createList() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Use pelo menos 2 caracteres no nome da lista.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || undefined,
          is_public: isPublic,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "Não foi possível criar a lista.");
        return;
      }

      toast.success("Lista criada.");
      setName("");
      setDescription("");
      setIsPublic(false);
      setCreating(false);
      load();
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível criar a lista.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteList(list: ListSummary) {
    const confirmed = await confirmAction({
      title: "Excluir lista?",
      description: `"${list.name}" será removida permanentemente. Os títulos continuam na sua biblioteca.`,
      confirmLabel: "Excluir lista",
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/lists?id=${encodeURIComponent(list.id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        toast.error(result.error || "Não foi possível excluir a lista.");
        return;
      }

      setLists((current) => current.filter((item) => item.id !== list.id));
      toast.success("Lista excluída.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível excluir a lista.");
    }
  }

  return (
    <>
      <Search />

      <div className="section">
        <div className="eyebrow">Suas coleções</div>
        <h1>Listas</h1>
      </div>

      {estado === "carregando" && (
        <div className="empty library-page-loading" role="status" aria-live="polite">
          <Loader2 size={25} className="spin" />
          <span>Carregando suas listas...</span>
        </div>
      )}

      {estado === "auth" && (
        <div className="empty" role="alert">
          <strong>Entre para ver suas listas.</strong>
          <a className="btn primary" href="/login?reason=session&next=/lists">
            Entrar
          </a>
        </div>
      )}

      {estado === "erro" && (
        <div className="empty" role="alert">
          <strong>Não foi possível carregar suas listas.</strong>
          <p className="muted">Verifique sua conexão e tente novamente.</p>
          <button type="button" className="btn primary" onClick={load}>
            Tentar de novo
          </button>
        </div>
      )}

      {estado === "pronto" && (
        <>
          <div className="library-list-create-panel">
            {!creating ? (
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                <Plus size={16} /> Nova lista
              </button>
            ) : (
              <div className="library-list-create-form">
                <input
                  value={name}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nome da lista"
                  autoFocus
                />
                <input
                  value={description}
                  maxLength={300}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Descrição (opcional)"
                />
                <label className="library-list-public-toggle">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(event) => setIsPublic(event.target.checked)}
                  />
                  Lista pública (qualquer pessoa com o link pode ver)
                </label>
                <div className="library-list-create-actions">
                  <button type="button" className="btn primary" disabled={saving} onClick={createList}>
                    {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                    Criar lista
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setCreating(false);
                      setName("");
                      setDescription("");
                      setIsPublic(false);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {lists.length === 0 ? (
            <div className="empty">
              <List size={28} />
              <strong>Você ainda não criou nenhuma lista.</strong>
              <p className="muted">Organize títulos da sua biblioteca em coleções próprias.</p>
            </div>
          ) : (
            <div className="library-list-grid">
              {lists.map((list) => (
                <article key={list.id} className="library-list-card">
                  <Link href={`/lists/${list.id}`} className="library-list-card-link">
                    <List size={18} />
                    <div>
                      <strong>{list.name}</strong>
                      <p className="muted">{list.description || "Sem descrição"}</p>
                      <small>
                        {list.item_count} {list.item_count === 1 ? "título" : "títulos"}
                        {" · "}
                        {list.is_public ? (
                          <span className="library-list-visibility">
                            <Globe size={11} /> Pública
                          </span>
                        ) : (
                          <span className="library-list-visibility">
                            <Lock size={11} /> Privada
                          </span>
                        )}
                      </small>
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="library-list-delete"
                    title="Excluir lista"
                    aria-label={`Excluir lista ${list.name}`}
                    onClick={() => deleteList(list)}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
