"use client";


import "@/styles/features/assistant.css";
import { apiFetch } from "@/lib/api-client";
import { Poster } from "@/components/Poster";
import { ConnectedPosterActions } from "@/components/media/ConnectedPosterActions";
import { useRef, useState } from "react";
import { motion } from "motion/react";

import { Loader2, Send, Star } from "lucide-react";

import Link from "next/link";

import {
  Search,
} from "@/components/Search";
import { Button } from "@/components/ui/Button";


export default function AssistantPage() {
  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    answer,
    setAnswer,
  ] =
    useState("");

  const [
    applied,
    setApplied,
  ] =
    useState<any>(null);

  const [
    results,
    setResults,
  ] =
    useState<any[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    mode,
    setMode,
  ] =
    useState<
      "gemini" |
      "fallback" |
      "cache" |
      "library" |
      ""
    >("");


  const [
    cacheHit,
    setCacheHit,
  ] =
    useState(
      false
    );

  const [
    cacheHitCount,
    setCacheHitCount,
  ] =
    useState(
      0
    );

  const [
    cacheScope,
    setCacheScope,
  ] =
    useState<
      "global" |
      "personalized" |
      ""
    >("");

  const fieldRef = useRef<HTMLTextAreaElement>(null);

  async function ask() {
    const value =
      message.trim();

    if (
      !value ||
      loading
    ) {
      return;
    }

    try {
      setLoading(
        true
      );

      // A resposta da IA pode passar dos 15 s padrão do cliente (antes não havia limite).
      const data = await apiFetch("/api/assistant", { method: "POST", json: { message: value }, timeout: 60000 });

      setAnswer(
        data.answer ||
          ""
      );

      setResults(
        Array.isArray(
          data.results
        )
          ? data.results
          : []
      );

      setMode(
        data.mode ||
          ""
      );

      setApplied(data.applied || null);


      setCacheHit(
        Boolean(
          data.cache_hit
        )
      );

      setCacheHitCount(
        Number(
          data.cache_hit_count ||
            0
        )
      );

      setCacheScope(
        data.cache_scope ||
          ""
      );
    } catch (
      error
    ) {
      setAnswer(
        error instanceof Error
          ? error.message
          : "Não foi possível responder."
      );

      setResults(
        []
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  // Fase 4: pedidos prontos — um clique preenche o campo (a pessoa ajusta e envia).
  const EXAMPLES = [
    "Uma série curta e engraçada, com episódios de até 30 minutos",
    "Um filme de suspense para ver hoje, que não seja muito longo",
    "Um filme bem avaliado que eu ainda não vi",
    "Uma animação para assistir em família",
  ];

  const answerLabel =
    mode === "library" ? "Da sua biblioteca" : mode === "gemini" ? "Recomendação da IA" : mode === "cache" ? "Resposta reaproveitada" : "Recomendação MyCatalog";

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      {/* Fase 4: a pergunta é o título da página (e o nome do campo); sem caixa, ícone ou rótulo em caixa alta. */}
      <header className="ai-head">
        <h1 id="ai-assistant-title">O que você quer assistir?</h1>
        <p>Peça do seu jeito: gênero, duração, clima, história, humor ou comparar opções.</p>
      </header>

      <section className="ai-composer" aria-label="Pedido">
        {/* Fase 5 (P2-10): o título visível é o rótulo; o atalho de teclado é a descrição. */}
        <textarea
          ref={fieldRef}
          aria-labelledby="ai-assistant-title"
          aria-describedby="ai-assistant-hint"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
          placeholder="Ex.: Quero uma série curta, engraçada, com episódios de até 30 minutos..."
        />

        <div className="ai-composer-actions">
          <span id="ai-assistant-hint">Enter para enviar, Shift+Enter para quebrar linha</span>

          <Button variant="primary" type="button" className="ai-send" disabled={loading || !message.trim()} onClick={ask}>
            {loading ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
            {loading ? "Procurando…" : "Recomendar"}
          </Button>
        </div>
      </section>

      {!answer && !loading ? (
        <div className="ai-examples" role="group" aria-label="Exemplos de pedido">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="ai-example"
              onClick={() => {
                setMessage(example);
                fieldRef.current?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {/* Resposta e sugestões entram com um fade curto (respondem ao pedido); com movimento reduzido, só aparecem. */}
      {answer ? (
        <motion.section
          key={`answer-${answer.length}-${results.length}`}
          className="ai-answer"
          aria-live="polite"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
        >
          <h2 className="ai-answer-title">
            {answerLabel}
            {cacheHit ? <span className="ai-cache-badge">cache {cacheScope === "personalized" ? "pessoal" : "global"}</span> : null}
          </h2>

          <p className="ai-answer-text">{answer}</p>

          {applied && (applied.library_excluded || (applied.statuses?.length ?? 0) > 0 || (applied.titles?.length ?? 0) > 0) ? (
            <small className="ai-note">
              Não incluí{" "}
              {[
                applied.library_excluded ? "nada da sua biblioteca" : null,
                !applied.library_excluded && applied.statuses?.length ? `títulos ${applied.statuses.join(", ")}` : null,
                applied.titles?.length ? applied.titles.join(", ") : null,
                "os que você ocultou",
              ]
                .filter(Boolean)
                .join(", ")}
              .
            </small>
          ) : null}

          {cacheHit ? (
            <small className="ai-note">
              Essa resposta já economizou <strong>{cacheHitCount}</strong> {cacheHitCount === 1 ? "chamada" : "chamadas"} ao Gemini.
            </small>
          ) : null}
        </motion.section>
      ) : null}

      {results.length > 0 ? (
        <motion.section
          key={`results-${results.map((r) => r.id).join("-")}`}
          className="ai-results"
          aria-labelledby="ai-results-title"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.06, ease: [0.23, 1, 0.32, 1] }}
        >
          <h2 id="ai-results-title" className="ai-results-title">
            Para assistir agora
          </h2>

          <div className="ai-result-grid" data-rec-tool="assistant">
            {results.map((item) => {
              const type = item.media_type === "tv" ? "tv" : "movie";
              const title = item.title || item.name;
              const year = (item.release_date || item.first_air_date || "").slice(0, 4);
              const vote = Number(item.vote_average || 0);

              return (
                <div key={`${type}-${item.id}`} className="card ai-result-card">
                  {/* Pôster + botões do pôster (fora do link); tags de tipo/status ao vivo. */}
                  <div className="poster mc-pa-host">
                    <Link href={`/title/${type}/${item.id}`} tabIndex={-1} aria-hidden="true" className="poster-link">
                      <Poster path={item.poster_path} alt="" sizes="(max-width: 700px) 45vw, 190px" />
                    </Link>
                    <ConnectedPosterActions
                      tags
                      media={{ tmdbId: Number(item.id), mediaType: type, title: title || "Sem título", year, posterPath: item.poster_path ?? null, voteAverage: vote || null }}
                    />
                  </div>

                  <Link href={`/title/${type}/${item.id}`} className="card-title">
                    {title}
                  </Link>

                  <div className="card-meta">
                    <span>
                      {type === "tv" ? "Série" : "Filme"}
                      {year ? ` ${year}` : ""}
                    </span>
                    {vote > 0 ? (
                      <span className="rating">
                        <Star size={12} fill="currentColor" aria-hidden="true" />
                        {vote.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    ) : null}
                  </div>

                  {item.reason ? <p className="ai-result-reason">{item.reason}</p> : null}
                </div>
              );
            })}
          </div>
        </motion.section>
      ) : null}
    </>
  );
}
