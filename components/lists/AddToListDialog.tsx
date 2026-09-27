"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Plus, X } from "lucide-react";

import { useToast } from "@/components/ToastProvider";

type ListOption = {
  id: string;
  name: string;
  in_list: boolean;
};

export function AddToListDialog({
  libraryItemId,
  title,
  onClose,
}: {
  libraryItemId: string;
  title: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [lists, setLists] = useState<ListOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    fetch(`/api/lists?library_item_id=${encodeURIComponent(libraryItemId)}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((result) => {
        if (!alive) return;
        setLists(Array.isArray(result.custom_lists) ? result.custom_lists : []);
      })
      .catch(() => {
        if (alive) toast.error("Não foi possível carregar suas listas.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [libraryItemId, toast]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function toggle(list: ListOption) {
    setPendingId(list.id);

    try {
      const response = await fetch("/api/lists/items", {
        method: list.in_list ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: list.id, library_item_id: libraryItemId }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        toast.error(result.error || "Não foi possível atualizar a lista.");
        return;
      }

      setLists((current) =>
        current.map((row) => (row.id === list.id ? { ...row, in_list: !row.in_list } : row))
      );
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível atualizar a lista.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      className="library-add-to-list-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="library-add-to-list-panel" role="dialog" aria-modal="true" aria-label={`Adicionar ${title} a uma lista`}>
        <header>
          <strong>Adicionar à lista</strong>
          <button type="button" title="Fechar" aria-label="Fechar" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <p className="muted">{title}</p>

        {loading ? (
          <div className="empty library-page-loading" role="status" aria-live="polite">
            <Loader2 size={20} className="spin" />
          </div>
        ) : lists.length === 0 ? (
          <div className="library-add-to-list-empty">
            <p className="muted">Você ainda não tem listas.</p>
            <Link className="btn primary" href="/lists">
              Criar uma lista
            </Link>
          </div>
        ) : (
          <ul className="library-add-to-list-options">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  className={list.in_list ? "active" : ""}
                  disabled={pendingId === list.id}
                  onClick={() => toggle(list)}
                >
                  <span>{list.name}</span>
                  {pendingId === list.id ? (
                    <Loader2 size={14} className="spin" />
                  ) : list.in_list ? (
                    <Check size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
