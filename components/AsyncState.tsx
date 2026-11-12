"use client";


import "@/styles/features/screen-band.css";
import "@/styles/features/title-hero.css";
import "@/styles/features/states.css";
import React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Home,
  RefreshCcw,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

import Link from "next/link";

type ErrorStateProps = {
  title?:
    string;

  description?:
    string;

  onRetry?:
    () =>
      void;

  retryLabel?:
    string;

  compact?:
    boolean;

  network?:
    boolean;

  showHome?:
    boolean;
};

export function ErrorState({
  title =
    "Não foi possível carregar",
  description =
    "Ocorreu um problema temporário. Tente novamente.",
  onRetry,
  retryLabel =
    "Tentar novamente",
  compact =
    false,
  network =
    false,
  showHome =
    false,
}: ErrorStateProps) {
  const Icon =
    network
      ? WifiOff
      : AlertTriangle;

  return (
    <div
      className={
        compact
          ? "mc-error-state compact"
          : "mc-error-state"
      }
      role="alert"
    >
      <div className="mc-error-icon">
        <Icon
          size={
            compact
              ? 19
              : 25
          }
        />
      </div>

      <div className="mc-error-copy">
        <strong>
          {
            title
          }
        </strong>

        <span>
          {
            description
          }
        </span>
      </div>

      <div className="mc-error-actions">
        {onRetry && (
          <Button variant="primary"
            type="button"
           
            onClick={
              onRetry
            }
          >
            <RefreshCcw
              size={14}
            />

            {
              retryLabel
            }
          </Button>
        )}

        {showHome && (
          <Link
            href="/"
            className="btn"
          >
            <Home
              size={14}
            />

            Início
          </Link>
        )}
      </div>
    </div>
  );
}

export function NotFoundState({
  title =
    "Nada por aqui",
  description =
    "Esse conteúdo não existe, foi removido ou mudou de endereço.",
}: {
  title?:
    string;

  description?:
    string;
}) {
  return (
    <div className="mc-error-state">
      <div className="mc-error-code">
        404
      </div>

      <div className="mc-error-copy">
        <strong>
          {
            title
          }
        </strong>

        <span>
          {
            description
          }
        </span>
      </div>

      <div className="mc-error-actions">
        <Link
          href="/"
          className="btn primary"
        >
          <Home
            size={14}
          />

          Ir para o início
        </Link>

        <Button
          type="button"
         
          onClick={() =>
            history.back()
          }
        >
          <ArrowLeft
            size={14}
          />

          Voltar
        </Button>
      </div>
    </div>
  );
}

export function PosterSkeleton({
  count =
    6,
}: {
  count?:
    number;
}) {
  return (
    <div className="mc-skeleton-poster-grid">
      {Array.from(
        {
          length:
            count,
        },
        (
          _,
          index
        ) => (
          <div
            key={
              index
            }
            className="mc-skeleton-poster-card"
          >
            <div className="mc-skeleton mc-skeleton-poster" />

            <div className="mc-skeleton mc-skeleton-title" />

            <div className="mc-skeleton mc-skeleton-meta" />
          </div>
        )
      )}
    </div>
  );
}

/** A Tela (faixa panorâmica) ainda sem imagem: mesmo tamanho da faixa real. */
export function BandSkeleton() {
  return (
    <div className="tt-band" aria-hidden="true">
      <div className="tt-band-screen mc-sk-band" />
    </div>
  );
}

/** Cabeçalho de página: título grande e uma linha de texto. */
function HeadSkeleton({ tabs = false }: { tabs?: boolean }) {
  return (
    <div className="mc-sk-head" aria-hidden="true">
      <div className="mc-skeleton mc-sk-page-title" />
      <div className="mc-skeleton mc-sk-copy" />
      {tabs ? (
        <div className="mc-sk-tabs">
          <div className="mc-skeleton" />
          <div className="mc-skeleton" />
          <div className="mc-skeleton" />
        </div>
      ) : null}
    </div>
  );
}

/** Padrão de rota sem esqueleto próprio: título, texto e uma grade de pôsteres. */
export function PageSkeleton() {
  return (
    <div className="mc-page-skeleton" role="status" aria-label="Carregando">
      <HeadSkeleton />
      <section aria-hidden="true">
        <div className="mc-skeleton mc-skeleton-section-title" />
        <PosterSkeleton count={6} />
      </section>
    </div>
  );
}

/** Páginas que abrem com a Tela (Biblioteca, Para você, Descobrir): faixa, cabeçalho, abas e grade. */
export function BandPageSkeleton({ posters = 12 }: { posters?: number }) {
  return (
    <div className="mc-page-skeleton mc-band-page-skeleton" role="status" aria-label="Carregando">
      <BandSkeleton />
      <HeadSkeleton tabs />
      <section aria-hidden="true">
        <PosterSkeleton count={posters} />
      </section>
    </div>
  );
}

/** Título, série, episódio, coleção e pessoa: a Tela e o nome grande, sem pôster ao lado. */
export function DetailSkeleton() {
  return (
    <div className="mc-detail-skeleton" role="status" aria-label="Carregando">
      <div className="mc-sk-back-wrap" aria-hidden="true">
        <div className="mc-skeleton mc-sk-back" />
      </div>
      <section className="tt-hero" aria-hidden="true">
        <BandSkeleton />
        <div className="tt-head">
          <div className="tt-copy">
            <div className="mc-skeleton mc-sk-title" />
            <div className="mc-skeleton mc-sk-meta" />
            <div className="mc-skeleton mc-sk-meta mc-sk-meta--short" />
            <div className="tt-actions">
              <div className="mc-skeleton mc-sk-btn" />
              <div className="mc-skeleton mc-sk-btn" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
