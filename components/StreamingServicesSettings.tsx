"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Tv } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import {
  MAX_STREAMING_SERVICES,
  type StreamingService,
} from "@/lib/streaming-services";

/*
 * V2.1-E — "Meus serviços de streaming".
 *
 * Catálogo = providers reais do TMDB para a região BR (mesma fonte de
 * `/api/discover/filters`, movie ∪ tv, cache público de 24h — nenhum dado
 * do usuário). Só guardamos "eu tenho este serviço".
 * Checkboxes nativos: teclado/leitor de tela sem código extra.
 */

export function StreamingServicesSettings() {
  const toast = useToast();
  const [catalog, setCatalog] = useState<StreamingService[]>([]);
  const [selected, setSelected] = useState<Map<number, StreamingService>>(new Map());
  const [saved, setSaved] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [mine, movie, tv] = await Promise.all([
          fetch("/api/streaming-services", { cache: "no-store" }),
          fetch("/api/discover/filters?type=movie"),
          fetch("/api/discover/filters?type=tv"),
        ]);

        const mineData = mine.ok ? await mine.json() : { services: [] };
        const merged = new Map<number, StreamingService>();

        for (const response of [movie, tv]) {
          if (!response.ok) continue;
          const data = await response.json().catch(() => null);
          for (const provider of data?.providers ?? []) {
            const id = Number(provider.provider_id);
            if (!id || merged.has(id)) continue;
            merged.set(id, {
              provider_id: id,
              provider_name: String(provider.provider_name),
              logo_path: typeof provider.logo_path === "string" ? provider.logo_path : null,
            });
          }
        }

        const current: StreamingService[] = mineData.services ?? [];
        // Serviços já salvos continuam visíveis mesmo se o catálogo falhar.
        for (const service of current) if (!merged.has(service.provider_id)) merged.set(service.provider_id, service);

        if (cancelled) return;

        setCatalog(Array.from(merged.values()));
        setSelected(new Map(current.map((service) => [service.provider_id, service])));
        setSaved(current.map((service) => service.provider_id).sort((a, b) => a - b).join(","));
      } catch {
        if (!cancelled) setError("Não foi possível carregar os serviços agora.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentKey = useMemo(
    () => Array.from(selected.keys()).sort((a, b) => a - b).join(","),
    [selected]
  );
  const dirty = currentKey !== saved;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return catalog.filter((service) => !term || service.provider_name.toLowerCase().includes(term));
  }, [catalog, query]);

  function toggle(service: StreamingService) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(service.provider_id)) next.delete(service.provider_id);
      else if (next.size < MAX_STREAMING_SERVICES) next.set(service.provider_id, service);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/streaming-services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: Array.from(selected.values()) }),
      });
      if (!response.ok) throw new Error();
      setSaved(currentKey);
      toast.success("Serviços salvos");
    } catch {
      toast.error("Não foi possível salvar seus serviços");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel streaming-settings" aria-labelledby="streaming-settings-title">
      <div className="settings-panel-head">
        <div className="settings-icon">
          <Tv size={19} />
        </div>
        <div>
          <h2 id="streaming-settings-title">Meus serviços de streaming</h2>
          <p className="muted">
            Marque onde você assiste. Usamos isso só para filtrar Descobrir, Para você e
            &ldquo;O que assistir agora?&rdquo; (catálogo do Brasil). Nenhum login ou senha é guardado.
          </p>
        </div>
      </div>

      {loading && <p className="muted" role="status"><Loader2 size={14} className="spin" /> Carregando serviços…</p>}
      {error && <p className="muted" role="alert">{error}</p>}

      {!loading && (
        <>
          <p className="streaming-selected muted" aria-live="polite">
            {selected.size === 0
              ? "Nenhum serviço selecionado."
              : `Selecionados (${selected.size}): ${Array.from(selected.values()).map((s) => s.provider_name).join(", ")}`}
          </p>

          <label className="streaming-search">
            <span className="mc-visually-hidden">Buscar serviço</span>
            <input
              type="search"
              placeholder="Buscar serviço…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <fieldset className="streaming-grid">
            <legend className="mc-visually-hidden">Serviços disponíveis</legend>
            {visible.map((service) => {
              const checked = selected.has(service.provider_id);
              return (
                <label key={service.provider_id} className={`streaming-chip ${checked ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(service)}
                  />
                  <span>{service.provider_name}</span>
                </label>
              );
            })}
            {visible.length === 0 && <span className="muted">Nenhum serviço encontrado.</span>}
          </fieldset>

          <div className="streaming-actions">
            <button type="button" className="btn primary" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
              Salvar serviços
            </button>
            {selected.size > 0 && (
              <button type="button" className="btn" onClick={() => setSelected(new Map())} disabled={saving}>
                Limpar seleção
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
