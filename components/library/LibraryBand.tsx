"use client";

import { useProjectionTarget } from "@/components/screen/ProjectionProvider";
import { TitleBand } from "@/components/title/hero/TitleBand";
import type { LibraryItem } from "@/lib/types";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

function watchedOn(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

/**
 * Fase 6 — a Tela da Biblioteca. Mostra o backdrop do pôster sob o ponteiro (Projeção)
 * ou, sem foco, o primeiro título da página; a legenda traz a sua nota e a data em que assistiu.
 */
export function LibraryBand({ items, loading }: { items: LibraryItem[]; loading: boolean }) {
  const target = useProjectionTarget()?.target ?? null;
  // Base fixa (primeiro com imagem): a camada de Projeção do TitleBand faz o fade até o alvo.
  const base = items.find((item) => item.backdrop_path) ?? null;
  const focused = items.find((item) => target && item.backdrop_path === target) ?? base;

  if (!focused || !base) {
    return loading && items.length === 0 ? (
      <div className="lb-band">
        <div className="tt-band">
          <div className="tt-band-screen mc-skeleton dc-band-skeleton" role="status" aria-label="Carregando destaque" />
        </div>
      </div>
    ) : null;
  }

  const rating = focused.personal_rating != null ? Number(focused.personal_rating).toFixed(1).replace(".", ",") : null;
  const date = watchedOn(focused.watched_at);

  return (
    <div className="lb-band">
      <TitleBand path={base.backdrop_path} />
      <p className="lb-band-caption" aria-live="off">
        <span>{focused.title}</span>
        {rating ? (
          <>
            , <strong>sua nota {rating}</strong>
          </>
        ) : null}
        {date ? `, assistido em ${date}` : null}
      </p>
    </div>
  );
}
