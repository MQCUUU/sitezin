"use client";


import "@/styles/features/title-detail.css";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  MessageSquare,
  Plus,
  Star,
  Trash2,
  Sparkles,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { apiFetch, isAbortError } from "@/lib/api-client";

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

/*
 * Mesma fórmula usada pelo `calculatedRating` (useMemo abaixo): média
 * ponderada pelo peso da categoria, ou média simples quando a soma dos
 * pesos é zero. Extraída para função pura porque `saveScore` e
 * `removeCategory` precisam recalcular com um snapshot de `scores` que
 * ainda não passou pelo `setState` (React não garante o valor
 * atualizado de `scores` no mesmo tick).
 */
function computeWeightedRating(
  categories: Category[],
  scores: Record<string, number | "">
): number | null {
  const ratedCategories = categories.filter(
    (category) => scores[category.id] !== "" && scores[category.id] !== undefined
  );

  if (!ratedCategories.length) return null;

  const totalWeight = ratedCategories.reduce(
    (sum, category) => sum + Number(category.weight || 0),
    0
  );

  if (totalWeight <= 0) {
    const average =
      ratedCategories.reduce(
        (sum, category) => sum + Number(scores[category.id] || 0),
        0
      ) / ratedCategories.length;

    return Number(average.toFixed(1));
  }

  const weighted = ratedCategories.reduce(
    (sum, category) =>
      sum + Number(scores[category.id] || 0) * Number(category.weight || 0),
    0
  );

  return Number((weighted / totalWeight).toFixed(1));
}

