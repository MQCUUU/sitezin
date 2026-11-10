"use client";

import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { Check, ChevronDown, Clock3, Eye, EyeOff, Film, Filter, Heart, Loader2, Plus, Shuffle, Star, Trash2, Tv, X } from "lucide-react";

import { Poster } from "@/components/Poster";
import { Button } from "@/components/ui/Button";
import { intentForMedia, type LibraryIntent } from "@/lib/auth/pending-action";
import { PickForMeWatchProviders } from "@/components/pick-for-me/parts";
import {
  STATUS_OPTIONS,
  titleOf,
  statusLabel,
  formatRuntime,
  type PickResult,
} from "@/components/pick-for-me/shared";

/*
 * Passos 2 e 3 do "Escolher pra mim": roleta girando e resultado. Saiu de
 * components/PickForMe.tsx (o JSX é o mesmo); estado e ações continuam lá e
 * chegam por props tipadas.
 */

export type PickResultActions = {
  setStep: Dispatch<SetStateAction<"filters" | "spinning" | "result">>;
  setOpenStatus: Dispatch<SetStateAction<boolean>>;
  runGuarded: (intent: LibraryIntent | undefined, fallback: string, run: () => Promise<unknown>) => void;
  pick: (surprise?: boolean) => void;
  rejectWinner: () => void;
  markNotInterested: () => Promise<void>;
  addToLibrary: () => Promise<void>;
  updateStatus: (status: string) => Promise<void>;
  toggleFavorite: () => Promise<void>;
  updateRating: (personal_rating: number | null) => Promise<void>;
  requestRemove: () => Promise<void>;
};

export type PickResultStepProps = {
  step: "filters" | "spinning" | "result";
  current: PickResult | null;
  winner: PickResult | null;
  processing: boolean;
  openStatus: boolean;
  runtime: ReturnType<typeof import("@/components/pick-for-me/shared").runtimeOf>;
  yearLabel: string;
  actions: PickResultActions;
};

