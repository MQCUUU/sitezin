"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Home,
  RefreshCcw,
  WifiOff,
} from "lucide-react";

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
          <button
            type="button"
            className="btn primary"
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
          </button>
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

        <button
          type="button"
          className="btn"
          onClick={() =>
            history.back()
          }
        >
          <ArrowLeft
            size={14}
          />

          Voltar
        </button>
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

export function PageSkeleton() {
  return (
    <div className="mc-page-skeleton">
      <div className="mc-skeleton mc-skeleton-search" />

      <section>
        <div className="mc-skeleton mc-skeleton-eyebrow" />
        <div className="mc-skeleton mc-skeleton-heading" />
        <div className="mc-skeleton mc-skeleton-copy" />
      </section>

      <div className="mc-skeleton mc-skeleton-hero" />

      <section>
        <div className="mc-skeleton mc-skeleton-section-title" />

        <PosterSkeleton
          count={
            6
          }
        />
      </section>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="mc-detail-skeleton">
      <div className="mc-skeleton mc-skeleton-search" />

      <div className="mc-detail-skeleton-hero">
        <div className="mc-skeleton mc-detail-skeleton-poster" />

        <div className="mc-detail-skeleton-copy">
          <div className="mc-skeleton mc-skeleton-eyebrow" />
          <div className="mc-skeleton mc-skeleton-heading large" />
          <div className="mc-skeleton mc-skeleton-copy" />
          <div className="mc-skeleton mc-skeleton-copy short" />
          <div className="mc-detail-skeleton-actions">
            <div className="mc-skeleton" />
            <div className="mc-skeleton" />
            <div className="mc-skeleton" />
          </div>
        </div>
      </div>
    </div>
  );
}