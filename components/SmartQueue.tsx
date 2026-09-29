"use client";

import { useSpotlight } from "@/components/ui/premium";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, Loader2, Shuffle, Sparkles, X } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import { Poster } from "@/components/Poster";

/*
 * V2.1-E — "O que assistir agora?" (dentro de /for-you; sem item novo na
 * navegação). Painel acessível (role=dialog, foco preso, Escape). Todo o
 * cálculo é servidor (`/api/smart-queue`), determinístico, sem IA; o
 * client só manda os filtros e mostra ≤ 3 resultados (ou 1 no
 * "Surpreenda-me") — nunca baixa a biblioteca.
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
  reason: string;
  source: "library" | "discover";
  availability_source: "library_snapshot" | "tmdb_live";
};

type QueueResponse = {
  results: QueueResult[];
  total_eligible: number;
  surprise: boolean;
  used_fallback: boolean;
  has_services: boolean;
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

const STATUS_LABEL: Record<string, string> = {
  want: "Na sua lista",
  watching: "Assistindo",
  rewatching: "Reassistindo",
  paused: "Pausado",
};

function durationLabel(result: QueueResult): string | null {
  if (result.runtime_minutes === null) return null;

  const minutes = result.runtime_minutes;
  const text =
    minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;

  return result.media_type === "tv" ? `~${text} por episódio (estimativa)` : text;
}

export function SmartQueue({ genres }: { genres: string[] }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("60");
  const [type, setType] = useState("all");
  const [genre, setGenre] = useState("");
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<QueueResponse | null>(null);

  const { ref: spotRef, onPointerMove: spotMove } = useSpotlight<HTMLElement>();
  const ref = useModal(open, () => setOpen(false));

  /*
   * V2.2-B — o CTA "O que assistir agora?" da Home leva a `/for-you?queue=open`
   * e abre o painel. Lê `window.location` (não `useSearchParams`, que exigiria
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

    try {
      const params = new URLSearchParams({ type });
      if (minutes) params.set("minutes", minutes);
      if (genre) params.set("genre", genre);
      if (mine) params.set("mine", "1");
      if (surprise) params.set("surprise", "1");

      const result = await fetch(`/api/smart-queue?${params.toString()}`, { cache: "no-store" });
      const data = await result.json().catch(() => null);

      if (!result.ok) throw new Error(data?.error || "Não foi possível montar sugestões.");

      setResponse(data);
    } catch (err) {
      setResponse(null);
      setError(err instanceof Error ? err.message : "Não foi possível montar sugestões.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="fy-smart-queue-cta panel mc-spot" ref={spotRef} onPointerMove={spotMove}>
        <div className="fy-assistant-cta-icon">
          <Clock3 size={22} strokeWidth={2} aria-hidden="true" />
        </div>

        <div>
          <strong>O que assistir agora?</strong>
          <p className="muted">Diga quanto tempo você tem e receba até 3 sugestões.</p>
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

            <div className="smart-queue-results" aria-live="polite">
              {error && <p role="alert">{error}</p>}

              {response && response.results.length === 0 && (
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
                    <span>Tente um tempo maior ou remova algum filtro.</span>
                  )}
                </div>
              )}

              {response && response.results.length > 0 && (
                <ol className="smart-queue-list">
                  {response.results.map((result) => {
                    const duration = durationLabel(result);

                    return (
                      <li key={`${result.media_type}-${result.tmdb_id}`} className="smart-queue-card">
                        <Link
                          className="smart-queue-poster"
                          href={`/title/${result.media_type}/${result.tmdb_id}`}
                          onClick={() => setOpen(false)}
                        >
                          <Poster path={result.poster_path} alt={result.title} sizes="80px" />
                        </Link>

                        <div className="smart-queue-info">
                          <Link
                            className="smart-queue-title"
                            href={`/title/${result.media_type}/${result.tmdb_id}`}
                            onClick={() => setOpen(false)}
                          >
                            {result.title}
                          </Link>
                          <span className="muted">
                            {result.media_type === "tv" ? "Série" : "Filme"}
                            {duration ? ` · ${duration}` : ""}
                            {result.next_episode
                              ? ` · próximo: S${result.next_episode.season} E${result.next_episode.episode}`
                              : ""}
                          </span>
                          <span className="muted">
                            {result.status ? STATUS_LABEL[result.status] || "Na biblioteca" : "Fora da sua biblioteca"}
                            {result.services.length > 0 ? ` · ${result.services.join(", ")}` : ""}
                          </span>
                          {result.services.length > 0 && result.availability_source === "library_snapshot" && (
                            <span className="muted smart-queue-availability-note">
                              Segundo os dados do catálogo salvos com o título. A disponibilidade pode mudar.
                            </span>
                          )}
                          <p className="smart-queue-reason">{result.reason}</p>
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
