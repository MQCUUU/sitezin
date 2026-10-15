import { Check, CircleDashed, CirclePlay, ListChecks, Repeat } from "lucide-react";

import type { LibraryProgress } from "@/lib/library/progress";

/*
 * Biblioteca V2.6 — progresso de série. Card: UMA linha (sem barra, sem badge
 * extra). Quick View: "Seu progresso" com a linha principal + um detalhe.
 * O texto sempre diz tudo; o ícone é decorativo.
 */

const ICON: Record<LibraryProgress["state"], typeof Check> = {
  in_progress: CirclePlay,
  not_started: CircleDashed,
  caught_up: Check,
  completed: Check,
  rewatching: Repeat,
  unknown: ListChecks,
  legacy: ListChecks,
};

export function SeriesProgressLine({ progress }: { progress?: LibraryProgress | null }) {
  if (!progress?.card) return null;

  const Icon = ICON[progress.state];

  return (
    <p className={`lib-progress lib-progress--${progress.state}`}>
      <Icon size={13} aria-hidden="true" />
      <span>{progress.card}</span>
    </p>
  );
}

export function SeriesProgressPanel({ progress }: { progress: LibraryProgress }) {
  if (!progress.title) return null;

  const Icon = ICON[progress.state];

  return (
    <section className="lib-progress-panel" aria-label="Seu progresso">
      <span className="lib-progress-eyebrow">Seu progresso</span>
      <p className="lib-progress-title">
        <Icon size={16} aria-hidden="true" />
        {progress.title}
      </p>
      {progress.detail ? <p className="lib-progress-detail">{progress.detail}</p> : null}
    </section>
  );
}
