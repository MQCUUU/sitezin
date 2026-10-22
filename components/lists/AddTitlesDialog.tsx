"use client";

import { apiFetch, errorMessage, isAbortError } from "@/lib/api-client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Clapperboard, Loader2, Plus, Search as SearchIcon, X } from "lucide-react";

import { useDialogFocus } from "./useDialogFocus";
import { Dialog } from "@/components/ui/Dialog";
import { img } from "@/lib/tmdb";

/*
 * Adicionar títulos à lista: pesquisa o CATÁLOGO (filmes e séries, título e
 * título original via TMDB) — não a Biblioteca. Adicionar não mexe na Biblioteca,
 * no Diário nem no histórico. Já presente → "Já está nesta lista" (sem novo insert).
 */
type Result = { id: number; media_type: "movie" | "tv"; title: string; year: string | null; poster_path: string | null };

export function AddTitlesDialog({
  open,
  listId,
  members,
  onClose,
  onAdded,
}: {
  open: boolean;
  listId: string;
  members: Set<string>;
  onClose: () => void;
  onAdded: (key: string) => void;
}) {
  const titleId = useId();
  const { close, fieldRef } = useDialogFocus<HTMLInputElement>(open, onClose);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;

    const term = query.trim();

    if (term.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      apiFetch<{ results?: Record<string, any>[] }>(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((data) => {
          setResults(
            (data.results || [])
              .filter((r) => r.media_type === "movie" || r.media_type === "tv")
              .slice(0, 20)
              .map((r) => ({ id: r.id, media_type: r.media_type, title: r.title || r.name, year: (r.release_date || r.first_air_date || "").slice(0, 4) || null, poster_path: r.poster_path || null }))
          );
          setError(null);
        })
        .catch((reason) => {
          if (!isAbortError(reason)) setError(errorMessage(reason, "Não foi possível buscar agora. Tente de novo."));
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  // O botão vira "Já está nesta lista" e sai do DOM: devolve o foco à busca
  // depois do re-render, senão ele cairia no <body>.
  const refocus = useRef(false);

  useEffect(() => {
    if (!refocus.current) return;

    refocus.current = false;
    if (!document.activeElement || document.activeElement === document.body) fieldRef.current?.focus();
  }, [members, fieldRef]);

  async function add(result: Result) {
    const key = `${result.media_type}:${result.id}`;

    if (members.has(key) || pending.has(key)) return;

    setPending((current) => new Set(current).add(key));

    try {
      await apiFetch("/api/lists/items", {
        method: "POST",
        json: { list_id: listId, tmdb_id: result.id, media_type: result.media_type },
      });

      onAdded(key);
      setStatus(`${result.title} adicionado à lista.`);
      refocus.current = true;
    } catch (error) {
      setStatus(`Não foi possível adicionar ${result.title}. ${errorMessage(error, "")}`.trim());
    } finally {
      setPending((current) => {
        const next = new Set(current);

        next.delete(key);
        return next;
      });
    }
  }

  return (
    <Dialog open={open} onClose={close} labelledBy={titleId} className="lst-dialog lst-dialog--add">
      <header className="lst-dialog-head">
        <h2 id={titleId}>Adicionar títulos</h2>
        <button type="button" className="lst-icon-btn" onClick={close} aria-label="Fechar">
          <X size={18} />
        </button>
      </header>
      <label className="lst-search">
        <SearchIcon size={16} aria-hidden="true" />
        <span className="lst-sr">Buscar filmes e séries</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar filmes e séries…" ref={fieldRef} />
        {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
      </label>
      <p className="lst-hint">Adicionar à lista não muda sua Biblioteca.</p>
      <p className="lst-sr" role="status" aria-live="polite">
        {status}
      </p>
      <ul className="lst-results">
        {results.map((result) => {
          const key = `${result.media_type}:${result.id}`;
          const inList = members.has(key);
          const busy = pending.has(key);

          return (
            <li key={key}>
              {result.poster_path ? (
                <img src={img(result.poster_path, "w92")} alt="" width={40} height={60} loading="lazy" />
              ) : (
                <span className="lst-result-poster" aria-hidden="true">
                  <Clapperboard size={16} />
                </span>
              )}
              <span className="lst-result-text">
                <b>{result.title}</b>
                <small>
                  {result.media_type === "tv" ? "Série" : "Filme"}
                  {result.year ? ` · ${result.year}` : ""}
                </small>
              </span>
              {inList ? (
                <span className="lst-in-list">
                  <Check size={14} aria-hidden="true" /> Já está nesta lista
                </span>
              ) : (
                <button type="button" className="btn lst-add-btn" disabled={busy} onClick={() => add(result)} aria-label={`Adicionar ${result.title} à lista`}>
                  {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                  Adicionar
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="lst-error" role="alert">
          {error}
        </p>
      ) : query.trim().length >= 2 && !loading && !results.length ? (
        <p className="lst-hint">Nenhum filme ou série encontrado no catálogo.</p>
      ) : null}
    </Dialog>
  );
}
