"use client";

import { apiFetch, errorMessage } from "@/lib/api-client";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock3, EyeOff, Loader2, Play, Plus, Shuffle, Sparkles, Star, X } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import { Poster } from "@/components/Poster";
import { useSpotlight } from "@/components/ui/premium";
import { MediaStatusTag, MediaTypeTag } from "@/components/media/MediaBadges";
import { useToast } from "@/components/ToastProvider";

/*
 * "O que assistir agora?" (dentro de /for-you; sem item novo na navegação).
 * Painel acessível (role=dialog, foco preso, Escape). O cálculo é no
 * servidor (`/api/smart-queue`, determinístico, sem IA); o client só manda os
 * filtros e mostra ≤ 3 resultados — nunca baixa a biblioteca.
 *
 * V2.3: origem (fila × novidades), motivo pessoal, onde assistir e ações
 * diretas (começar / adicionar à fila / não tenho interesse).
 */

type QueueResult = {
  library_id: string | null;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  status: string | null;
  runtime_minutes: number | null;
  runtime_estimated: boolean;
  next_episode: { season: number; episode: number } | null;
  services: string[];
  where_to_watch?: string[];
  reason: string;
  source: "library" | "discover";
  availability_source: "library_snapshot" | "tmdb_live";
  overview?: string | null;
  year?: number | null;
  vote_average?: number | null;
  genres?: string[];
};

type QueueResponse = {
  results: QueueResult[];
  total_eligible: number;
  surprise: boolean;
  used_fallback: boolean;
  has_services: boolean;
  personalized?: boolean;
};

const TIME_OPTIONS: [string, string][] = [
  ["30", "Até 30 min"],
  ["60", "Até 1h"],
  ["120", "Até 2h"],
  ["", "Sem limite"],
];

const TYPE_OPTIONS: [string, string][] = [
  ["all", "Filmes e séries"],
  ["movie", "Filmes"],
  ["tv", "Séries"],
];

const SOURCE_OPTIONS: [string, string][] = [
  ["all", "Fila + novidades"],
  ["queue", "Só da minha fila"],
  ["new", "Só novidades"],
];

function durationLabel(result: QueueResult): string | null {
  if (result.runtime_minutes === null) return null;

  const minutes = result.runtime_minutes;
  const text =
    minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;

  return result.media_type === "tv" ? `~${text} por episódio` : text;
}

const resultKey = (result: QueueResult) => `${result.media_type}-${result.tmdb_id}`;

