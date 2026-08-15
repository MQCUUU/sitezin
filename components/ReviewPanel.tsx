"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  MessageSquare,
  Plus,
  Star,
  Trash2,
  Sparkles,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  weight: number;
  position: number;
};

type Score = {
  id: string;
  category_id: string;
  score: number | null;
};

type ReviewPanelProps = {
  libraryId: string;
  initialRating: number | null;
  initialReview: string;
  onRatingChange?: (rating: number | null) => void;
  onReviewChange?: (review: string) => void;
};

export function ReviewPanel({
  libraryId,
  initialRating,
  initialReview,
  onRatingChange,
  onReviewChange,
}: ReviewPanelProps) {
  const [mode, setMode] = useState<"simple" | "detailed">("simple");

  const [rating, setRating] = useState(
    initialRating !== null && initialRating !== undefined
      ? String(initialRating)
      : ""
  );

  const [review, setReview] = useState(initialReview || "");

  const [categories, setCategories] = useState<Category[]>([]);
  const [scores, setScores] = useState<Record<string, number | "">>({});

  const [savingReview, setSavingReview] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);

  const [newCategory, setNewCategory] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);

  useEffect(() => {
    loadCategories();
    loadScores();
  }, [libraryId]);

  async function loadCategories() {
    try {
      const response = await fetch("/api/reviews/categories");

      if (!response.ok) return;

      const data = await response.json();

      if (Array.isArray(data)) {
        setCategories(data);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function loadScores() {
    try {
      const response = await fetch(
        `/api/reviews/scores?library_item_id=${libraryId}`
      );

      if (!response.ok) return;

      const data = await response.json();

      if (!Array.isArray(data)) return;

      const mapped: Record<string, number | ""> = {};

      data.forEach((item: Score) => {
        mapped[item.category_id] =
          item.score === null ? "" : item.score;
      });

      setScores(mapped);

      if (data.length > 0) {
        setMode("detailed");
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function saveRating(value: string) {
    if (value === "") {
      setRating("");
      onRatingChange?.(null);

      if (libraryId) {
        await fetch(`/api/library/${libraryId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personal_rating: null,
          }),
        });
      }

      return;
    }

    let number = Number(value);

    if (Number.isNaN(number)) return;

    if (number < 0) number = 0;
    if (number > 10) number = 10;

    const formatted = Number(number.toFixed(1));

    setRating(String(formatted));
    onRatingChange?.(formatted);

    if (libraryId) {
      await fetch(`/api/library/${libraryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personal_rating: formatted,
        }),
      });
    }
  }

  async function saveScore(
    categoryId: string,
    value: number | ""
  ) {
    setScores((current) => ({
      ...current,
      [categoryId]: value,
    }));

    if (value === "") return;

    try {
      await fetch("/api/reviews/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          library_item_id: libraryId,
          category_id: categoryId,
          score: value,
        }),
      });
    } catch (error) {
      console.error(error);
    }
  }

  async function saveReview() {
    setSavingReview(true);
    setReviewSaved(false);

    try {
      await fetch(`/api/library/${libraryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review,
        }),
      });

      onReviewChange?.(review);
      setReviewSaved(true);

      setTimeout(() => {
        setReviewSaved(false);
      }, 2000);
    } catch (error) {
      console.error(error);
    } finally {
      setSavingReview(false);
    }
  }

  async function addCategory() {
    const name = newCategory.trim();

    if (!name) return;

    try {
      const response = await fetch("/api/reviews/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          weight: categories.length === 0 ? 100 : 0,
          position: categories.length,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(
          data.error ||
            "Não foi possível criar a categoria."
        );
        return;
      }

      setCategories((current) => [...current, data]);
      setNewCategory("");
      setShowAddCategory(false);
    } catch (error) {
      console.error(error);
    }
  }

  async function removeCategory(id: string) {
    const confirmed = window.confirm(
      "Remover esta categoria?"
    );

    if (!confirmed) return;

    try {
      await fetch(
        `/api/reviews/categories?id=${id}`,
        {
          method: "DELETE",
        }
      );

      setCategories((current) =>
        current.filter(
          (category) => category.id !== id
        )
      );

      setScores((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (error) {
      console.error(error);
    }
  }

  const calculatedRating = useMemo(() => {
    const ratedCategories = categories.filter(
      (category) =>
        scores[category.id] !== "" &&
        scores[category.id] !== undefined
    );

    if (!ratedCategories.length) {
      return null;
    }

    const totalWeight = ratedCategories.reduce(
      (sum, category) =>
        sum + Number(category.weight || 0),
      0
    );

    if (totalWeight <= 0) {
      const average =
        ratedCategories.reduce(
          (sum, category) =>
            sum +
            Number(
              scores[category.id] || 0
            ),
          0
        ) / ratedCategories.length;

      return Number(average.toFixed(1));
    }

    const weighted = ratedCategories.reduce(
      (sum, category) =>
        sum +
        Number(
          scores[category.id] || 0
        ) *
          Number(category.weight || 0),
      0
    );

    return Number(
      (weighted / totalWeight).toFixed(1)
    );
  }, [categories, scores]);

  const currentRating =
    mode === "detailed" &&
    calculatedRating !== null
      ? calculatedRating
      : rating !== ""
        ? Number(rating)
        : null;

  const ratingPercent =
    currentRating !== null
      ? Math.min(
          100,
          Math.max(0, currentRating * 10)
        )
      : 0;

  return (
    <section className="review-panel">

      {/* CABEÇALHO */}

      <div className="review-header">

        <div className="review-main-rating">

          <div className="review-kicker">
            <Star size={17} fill="currentColor" />
            Minha avaliação
          </div>

          <div className="big-rating">

            <strong>
              {currentRating !== null
                ? currentRating.toFixed(1)
                : "—"}
            </strong>

            <span>/10</span>

          </div>

          <div className="rating-progress">
            <div
              className="rating-progress-fill"
              style={{
                width: `${ratingPercent}%`,
              }}
            />
          </div>

        </div>

        <div className="review-switch">

          <button
            type="button"
            className={
              mode === "simple"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode("simple")
            }
          >
            Nota geral
          </button>

          <button
            type="button"
            className={
              mode === "detailed"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode("detailed")
            }
          >
            <Sparkles size={14} />
            Detalhada
          </button>

        </div>

      </div>

      {/* NOTA SIMPLES */}

      {mode === "simple" && (
        <div className="simple-rating">

          <div className="rating-input-wrapper">

            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={rating}
              placeholder="0.0"
              onChange={(event) =>
                setRating(
                  event.target.value
                )
              }
              onBlur={() =>
                saveRating(rating)
              }
            />

            <span>/ 10</span>

          </div>

          <div className="rating-hint">
            <span>
              Você pode usar qualquer decimal.
            </span>

            <span>
              Ex.: 7.7 · 8.3 · 9.5
            </span>
          </div>

        </div>
      )}

      {/* AVALIAÇÃO DETALHADA */}

      {mode === "detailed" && (
        <div className="detailed-rating">

          <div className="detailed-intro">
            <div>
              <strong>
                Avalie do seu jeito
              </strong>

              <span>
                Dê notas separadas para os
                aspectos que mais importam
                para você.
              </span>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="no-categories">

              <div className="no-categories-icon">
                <Sparkles size={25} />
              </div>

              <h3>
                Personalize sua avaliação
              </h3>

              <p>
                Crie categorias como
                História, Personagens,
                Romance, Humor ou qualquer
                outro aspecto que você queira
                avaliar.
              </p>

              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  setShowAddCategory(true)
                }
              >
                <Plus size={17} />
                Criar categoria
              </button>

            </div>
          ) : (
            <>
              <div className="category-list">

                {categories.map(
                  (category) => {
                    const value =
                      scores[
                        category.id
                      ];

                    const numericValue =
                      value === "" ||
                      value === undefined
                        ? 0
                        : Number(value);

                    return (
                      <div
                        className="review-category"
                        key={category.id}
                      >

                        <div className="category-top">

                          <div className="category-name">

                            <strong>
                              {category.name}
                            </strong>

                            <span>
                              Peso{" "}
                              {category.weight}%
                            </span>

                          </div>

                          <div className="category-score">

                            <strong>
                              {value === "" ||
                              value ===
                                undefined
                                ? "—"
                                : numericValue.toFixed(
                                    1
                                  )}
                            </strong>

                            <span>
                              /10
                            </span>

                          </div>

                          <button
                            type="button"
                            className="category-delete"
                            onClick={() =>
                              removeCategory(
                                category.id
                              )
                            }
                            title="Remover categoria"
                          >
                            <Trash2
                              size={15}
                            />
                          </button>

                        </div>

                        <div className="score-row">

                          <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.1"
                            value={
                              numericValue
                            }
                            onChange={(
                              event
                            ) =>
                              saveScore(
                                category.id,
                                Number(
                                  event.target
                                    .value
                                )
                              )
                            }
                            style={{
                              background: `linear-gradient(to right, var(--accent) ${numericValue * 10}%, var(--line) ${numericValue * 10}%)`,
                            }}
                          />

                        </div>

                      </div>
                    );
                  }
                )}

              </div>

              <button
                type="button"
                className="add-category"
                onClick={() =>
                  setShowAddCategory(true)
                }
              >
                <Plus size={17} />
                Adicionar categoria
              </button>

              {calculatedRating !== null && (
                <div className="calculated-rating">

                  <div>
                    <span>
                      Nota calculada
                    </span>

                    <small>
                      Baseada nas suas
                      avaliações
                    </small>
                  </div>

                  <strong>
                    {calculatedRating.toFixed(
                      1
                    )}
                  </strong>

                </div>
              )}
            </>
          )}

          {showAddCategory && (
            <div className="add-category-box">

              <input
                autoFocus
                value={newCategory}
                onChange={(event) =>
                  setNewCategory(
                    event.target.value
                  )
                }
                placeholder="Ex.: História"
                onKeyDown={(event) => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    addCategory();
                  }
                }}
              />

              <button
                type="button"
                className="btn primary"
                onClick={addCategory}
              >
                <Check size={16} />
                Adicionar
              </button>

              <button
                type="button"
                className="btn"
                onClick={() =>
                  setShowAddCategory(false)
                }
              >
                Cancelar
              </button>

            </div>
          )}

        </div>
      )}

      {/* OPINIÃO */}

      <div className="review-opinion">

        <div className="opinion-title">

          <div className="opinion-icon">
            <MessageSquare size={18} />
          </div>

          <div>
            <strong>
              Minha opinião
            </strong>

            <span>
              O que você achou desse
              filme ou série?
            </span>
          </div>

        </div>

        <textarea
          value={review}
          maxLength={2000}
          onChange={(event) => {
            setReview(
              event.target.value
            );
            setReviewSaved(false);
          }}
          onBlur={saveReview}
          placeholder="Escreva sua opinião, o que gostou, o que não gostou, personagens favoritos..."
        />

        <div className="opinion-footer">

          <span>
            {review.length}/2000
          </span>

          {savingReview && (
            <span className="saving">
              Salvando...
            </span>
          )}

          {reviewSaved && !savingReview && (
            <span className="saved">
              <Check size={14} />
              Opinião salva
            </span>
          )}

        </div>

      </div>

    </section>
  );
}