export function ReviewPanel({
  libraryId,
  initialRating,
  initialReview,
  onRatingChange,
  onReviewChange,
}: ReviewPanelProps) {
  const confirmAction = useConfirm();
  const { handleError } = useLibraryAuth();
  const [mode, setMode] = useState<"simple" | "detailed">("simple");

  const [rating, setRating] = useState(
    initialRating !== null && initialRating !== undefined
      ? String(initialRating)
      : ""
  );

  // Último valor CONFIRMADO pelo servidor: é contra ele que se compara (o campo chama
  // saveRating no blur com o estado já atualizado) e para ele que se volta em caso de erro.
  const savedRating = useRef<number | null>(initialRating ?? null);
  const [review, setReview] = useState(initialReview || "");
  // Fase 5 (P2-10): ids para ligar os campos aos textos visíveis que já os descrevem.
  const fieldId = useId();

  const [categories, setCategories] = useState<Category[]>([]);
  const [scores, setScores] = useState<Record<string, number | "">>({});

  const [savingReview, setSavingReview] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);

  const [newCategory, setNewCategory] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);

  /*
   * Fase 6 (P2-11): tudo pelo cliente padrão (lib/api-client). A tela só
   * confirma o que o servidor confirmou — antes, nota, notas por categoria e
   * resenha pareciam salvas mesmo quando o PATCH falhava (401/500 ignorados).
   * Erro: 401 vira "Sua sessão expirou" (useLibraryAuth); o resto, aviso
   * amigável; mudança otimista é desfeita.
   */
  useEffect(() => {
    const controller = new AbortController();

    async function loadReviewData() {
      try {
        const [categoryData, scoreData] = await Promise.all([
          apiFetch<Category[]>("/api/reviews/categories", { cache: "no-store", signal: controller.signal }),
          apiFetch<Score[]>(`/api/reviews/scores?library_item_id=${encodeURIComponent(libraryId)}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        if (Array.isArray(categoryData)) setCategories(categoryData);

        if (Array.isArray(scoreData)) {
          const mapped: Record<string, number | ""> = {};
          scoreData.forEach((item: Score) => {
            mapped[item.category_id] = item.score === null ? "" : item.score;
          });
          setScores(mapped);
          if (scoreData.length > 0) setMode("detailed");
        }
      } catch (error) {
        // Fechar o painel / trocar de título aborta a leitura: não é erro.
        if (isAbortError(error)) return;
        console.error("[ReviewPanel] falha ao carregar avaliação detalhada:", error);
        handleError(error, undefined, "Não foi possível carregar sua avaliação detalhada");
      }
    }

    void loadReviewData();

    return () => controller.abort();
    // handleError muda só quando a sessão muda; recarregar por isso seria refazer a leitura à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId]);

  async function patchLibrary(patch: Record<string, unknown>) {
    return apiFetch(`/api/library/${libraryId}`, { method: "PATCH", json: patch });
  }

  async function saveRating(value: string) {
    const previousNumber = savedRating.current;
    const previous = previousNumber === null ? "" : String(previousNumber);
    let next: number | null = null;

    if (value !== "") {
      let number = Number(value);
      if (Number.isNaN(number)) return;
      if (number < 0) number = 0;
      if (number > 10) number = 10;
      next = Number(number.toFixed(1));
    }

    setRating(next === null ? "" : String(next));
    onRatingChange?.(next);

    if (!libraryId || next === previousNumber) return;

    try {
      await patchLibrary({ personal_rating: next });
      savedRating.current = next;
    } catch (error) {
      setRating(previous);
      onRatingChange?.(previousNumber);
      handleError(error, undefined, "Não foi possível salvar sua nota");
    }
  }

  async function saveScore(categoryId: string, value: number | "") {
    const previousScores = scores;
    const nextScores = { ...scores, [categoryId]: value };

    setScores(nextScores);

    if (value === "") return;

    try {
      await apiFetch("/api/reviews/scores", {
        method: "POST",
        json: { library_item_id: libraryId, category_id: categoryId, score: value },
      });
    } catch (error) {
      setScores(previousScores);
      handleError(error, undefined, "Não foi possível salvar a nota da categoria");
      return;
    }

    await syncPersonalRating(categories, nextScores);
  }

  async function saveReview() {
    setSavingReview(true);
    setReviewSaved(false);

    try {
      await patchLibrary({ review });
      onReviewChange?.(review);
      setReviewSaved(true);
      setTimeout(() => setReviewSaved(false), 2000);
    } catch (error) {
      // O texto continua no campo: nada se perde, dá para tentar de novo.
      handleError(error, undefined, "Não foi possível salvar sua opinião");
    } finally {
      setSavingReview(false);
    }
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;

    try {
      const data = await apiFetch<Category>("/api/reviews/categories", {
        method: "POST",
        json: { name, weight: categories.length === 0 ? 100 : 0, position: categories.length },
      });
      setCategories((current) => [...current, data]);
      setNewCategory("");
      setShowAddCategory(false);
    } catch (error) {
      handleError(error, undefined, "Não foi possível criar a categoria");
    }
  }

  async function removeCategory(id: string) {
    const confirmed = await confirmAction({
      title: "Remover categoria?",
      description: "A categoria e suas notas associadas serão removidas.",
      confirmLabel: "Remover categoria",
    });

    if (!confirmed) return;

    try {
      // Só some da tela depois que o servidor removeu.
      await apiFetch(`/api/reviews/categories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (error) {
      handleError(error, undefined, "Não foi possível remover a categoria");
      return;
    }

    const nextCategories = categories.filter((category) => category.id !== id);
    const nextScores = { ...scores };
    delete nextScores[id];

    setCategories(nextCategories);
    setScores(nextScores);

    await syncPersonalRating(nextCategories, nextScores);
  }

  const calculatedRating = useMemo(
    () => computeWeightedRating(categories, scores),
    [categories, scores]
  );

  /*
   * D1 — sincroniza a nota calculada do modo detalhado com
   * library_items.personal_rating (a ÚNICA nota pessoal canônica:
   * Ranking, Stats, badges, Pick for Me e Quick Peek leem esse campo,
   * não o cálculo local).
   */
  async function syncPersonalRating(nextCategories: Category[], nextScores: Record<string, number | "">) {
    const computed = computeWeightedRating(nextCategories, nextScores);
    if (computed === null || !libraryId) return;

    onRatingChange?.(computed);

    try {
      await patchLibrary({ personal_rating: computed });
      savedRating.current = computed;
    } catch (error) {
      handleError(error, undefined, "Não foi possível atualizar a nota calculada");
    }
  }

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
            <Star size={18} fill="currentColor" />
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
              aria-label="Sua nota, de 0 a 10"
              aria-describedby={`${fieldId}-rating-hint`}
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

          <div className="rating-hint" id={`${fieldId}-rating-hint`}>
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
                <Plus size={18} />
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
                            aria-label={`Remover categoria ${category.name}`}
                          >
                            <Trash2
                              size={16}
                            />
                          </button>

                        </div>

                        <div className="score-row">

                          <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.1"
                            aria-label={`Nota de ${category.name}, de 0 a 10`}
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
                <Plus size={18} />
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
                aria-label="Nome da nova categoria"
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
            <strong id={`${fieldId}-opinion`}>
              Minha opinião
            </strong>

            <span id={`${fieldId}-opinion-hint`}>
              O que você achou desse
              filme ou série?
            </span>
          </div>

        </div>

        <textarea
          value={review}
          maxLength={2000}
          aria-labelledby={`${fieldId}-opinion`}
          aria-describedby={`${fieldId}-opinion-hint`}
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
