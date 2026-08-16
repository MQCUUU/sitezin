"use client";

import {
  useState,
} from "react";

import {
  Bot,
  Loader2,
  Send,
  Sparkles,
  Star,
} from "lucide-react";

import Link from "next/link";

import {
  Search,
} from "@/components/Search";

import {
  img,
} from "@/lib/tmdb";

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

      const response =
        await fetch(
          "/api/assistant",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                message:
                  value,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro no assistente."
        );
      }

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

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <section className="section ai-assistant-hero panel">
        <div className="ai-assistant-icon">
          <Bot
            size={25}
          />
        </div>

        <div>
          <div className="eyebrow">
            MyCatalog AI
          </div>

          <h1>
            O que você quer assistir?
          </h1>

          <p className="muted">
            Pode pedir do seu jeito: gênero,
            duração, clima, história, humor ou
            comparar opções.
          </p>
        </div>
      </section>

      <section className="section ai-chat-box panel">
        <textarea
          value={
            message
          }
          onChange={(
            event
          ) =>
            setMessage(
              event.target.value
            )
          }
          onKeyDown={(
            event
          ) => {
            if (
              event.key ===
                "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();
              ask();
            }
          }}
          placeholder="Ex.: Quero uma série curta, engraçada, com episódios de até 30 minutos..."
        />

        <div className="ai-chat-actions">
          <span className="muted">
            Enter para enviar · Shift+Enter para quebrar linha
          </span>

          <button
            type="button"
            className="btn primary"
            disabled={
              loading ||
              !message.trim()
            }
            onClick={
              ask
            }
          >
            {loading ? (
              <Loader2
                size={16}
                className="spin"
              />
            ) : (
              <Send
                size={16}
              />
            )}

            Recomendar
          </button>
        </div>
      </section>

      {answer && (
        <section className="section">
          <div className="panel ai-answer">
            <Sparkles
              size={18}
            />

            <div>
              <div className="ai-answer-title-row">
                <strong>
                  {mode ===
                  "gemini"
                    ? "Recomendação da IA"
                    : mode ===
                      "cache"
                      ? "Resposta reaproveitada"
                      : "Recomendação MyCatalog"}
                </strong>

                {cacheHit && (
                  <span className="ai-cache-badge">
                    Cache{" "}
                    {cacheScope ===
                    "personalized"
                      ? "pessoal"
                      : "global"}
                  </span>
                )}
              </div>

              <p>
                {answer}
              </p>

              {cacheHit && (
                <small className="ai-cache-saving">
                  Essa resposta já economizou{" "}
                  <strong>
                    {cacheHitCount}
                  </strong>{" "}
                  {cacheHitCount ===
                  1
                    ? "chamada"
                    : "chamadas"}{" "}
                  ao Gemini.
                </small>
              )}
            </div>
          </div>
        </section>
      )}

      {results.length >
        0 && (
        <section className="section">
          <div className="section-head">
            <div>
              <div className="eyebrow">
                Sugestões
              </div>

              <h2>
                Para assistir agora
              </h2>
            </div>
          </div>

          <div className="ai-result-grid">
            {results.map(
              (
                item
              ) => {
                const type =
                  item.media_type ===
                    "tv"
                    ? "tv"
                    : "movie";

                const title =
                  item.title ||
                  item.name;

                const year =
                  (
                    item.release_date ||
                    item.first_air_date ||
                    ""
                  ).slice(
                    0,
                    4
                  );

                return (
                  <Link
                    key={`${type}-${item.id}`}
                    href={`/title/${type}/${item.id}`}
                    className="card ai-result-card"
                  >
                    <div className="poster">
                      <img loading="lazy" decoding="async"
                        src={img(
                          item.poster_path
                        )}
                        alt={
                          title
                        }
                      />

                      <span className="badge">
                        {type ===
                        "tv"
                          ? "SÉRIE"
                          : "FILME"}
                      </span>
                    </div>

                    <strong className="card-title">
                      {
                        title
                      }
                    </strong>

                    <div className="card-meta">
                      <span>
                        {year ||
                          "—"}
                      </span>

                      <span className="rating">
                        <Star
                          size={12}
                          fill="currentColor"
                        />

                        {Number(
                          item.vote_average ||
                            0
                        ).toFixed(
                          1
                        )}
                      </span>
                    </div>

                    {item.reason && (
                      <p className="ai-result-reason">
                        {
                          item.reason
                        }
                      </p>
                    )}
                  </Link>
                );
              }
            )}
          </div>
        </section>
      )}
    </>
  );
}