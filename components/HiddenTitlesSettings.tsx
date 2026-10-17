"use client";

import { useState } from "react";
import { EyeOff, Loader2, Undo2 } from "lucide-react";

import { useToast } from "@/components/ToastProvider";

/*
 * V3.3 — "Não tenho interesse" é preferência de RECOMENDAÇÃO (Para você,
 * Escolha por mim, fila inteligente, assistente), não de conta/segurança:
 * mora em Configurações → Streaming. Descobrir e Busca são neutros e não
 * escondem esses títulos.
 *
 * A lista só é buscada quando aberta e vem paginada (GET
 * /api/account/hidden-titles?offset=N, catálogo local primeiro) — antes eram
 * até 100 chamadas ao TMDB sempre que a aba abria.
 */

type HiddenTitle = {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  year: string;
  vote_average: number | null;
};

type PageState = { items: HiddenTitle[]; total: number; hasMore: boolean };

export function HiddenTitlesSettings() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);

  async function load(offset: number) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/account/hidden-titles?offset=${offset}`, { cache: "no-store" });

      if (!response.ok) throw new Error();

      const result = await response.json();

      setData((current) => ({
        items: offset === 0 || !current ? result.items : [...current.items, ...result.items],
        total: Number(result.total || 0),
        hasMore: Boolean(result.has_more),
      }));
    } catch {
      setError("Não foi possível carregar os títulos ocultos.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;

    setOpen(next);
    if (next && !data) void load(0);
  }

  async function restore(item: HiddenTitle) {
    setRestoring(item.id);

    try {
      const params = new URLSearchParams({ tmdb_id: String(item.tmdb_id), media_type: item.media_type });
      const response = await fetch(`/api/not-interested?${params.toString()}`, { method: "DELETE" });

      if (!response.ok) throw new Error();

      setData((current) =>
        current ? { ...current, items: current.items.filter((entry) => entry.id !== item.id), total: Math.max(0, current.total - 1) } : current
      );
      toast.success(`${item.title} pode voltar a ser recomendado.`);
    } catch {
      toast.error("Não foi possível restaurar o título", { description: "Ele continua oculto. Tente de novo." });
    } finally {
      setRestoring(null);
    }
  }

  return (
    <section className="panel settings-panel account-settings-panel" aria-labelledby="hidden-titles-title">
      <div className="settings-panel-head">
        <div className="settings-icon">
          <EyeOff size={19} aria-hidden="true" />
        </div>
        <div>
          <h2 id="hidden-titles-title">Não tenho interesse</h2>
          <p className="muted">
            Títulos que você marcou assim deixam de aparecer em Para você, Escolha por mim e na fila de
            recomendações. Descobrir e a Busca continuam mostrando tudo.
          </p>
        </div>
        <button type="button" className="btn" aria-expanded={open} aria-controls="hidden-titles-list" onClick={toggle}>
          {open ? "Ocultar lista" : data ? `Ver lista (${data.total})` : "Ver lista"}
        </button>
      </div>

      {open && (
        <div id="hidden-titles-list">
          {error && (
            <div className="account-hidden-error" role="alert">
              <span>{error}</span>
              <button type="button" className="btn" onClick={() => void load(data ? data.items.length : 0)}>
                Tentar de novo
              </button>
            </div>
          )}

          {data && data.total === 0 && !error && (
            <div className="account-hidden-empty">
              <EyeOff size={22} aria-hidden="true" />
              <div>
                <strong>Nenhum título oculto</strong>
                <span>Quando você marcar “Não tenho interesse” numa recomendação, ele aparece aqui.</span>
              </div>
            </div>
          )}

          {data && data.items.length > 0 && (
            <>
              <p className="muted" aria-live="polite">
                {data.total} {data.total === 1 ? "título oculto" : "títulos ocultos"}
                {data.items.length < data.total ? ` · mostrando ${data.items.length}` : ""}.
              </p>
              <div className="account-hidden-list">
                {data.items.map((item) => (
                  <article key={item.id} className="account-hidden-item">
                    <div className="account-hidden-poster">
                      {item.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w154${item.poster_path}`} alt="" loading="lazy" />
                      ) : (
                        <div aria-hidden="true">{item.media_type === "tv" ? "S" : "F"}</div>
                      )}
                    </div>
                    <div className="account-hidden-copy">
                      <strong>{item.title}</strong>
                      <span>
                        {item.media_type === "tv" ? "Série" : "Filme"}
                        {item.year ? ` · ${item.year}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      disabled={restoring === item.id}
                      onClick={() => restore(item)}
                      aria-label={`Voltar a recomendar ${item.title}`}
                    >
                      {restoring === item.id ? (
                        <Loader2 size={14} className="spin" aria-hidden="true" />
                      ) : (
                        <Undo2 size={14} aria-hidden="true" />
                      )}
                      Voltar a recomendar
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}

          {loading && (
            <p className="muted" role="status">
              <Loader2 size={14} className="spin" aria-hidden="true" /> Carregando títulos…
            </p>
          )}

          {data?.hasMore && !loading && (
            <button type="button" className="btn" onClick={() => void load(data.items.length)}>
              Mostrar mais
            </button>
          )}
        </div>
      )}
    </section>
  );
}