export function PickResultStep({
  step,
  current,
  winner,
  processing,
  openStatus,
  runtime,
  yearLabel,
  actions,
}: PickResultStepProps) {
  const {
    setStep,
    setOpenStatus,
    runGuarded,
    pick,
    rejectWinner,
    markNotInterested,
    addToLibrary,
    updateStatus,
    toggleFavorite,
    updateRating,
    requestRemove,
  } = actions;

  return (
      <div
        className={
          "pick-result-layout " +
          (step ===
            "spinning"
            ? "spinning"
            : "")
        }
      >
        <div className="pick-result-visual">
          <div className="pick-result-poster">
            {current
              ?.poster_path ? (
              <Poster
                path={current.poster_path}
                alt={titleOf(current)}
                sizes="(max-width: 700px) 125px, 260px"
                priority
              />
            ) : (
              <div className="pick-empty-poster">
                {current
                  ?.media_type ===
                "tv" ? (
                  <Tv
                    size={40}
                  />
                ) : (
                  <Film
                    size={40}
                  />
                )}
              </div>
            )}

            {step ===
              "spinning" && (
              <div className="pick-spin-overlay">
                <Shuffle
                  size={28}
                />
              </div>
            )}
          </div>
        </div>

        <div className="pick-result-copy">
          {step ===
          "spinning" ? (
            <div className="pick-spinning-copy">
              <p className="pick-spinning-label">Sorteando…</p>

              <h2>
                {titleOf(
                  current
                )}
              </h2>

              <p>
                Filtrando a bagunça e procurando uma escolha que valha seu tempo.
              </p>

              <div className="pick-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : (
            <>
              <p className="pick-spinning-label">Escolhido para você</p>

              <h2>
                {titleOf(
                  winner
                )}
              </h2>

              <div className="pick-result-meta">
                <span>
                  {winner
                    ?.media_type ===
                  "tv"
                    ? "Série"
                    : "Filme"}
                </span>

                {yearLabel && (
                  <span>
                    {
                      yearLabel
                    }
                  </span>
                )}

                {runtime && (
                  <span>
                    <Clock3
                      size={12}
                    />
                    {formatRuntime(
                      runtime,
                      winner
                        ?.media_type ===
                        "tv"
                    )}
                  </span>
                )}

                {Number(
                  winner
                    ?.vote_average ||
                    0
                ) >
                  0 && (
                  <span className="rating">
                    <Star
                      size={14}
                      fill="currentColor"
                    />

                    {Number(
                      winner
                        ?.vote_average
                    ).toFixed(
                      1
                    )}
                  </span>
                )}
              </div>

              {Array.isArray(winner?._reasons) &&
                winner._reasons.length > 0 && (
                <div
                  className={`pick-why ${winner._personalized ? "is-personal" : ""}`}
                >
                  <strong>
                    {winner._personalized ? "Por que este pra você" : "Por que este"}
                  </strong>
                  <ul>
                    {winner._reasons.map((reason: string) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {winner
                ?.genres &&
                winner.genres
                  .length >
                  0 && (
                <div className="pick-genres">
                  {winner.genres
                    .slice(
                      0,
                      5
                    )
                    .map(
                      (
                        item
                      ) => (
                        <span
                          key={
                            item.id
                          }
                        >
                          {
                            item.name
                          }
                        </span>
                      )
                    )}
                </div>
              )}

              <PickForMeWatchProviders
                winner={
                  winner
                }
              />

              {winner
                ?.in_library && (
                <div className="pick-personal-rating">
                  <div>
                    <span>
                      Minha nota
                    </span>

                    <strong>
                      {winner.personal_rating !==
                        null &&
                      winner.personal_rating !==
                        undefined
                        ? Number(
                            winner.personal_rating
                          ).toFixed(
                            1
                          )
                        : "Sem nota"}
                    </strong>
                  </div>

                  <div className="pick-rating-buttons">
                    {[1,2,3,4,5,6,7,8,9,10].map(
                      (
                        value
                      ) => (
                        <button
                          type="button"
                          key={
                            value
                          }
                          className={
                            Number(
                              winner.personal_rating
                            ) ===
                            value
                              ? "active"
                              : ""
                          }
                          disabled={
                            processing
                          }
                          onClick={() =>
                            runGuarded(undefined, "Erro ao alterar sua nota", () => updateRating(value))
                          }
                        >
                          {
                            value
                          }
                        </button>
                      )
                    )}

                    <button
                      type="button"
                      className="clear"
                      disabled={
                        processing
                      }
                      onClick={() =>
                        runGuarded(undefined, "Erro ao alterar sua nota", () => updateRating(null))
                      }
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              )}

              <p className="pick-overview">
                {winner
                  ?.overview
                  ?.trim() ||
                  "Ainda não há sinopse disponível para este título."}
              </p>

              <div className="pick-library-actions">
                {!winner
                  ?.in_library ? (
                  <Button variant="primary"
                    type="button"

                    disabled={
                      processing
                    }
                    onClick={
                      () => winner && runGuarded(intentForMedia(winner, "add"), "Erro ao adicionar", addToLibrary)
                    }
                  >
                    {processing ? (
                      <Loader2
                        size={16}
                        className="spin"
                      />
                    ) : (
                      <Plus
                        size={16}
                      />
                    )}

                    Quero assistir
                  </Button>
                ) : (
                  <>
                    <div className="pick-status-wrap">
                      <Button
                        type="button"
                        className="pick-status-button"
                        disabled={
                          processing
                        }
                        onClick={() =>
                          setOpenStatus(
                            (
                              value
                            ) =>
                              !value
                          )
                        }
                      >
                        <Check
                          size={16}
                        />

                        {statusLabel(
                          winner.library_status
                        )}

                        <ChevronDown
                          size={14}
                        />
                      </Button>

                      {openStatus && (
                        <div className="pick-status-menu">
                          {STATUS_OPTIONS.map(
                            (
                              [
                                value,
                                label,
                              ]
                            ) => (
                              <button
                                type="button"
                                key={
                                  value
                                }
                                className={
                                  winner.library_status ===
                                  value
                                    ? "active"
                                    : ""
                                }
                                onClick={() =>
                                  winner && runGuarded(intentForMedia(winner, "status", value), "Erro ao alterar status", () => updateStatus(value))
                                }
                              >
                                <span>
                                  {
                                    label
                                  }
                                </span>

                                {winner.library_status ===
                                  value && (
                                  <Check
                                    size={14}
                                  />
                                )}
                              </button>
                            )
                          )}

                          <div />

                          <button
                            type="button"
                            className="remove"
                            onClick={
                              requestRemove
                            }
                          >
                            <Trash2
                              size={14}
                            />

                            Remover
                          </button>
                        </div>
                      )}
                    </div>

                    <Button
                      type="button"
                      className={
                        "pick-favorite " +
                        (winner.favorite
                          ? "active"
                          : "")
                      }
                      disabled={
                        processing
                      }
                      onClick={
                        () => winner && runGuarded(winner.favorite ? undefined : intentForMedia(winner, "favorite"), "Erro ao alterar curtida", toggleFavorite)
                      }
                    >
                      <Heart
                        size={16}
                        fill={
                          winner.favorite
                            ? "currentColor"
                            : "none"
                        }
                      />

                      {winner.favorite
                        ? "Curtido"
                        : "Curtir"}
                    </Button>
                  </>
                )}

                <Link
                  href={`/title/${winner?.media_type}/${winner?.id}`}
                  className="btn"
                >
                  <Eye
                    size={16}
                  />

                  Ver detalhes
                </Link>
              </div>

              <div className="pick-reroll-actions">
                <Button
                  type="button"

                  onClick={() =>
                    setStep(
                      "filters"
                    )
                  }
                >
                  <Filter
                    size={16}
                  />

                  Alterar filtros
                </Button>

                <Button
                  type="button"
                  className="pick-not-interested"
                  disabled={
                    processing
                  }
                  onClick={
                    markNotInterested
                  }
                >
                  <EyeOff
                    size={16}
                  />

                  Não tenho interesse
                </Button>

                <Button
                  type="button"

                  onClick={
                    rejectWinner
                  }
                >
                  <X
                    size={16}
                  />

                  Não quero esse
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    pick(
                      false
                    )
                  }
                >
                  <Shuffle
                    size={16}
                  />

                  Girar novamente
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
  );
}
