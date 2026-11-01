"use client";

import "@/styles/features/title-detail.css";
import { useCallback, useId, useState } from "react";
import { ExternalLink, Loader2, Play, RefreshCw, X } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { ProviderLogo } from "@/components/media/providers/ProviderLogo";
import { whereToWatchRows, type WatchOffer } from "@/lib/streaming/watch-link";
import type { LooseTitleDetails, TitleType } from "./types";

const OFFER_LABEL: Record<WatchOffer, string> = {
  subscription: "Assinatura",
  free: "Grátis",
  ads: "Grátis com anúncios",
  rent: "Aluguel",
  buy: "Compra",
};

const SECTIONS: { title: string; offers: WatchOffer[] }[] = [
  { title: "Na assinatura", offers: ["subscription"] },
  { title: "Grátis", offers: ["free", "ads"] },
  { title: "Para alugar", offers: ["rent"] },
  { title: "Para comprar", offers: ["buy"] },
];

type LoadState = "ready" | "loading" | "error";

/**
 * "▶ Onde assistir": botão no topo do título que abre um painel compacto com as
 * plataformas do Brasil (assinatura, grátis, aluguel, compra) e o link oficial
 * para abrir o título nelas. `watch_providers === null` significa que a consulta
 * ao TMDB falhou (lib/title-details.ts) — diferente de "consultou e não há opção".
 */
export function TitleWhereToWatch({ type, details }: { type: TitleType; details: LooseTitleDetails }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<unknown>(details.watch_providers ?? null);
  const [state, setState] = useState<LoadState>(details.watch_providers == null ? "error" : "ready");
  const titleId = useId();
  const title = details.title || details.name || "este título";
  const tmdbId = Number(details.id);

  const close = useCallback(() => setOpen(false), []);

  const retry = useCallback(async () => {
    if (!Number.isFinite(tmdbId)) return;
    setState("loading");

    try {
      const response = await fetch(`/api/tmdb/${type}/${tmdbId}`, { cache: "no-store" });
      const body = response.ok ? await response.json() : null;

      if (body?.watch_providers == null) throw new Error("sem dados");
      setRaw(body.watch_providers);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [type, tmdbId]);

  const openPanel = () => {
    setOpen(true);
    if (state === "error") void retry();
  };

  const { rows, link } = whereToWatchRows(raw);

  return (
    <>
      <button type="button" className="btn title-main-btn title-where-btn" onClick={openPanel} aria-haspopup="dialog">
        <Play size={17} fill="currentColor" />
        Onde assistir
      </button>

      <Dialog open={open} onClose={close} labelledBy={titleId} className="title-where-dialog">
        <header className="title-where-head">
          <div>
            <h2 id={titleId}>Onde assistir</h2>
            <p>{title} · no Brasil</p>
          </div>

          <button type="button" className="title-where-close" onClick={close} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        {state === "loading" ? (
          <div className="title-where-status" role="status">
            <Loader2 size={22} className="title-where-spin" />
            Procurando onde assistir…
          </div>
        ) : state === "error" ? (
          <div className="title-where-status" role="alert">
            <p>Não conseguimos consultar onde assistir agora. Verifique sua conexão e tente de novo.</p>
            <button type="button" className="btn" onClick={() => void retry()}>
              <RefreshCw size={16} />
              Tentar de novo
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="title-where-status" role="status">
            <p>
              Não encontramos uma opção de streaming para este título no momento. A disponibilidade pode mudar,
              então tente novamente mais tarde.
            </p>
          </div>
        ) : (
          <>
            <p className="title-where-intro">
              Escolha a plataforma. O link abre a página oficial deste título no TMDB/JustWatch, onde um clique leva
              direto a ele na plataforma.
            </p>

            <div className="title-where-sections">
              {SECTIONS.map((section) => {
                const items = rows.filter((row) => section.offers.includes(row.offer));
                if (!items.length) return null;

                return (
                  <section key={section.title} className="title-where-section" aria-label={section.title}>
                    <h3>{section.title}</h3>

                    <ul>
                      {items.map((row) => (
                        <li key={`${row.offer}-${row.id}`} className="title-where-row">
                          <ProviderLogo provider={row} sizes="40px" className="title-where-logo" />

                          <div className="title-where-name">
                            <strong>{row.name}</strong>
                            <span>{OFFER_LABEL[row.offer]}</span>
                          </div>

                          {link ? (
                            <a
                              className="btn title-where-open"
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Abrir ${title} em ${row.name} (${OFFER_LABEL[row.offer].toLowerCase()}) — abre em nova aba`}
                            >
                              Abrir
                              <ExternalLink size={14} />
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            {!link && (
              <p className="title-where-note">
                As plataformas acima têm este título, mas não recebemos um link oficial para abri-lo direto. Procure
                pelo título no app da plataforma.
              </p>
            )}
          </>
        )}

        <footer className="title-where-foot">
          <span>
            Dados de disponibilidade: JustWatch, via TMDB. Podem mudar a qualquer momento.
          </span>
          {state === "ready" && rows.length > 0 && link && (
            <span>O link abre em nova aba — o MyCatalog continua aqui. Se não funcionar, volte e escolha outra opção.</span>
          )}
        </footer>
      </Dialog>
    </>
  );
}