export function SmartQueue({ genres }: { genres: string[] }) {
  const toast = useToast();
  const { handleError } = useLibraryAuth();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("60");
  const [type, setType] = useState("all");
  const [source, setSource] = useState("all");
  const [genre, setGenre] = useState("");
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<QueueResponse | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { ref: spotRef, onPointerMove: spotMove } = useSpotlight<HTMLElement>();
  const ref = useModal(open, () => setOpen(false));

  /*
   * O CTA "O que assistir agora?" da Home leva a `/for-you?queue=open` e abre
   * o painel. Lê `window.location` (não `useSearchParams`, que exigiria
   * Suspense na página) e limpa o parâmetro para não reabrir ao voltar.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("queue") === "open") {
      setOpen(true);
      params.delete("queue");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    }
  }, []);

  async function run(surprise: boolean) {
    setLoading(true);
    setError("");
    setDismissed(new Set());

    try {
      const params = new URLSearchParams({ type, source });
      if (minutes) params.set("minutes", minutes);
      if (genre) params.set("genre", genre);
      if (mine) params.set("mine", "1");
      if (surprise) params.set("surprise", "1");

      const data = await apiFetch(`/api/smart-queue?${params.toString()}`, { cache: "no-store", timeout: 30000 });

      setResponse(data);
    } catch (err) {
      setResponse(null);
      setError(errorMessage(err, "Não foi possível montar sugestões."));
    } finally {
      setLoading(false);
    }
  }

  async function startWatching(result: QueueResult) {
    if (!result.library_id) return;

    setActing(resultKey(result));

    try {
      await apiFetch(`/api/library/${result.library_id}`, { method: "PATCH", json: { status: "watching" } });

      setAdded((current) => ({ ...current, [resultKey(result)]: "watching" }));
      toast.success(`${result.title}: marcado como Assistindo`);
    } catch (error) {
      handleError(error, undefined, "Não foi possível atualizar o status");
    } finally {
      setActing(null);
    }
  }

  async function addToQueue(result: QueueResult) {
    setActing(resultKey(result));

    try {
      // Mesmo caminho do "+" das outras telas: detalhes completos do TMDB e depois a biblioteca.
      // Intencional: detalhes extras são opcionais; sem eles o título entra com os dados básicos.
      const details = await apiFetch(`/api/tmdb/${result.media_type}/${result.tmdb_id}`).catch(() => ({}));

      const saved = await apiFetch("/api/library", {
        method: "POST",
        json: {
          media: {
            ...details,
            id: result.tmdb_id,
            media_type: result.media_type,
            title: details.title || details.name || result.title,
            original_title: details.original_title || details.original_name || result.title,
            genres: details.genres || [],
          },
          status: "want",
        },
      });

      // Fase 0: um item que já existia volta intacto do servidor — mostra o status salvo.

      if (saved?.created === false) {
        setAdded((current) => ({ ...current, [resultKey(result)]: saved.status || "want" }));
        toast.info(`${result.title} já estava na sua biblioteca`);
        return;
      }

      setAdded((current) => ({ ...current, [resultKey(result)]: "want" }));
      toast.success(`${result.title} entrou na sua fila`);
    } catch (error) {
      handleError(error, undefined, "Não foi possível adicionar à fila");
    } finally {
      setActing(null);
    }
  }

  async function notInterested(result: QueueResult) {
    setActing(resultKey(result));

    try {
      await apiFetch("/api/not-interested", {
        method: "POST",
        json: { tmdb_id: result.tmdb_id, media_type: result.media_type, reason: "smart_queue" },
      });

      setDismissed((current) => new Set(current).add(resultKey(result)));
      toast.success("Não vamos mais sugerir esse título");
    } catch (error) {
      handleError(error, undefined, "Não foi possível ocultar o título");
    } finally {
      setActing(null);
    }
  }

  const visible = (response?.results ?? []).filter((result) => !dismissed.has(resultKey(result)));

  return (
    <>
      <section className="fy-smart-queue-cta panel mc-spot" ref={spotRef} onPointerMove={spotMove}>
        <div className="fy-assistant-cta-icon">
          <Clock3 size={22} strokeWidth={2} aria-hidden="true" />
        </div>

        <div>
          <strong>O que assistir agora?</strong>
          <p className="muted">Diga quanto tempo você tem e receba até 3 sugestões feitas para o seu gosto.</p>
        </div>

        <button type="button" className="btn primary" onClick={() => setOpen(true)}>
          Sugerir agora
        </button>
      </section>

      {open && (
        <div className="smart-queue-overlay" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section
            ref={ref}
            className="smart-queue-dialog panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="smart-queue-title"
          >
            <header className="smart-queue-head">
              <h2 id="smart-queue-title">O que assistir agora?</h2>
              <button type="button" className="btn icon" onClick={() => setOpen(false)} aria-label="Fechar">
                <X size={16} />
              </button>
            </header>

            <div className="smart-queue-filters">
              <fieldset>
                <legend>Quanto tempo você tem?</legend>
                <div className="smart-queue-options">
                  {TIME_OPTIONS.map(([value, label]) => (
                    <label key={label} className={`streaming-chip ${minutes === value ? "active" : ""}`}>
                      <input type="radio" name="sq-time" checked={minutes === value} onChange={() => setMinutes(value)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Tipo</legend>
                <div className="smart-queue-options">
                  {TYPE_OPTIONS.map(([value, label]) => (
                    <label key={value} className={`streaming-chip ${type === value ? "active" : ""}`}>
                      <input type="radio" name="sq-type" checked={type === value} onChange={() => setType(value)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>De onde sugerir</legend>
                <div className="smart-queue-options">
                  {SOURCE_OPTIONS.map(([value, label]) => (
                    <label key={value} className={`streaming-chip ${source === value ? "active" : ""}`}>
                      <input type="radio" name="sq-source" checked={source === value} onChange={() => setSource(value)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="smart-queue-genre">
                <span>Gênero</span>
                <select value={genre} onChange={(event) => setGenre(event.target.value)}>
                  <option value="">Qualquer</option>
                  {genres.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="smart-queue-mine">
                <input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} />
                <span>Só nos meus serviços de streaming</span>
              </label>
              {mine && (
                <p className="muted smart-queue-availability-note">
                  Usa os dados de disponibilidade do catálogo (Brasil). Eles podem estar desatualizados: um título
                  pode ter saído ou entrado num serviço recentemente.
                </p>
              )}
            </div>

            <div className="smart-queue-actions">
              <button type="button" className="btn primary" onClick={() => run(false)} disabled={loading}>
                {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                Sugerir
              </button>
              <button type="button" className="btn" onClick={() => run(true)} disabled={loading}>
                <Shuffle size={15} />
                Surpreenda-me
              </button>
            </div>

            <div className="smart-queue-results" aria-live="polite" data-rec-tool="smart_queue">
              {error && <p role="alert">{error}</p>}

              {response && visible.length === 0 && (
                <div className="empty">
                  <strong>Nada encontrado com esses filtros.</strong>
                  {mine && !response.has_services ? (
                    <>
                      <span>Você ainda não escolheu seus serviços de streaming.</span>
                      <Link className="btn primary" href="/settings?tab=general">
                        Escolher meus serviços
                      </Link>
                    </>
                  ) : (
                    <span>Tente um tempo maior, outra origem ou remova algum filtro.</span>
                  )}
                </div>
              )}

              {visible.length > 0 && (
                <ol className="smart-queue-list">
                  {visible.map((result) => {
                    const key = resultKey(result);
                    const duration = durationLabel(result);
                    const addedStatus = added[key];
                    const status = addedStatus || result.status;
                    const busy = acting === key;

                    return (
                      <li key={key} className="smart-queue-card">
                        <Link
                          className="smart-queue-poster"
                          href={`/title/${result.media_type}/${result.tmdb_id}`}
                          onClick={() => setOpen(false)}
                        >
                          <Poster path={result.poster_path} alt={result.title} sizes="88px" tmdbSize="w342" />
                        </Link>

                        <div className="smart-queue-info">
                          <div className="smart-queue-tags">
                            <MediaTypeTag type={result.media_type} />
                            {status ? <MediaStatusTag status={status} /> : <span className="mc-tag mc-tag--info">Novidade</span>}
                          </div>

                          <Link
                            className="smart-queue-title"
                            href={`/title/${result.media_type}/${result.tmdb_id}`}
                            onClick={() => setOpen(false)}
                          >
                            {result.title}
                          </Link>

                          <span className="muted smart-queue-meta">
                            {result.year ? `${result.year}` : ""}
                            {result.vote_average ? (
                              <>
                                {result.year ? " · " : ""}
                                <Star size={11} fill="currentColor" aria-hidden="true" /> {Number(result.vote_average).toFixed(1)}
                              </>
                            ) : null}
                            {duration ? ` · ${duration}` : ""}
                            {result.next_episode ? ` · próximo: S${result.next_episode.season} E${result.next_episode.episode}` : ""}
                          </span>

                          {(result.services.length > 0 || (result.where_to_watch ?? []).length > 0) && (
                            <span className="muted smart-queue-meta">
                              Onde assistir: {(result.services.length > 0 ? result.services : result.where_to_watch ?? []).join(", ")}
                            </span>
                          )}

                          <p className="smart-queue-reason">{result.reason}</p>

                          {result.services.length > 0 && result.availability_source === "library_snapshot" && (
                            <span className="muted smart-queue-availability-note">
                              Segundo os dados do catálogo salvos com o título. A disponibilidade pode mudar.
                            </span>
                          )}

                          <div className="smart-queue-card-actions">
                            {result.source === "library" && result.library_id && status !== "watching" && status !== "rewatching" && (
                              <button type="button" className="btn primary" disabled={busy} onClick={() => startWatching(result)}>
                                {busy ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                                Começar a assistir
                              </button>
                            )}

                            {result.source === "discover" && !addedStatus && (
                              <button type="button" className="btn primary" disabled={busy} onClick={() => addToQueue(result)}>
                                {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                                Adicionar à fila
                              </button>
                            )}

                            {addedStatus && (
                              <span className="smart-queue-done">
                                <Check size={14} aria-hidden="true" /> {addedStatus === "watching" ? "Assistindo" : "Na sua fila"}
                              </span>
                            )}

                            <Link
                              className="btn"
                              href={`/title/${result.media_type}/${result.tmdb_id}`}
                              onClick={() => setOpen(false)}
                            >
                              Ver título
                            </Link>

                            {result.source === "discover" && !addedStatus && (
                              <button type="button" className="btn ghost" disabled={busy} onClick={() => notInterested(result)}>
                                <EyeOff size={14} />
                                Não tenho interesse
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
