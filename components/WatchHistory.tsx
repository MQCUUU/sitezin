"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useModal } from "@/hooks/useModal";

import {
  CalendarDays,
  Check,
  Clock3,
  Edit3,
  History,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";

type WatchEntry = {
  id:
    string;

  library_item_id:
    string;

  media_id:
    string;

  watched_at:
    string;

  rating:
    number |
    null;

  comment:
    string |
    null;

  is_rewatch:
    boolean;

  created_at:
    string;

  updated_at:
    string;
};

function toLocalInput(
  iso:
    string
) {
  const date =
    new Date(
      iso
    );

  const offset =
    date.getTimezoneOffset();

  const local =
    new Date(
      date.getTime() -
      offset *
        60 *
        1000
    );

  return local
    .toISOString()
    .slice(
      0,
      16
    );
}

function nowLocalInput() {
  return toLocalInput(
    new Date()
      .toISOString()
  );
}

function formatDate(
  value:
    string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",
    }
  ).format(
    new Date(
      value
    )
  );
}

function sameDayKey(
  value:
    string
) {
  const date =
    new Date(
      value
    );

  return [
    date.getFullYear(),

    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    ),

    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    ),
  ].join(
    "-"
  );
}

export function WatchHistory({
  libraryId,
  mediaType,
  currentRating,
  onLibraryItemChange,
}: {
  libraryId:
    string;

  mediaType:
    "movie" |
    "tv";

  currentRating?:
    number |
    null;

  onLibraryItemChange?:
    (
      item:
        any
    ) =>
      void;
}) {
  const [
    entries,
    setEntries,
  ] =
    useState<
      WatchEntry[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    formOpen,
    setFormOpen,
  ] =
    useState(false);

   const refFormulario = useModal(formOpen, () => setFormOpen(false));

  const [
    watchedAt,
    setWatchedAt,
  ] =
    useState(
      nowLocalInput()
    );

  const [
    rating,
    setRating,
  ] =
    useState(
      currentRating !==
        null &&
      currentRating !==
        undefined
        ? String(
            currentRating
          )
        : ""
    );

  const [
    comment,
    setComment,
  ] =
    useState("");

  const [
    editingId,
    setEditingId,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    editDate,
    setEditDate,
  ] =
    useState("");

  const [
    editRating,
    setEditRating,
  ] =
    useState("");

  const [
    editComment,
    setEditComment,
  ] =
    useState("");

  const [
    editRewatch,
    setEditRewatch,
  ] =
    useState(false);

  const [
    deleteId,
    setDeleteId,
  ] =
    useState<
      string |
      null
    >(null);

  async function load() {
    try {
      setLoading(
        true
      );

      setError(
        ""
      );

      const response =
        await fetch(
          `/api/watch-history?library_id=${encodeURIComponent(
            libraryId
          )}`,
          {
            cache:
              "no-store",
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
            "Não foi possível carregar o histórico."
        );
      }

      setEntries(
        Array.isArray(
          data
        )
          ? data
          : []
      );
    } catch (
      error
    ) {
      setError(
        error instanceof Error
          ? error.message
          : "Erro ao carregar histórico."
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  useEffect(() => {
    load();
  }, [
    libraryId,
  ]);

  const stats =
    useMemo(
      () => {
        const rated =
          entries.filter(
            (
              entry
            ) =>
              entry.rating !==
              null
          );

        const average =
          rated.length >
          0
            ? rated.reduce(
                (
                  total,
                  entry
                ) =>
                  total +
                  Number(
                    entry.rating ||
                      0
                  ),
                0
              ) /
              rated.length
            : null;

        return {
          total:
            entries.length,

          rewatches:
            entries.filter(
              (
                entry
              ) =>
                entry.is_rewatch
            ).length,

          average,

          first:
            entries.length >
              0
              ? entries[
                  entries.length -
                    1
                ]
              : null,

          last:
            entries[
              0
            ] ||
            null,
        };
      },
      [
        entries,
      ]
    );

  const groups =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            WatchEntry[]
          >();

        for (
          const entry
          of entries
        ) {
          const key =
            sameDayKey(
              entry.watched_at
            );

          map.set(
            key,
            [
              ...(map.get(
                key
              ) ||
                []),
              entry,
            ]
          );
        }

        return Array.from(
          map.entries()
        );
      },
      [
        entries,
      ]
    );

  function resetForm() {
    setWatchedAt(
      nowLocalInput()
    );

    setRating(
      currentRating !==
        null &&
      currentRating !==
        undefined
        ? String(
            currentRating
          )
        : ""
    );

    setComment(
      ""
    );
  }

  async function createEntry() {
    try {
      setSaving(
        true
      );

      setError(
        ""
      );

      const response =
        await fetch(
          "/api/watch-history",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                library_id:
                  libraryId,

                watched_at:
                  new Date(
                    watchedAt
                  ).toISOString(),

                rating:
                  rating ===
                  ""
                    ? null
                    : Number(
                        rating
                      ),

                comment,
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
            "Não foi possível registrar."
        );
      }

      setEntries(
        (
          current
        ) =>
          [
            data.entry,
            ...current,
          ].sort(
            (
              a,
              b
            ) =>
              new Date(
                b.watched_at
              ).getTime() -
              new Date(
                a.watched_at
              ).getTime()
          )
      );

      if (
        data.library_item &&
        onLibraryItemChange
      ) {
        onLibraryItemChange(
          data.library_item
        );
      }

      setFormOpen(
        false
      );

      resetForm();
    } catch (
      error
    ) {
      setError(
        error instanceof Error
          ? error.message
          : "Erro ao registrar visualização."
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  function beginEdit(
    entry:
      WatchEntry
  ) {
    setEditingId(
      entry.id
    );

    setEditDate(
      toLocalInput(
        entry.watched_at
      )
    );

    setEditRating(
      entry.rating !==
        null
        ? String(
            entry.rating
          )
        : ""
    );

    setEditComment(
      entry.comment ||
      ""
    );

    setEditRewatch(
      entry.is_rewatch
    );
  }

  async function saveEdit(
    id:
      string
  ) {
    try {
      setSaving(
        true
      );

      setError(
        ""
      );

      const response =
        await fetch(
          `/api/watch-history/${id}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                watched_at:
                  new Date(
                    editDate
                  ).toISOString(),

                rating:
                  editRating ===
                  ""
                    ? null
                    : Number(
                        editRating
                      ),

                comment:
                  editComment,

                is_rewatch:
                  editRewatch,
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
            "Não foi possível editar."
        );
      }

      setEntries(
        (
          current
        ) =>
          current
            .map(
              (
                entry
              ) =>
                entry.id ===
                id
                  ? data
                  : entry
            )
            .sort(
              (
                a,
                b
              ) =>
                new Date(
                  b.watched_at
                ).getTime() -
                new Date(
                  a.watched_at
                ).getTime()
            )
      );

      setEditingId(
        null
      );
    } catch (
      error
    ) {
      setError(
        error instanceof Error
          ? error.message
          : "Erro ao editar."
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  async function removeEntry(
    id:
      string
  ) {
    try {
      setSaving(
        true
      );

      const response =
        await fetch(
          `/api/watch-history/${id}`,
          {
            method:
              "DELETE",
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
            "Não foi possível excluir."
        );
      }

      setEntries(
        (
          current
        ) =>
          current.filter(
            (
              entry
            ) =>
              entry.id !==
              id
          )
      );

      setDeleteId(
        null
      );
    } catch (
      error
    ) {
      setError(
        error instanceof Error
          ? error.message
          : "Erro ao excluir visualização."
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  return (
    <section className="watch-history">
      <div className="watch-history-head">
        <div>
          <span className="eyebrow">
            SUA LINHA DO TEMPO
          </span>

          <h2>
            Histórico de visualizações
          </h2>

          <p className="muted">
            Cada vez que você assistir
            {mediaType ===
            "tv"
              ? " ou concluir a série"
              : ""}
            , registre aqui sem apagar as experiências anteriores.
          </p>
        </div>

        <button
          type="button"
          className="btn primary"
          onClick={() => {
            resetForm();

            setFormOpen(
              true
            );
          }}
        >
          <Plus
            size={16}
          />

          Registrar visualização
        </button>
      </div>

      {!loading &&
        entries.length >
          0 && (
        <div className="watch-history-stats">
          <div>
            <History
              size={17}
            />

            <strong>
              {
                stats.total
              }
            </strong>

            <span>
              {stats.total ===
              1
                ? "visualização"
                : "visualizações"}
            </span>
          </div>

          <div>
            <RefreshCcw
              size={17}
            />

            <strong>
              {
                stats.rewatches
              }
            </strong>

            <span>
              reassistidas
            </span>
          </div>

          <div>
            <Star
              size={17}
            />

            <strong>
              {stats.average !==
              null
                ? stats.average.toFixed(
                    1
                  )
                : "—"}
            </strong>

            <span>
              média das sessões
            </span>
          </div>

          <div>
            <CalendarDays
              size={17}
            />

            <strong>
              {stats.last
                ? new Intl.DateTimeFormat(
                    "pt-BR",
                    {
                      day:
                        "2-digit",
                      month:
                        "2-digit",
                      year:
                        "2-digit",
                    }
                  ).format(
                    new Date(
                      stats.last.watched_at
                    )
                  )
                : "—"}
            </strong>

            <span>
              última vez
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="watch-history-error">
          {
            error
          }
        </div>
      )}

      {loading ? (
        <div className="watch-history-empty">
          <Loader2
            size={22}
            className="spin"
          />

          Carregando seu histórico...
        </div>
      ) : entries.length ===
        0 ? (
        <div className="watch-history-empty">
          <History
            size={28}
          />

          <strong>
            Nenhuma visualização registrada ainda
          </strong>

          <span>
            O status Assistido continua funcionando normalmente. A partir de agora você pode guardar cada sessão individualmente.
          </span>
        </div>
      ) : (
        <div className="watch-history-timeline">
          {groups.map(
            (
              [
                day,
                dayEntries,
              ]
            ) => (
              <div
                key={
                  day
                }
                className="watch-history-day"
              >
                <div className="watch-history-day-marker">
                  <span />

                  <strong>
                    {new Intl.DateTimeFormat(
                      "pt-BR",
                      {
                        day:
                          "2-digit",

                        month:
                          "long",

                        year:
                          "numeric",
                      }
                    ).format(
                      new Date(
                        `${day}T12:00:00`
                      )
                    )}
                  </strong>
                </div>

                <div className="watch-history-day-list">
                  {dayEntries.map(
                    (
                      entry,
                      index
                    ) => (
                      <article
                        key={
                          entry.id
                        }
                        className="panel watch-entry"
                      >
                        {editingId ===
                        entry.id ? (
                          <div className="watch-entry-edit">
                            <div className="watch-entry-edit-grid">
                              <label>
                                <span>
                                  Data e hora
                                </span>

                                <input
                                  type="datetime-local"
                                  value={
                                    editDate
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditDate(
                                      event.target
                                        .value
                                    )
                                  }
                                />
                              </label>

                              <label>
                                <span>
                                  Nota da sessão
                                </span>

                                <select
                                  value={
                                    editRating
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditRating(
                                      event.target
                                        .value
                                    )
                                  }
                                >
                                  <option value="">
                                    Sem nota
                                  </option>

                                  {Array.from(
                                    {
                                      length:
                                        21,
                                    },
                                    (
                                      _,
                                      index
                                    ) =>
                                      index *
                                      .5
                                  ).map(
                                    (
                                      value
                                    ) => (
                                      <option
                                        key={
                                          value
                                        }
                                        value={
                                          value
                                        }
                                      >
                                        {value.toFixed(
                                          1
                                        )}
                                      </option>
                                    )
                                  )}
                                </select>
                              </label>
                            </div>

                            <label className="watch-entry-comment-field">
                              <span>
                                Comentário
                              </span>

                              <textarea
                                value={
                                  editComment
                                }
                                maxLength={
                                  4000
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditComment(
                                    event.target
                                      .value
                                  )
                                }
                              />
                            </label>

                            <label className="watch-entry-rewatch-check">
                              <input
                                type="checkbox"
                                checked={
                                  editRewatch
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditRewatch(
                                    event.target
                                      .checked
                                  )
                                }
                              />

                              <span>
                                Esta sessão foi uma reassistida
                              </span>
                            </label>

                            <div className="watch-entry-edit-actions">
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setEditingId(
                                    null
                                  )
                                }
                              >
                                <X
                                  size={14}
                                />
                                Cancelar
                              </button>

                              <button
                                type="button"
                                className="btn primary"
                                disabled={
                                  saving
                                }
                                onClick={() =>
                                  saveEdit(
                                    entry.id
                                  )
                                }
                              >
                                <Save
                                  size={14}
                                />
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="watch-entry-index">
                              {entry.is_rewatch
                                ? `Reassistida #${Math.max(
                                    1,
                                    entries
                                      .slice(
                                        index +
                                          1
                                      )
                                      .filter(
                                        (
                                          item
                                        ) =>
                                          item.is_rewatch
                                      ).length +
                                      1
                                  )}`
                                : "Primeira visualização"}
                            </div>

                            <div className="watch-entry-main">
                              <div className="watch-entry-time">
                                <Clock3
                                  size={14}
                                />

                                {formatDate(
                                  entry.watched_at
                                )}
                              </div>

                              {entry.rating !==
                                null && (
                                <div className="watch-entry-rating">
                                  <Star
                                    size={14}
                                    fill="currentColor"
                                  />

                                  {Number(
                                    entry.rating
                                  ).toFixed(
                                    1
                                  )}
                                </div>
                              )}
                            </div>

                            {entry.comment && (
                              <p className="watch-entry-comment">
                                {
                                  entry.comment
                                }
                              </p>
                            )}

                            <div className="watch-entry-actions">
                              <button
                                type="button"
                                title="Editar visualização"
                                onClick={() =>
                                  beginEdit(
                                    entry
                                  )
                                }
                              >
                                <Edit3
                                  size={14}
                                />
                              </button>

                              <button
                                type="button"
                                className="danger"
                                title="Excluir visualização"
                                onClick={() =>
                                  setDeleteId(
                                    entry.id
                                  )
                                }
                              >
                                <Trash2
                                  size={14}
                                />
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    )
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {formOpen && (
        <div
          className="watch-register-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setFormOpen(
                false
              );
            }
          }}
        >
          <div
  ref={refFormulario as React.RefObject<HTMLDivElement>}
  className="watch-register-modal"
  role="dialog"
  aria-modal="true"
>
            <button
              type="button"
              className="watch-register-close"
              onClick={() =>
                setFormOpen(
                  false
                )
              }
            >
              <X
                size={17}
              />
            </button>

            <div className="watch-register-icon">
              <Check
                size={20}
              />
            </div>

            <div>
              <span className="eyebrow">
                NOVA VISUALIZAÇÃO
              </span>

              <h3>
                Registrar que assisti
              </h3>

              <p className="muted">
                A partir da segunda entrada, o MyCatalog marca automaticamente como reassistida.
              </p>
            </div>

            <div className="watch-register-grid">
              <label>
                <span>
                  Data e hora
                </span>

                <input
                  type="datetime-local"
                  value={
                    watchedAt
                  }
                  onChange={(
                    event
                  ) =>
                    setWatchedAt(
                      event.target
                        .value
                    )
                  }
                />
              </label>

              <label>
                <span>
                  Nota desta sessão
                </span>

                <select
                  value={
                    rating
                  }
                  onChange={(
                    event
                  ) =>
                    setRating(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Sem nota
                  </option>

                  {Array.from(
                    {
                      length:
                        21,
                    },
                    (
                      _,
                      index
                    ) =>
                      index *
                      .5
                  ).map(
                    (
                      value
                    ) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {value.toFixed(
                          1
                        )}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>

            <label className="watch-register-comment">
              <span>
                Comentário desta vez
              </span>

              <textarea
                value={
                  comment
                }
                maxLength={
                  4000
                }
                placeholder="Opcional. Ex.: gostei mais na segunda vez, vi com amigos, final funcionou melhor..."
                onChange={(
                  event
                ) =>
                  setComment(
                    event.target
                      .value
                  )
                }
              />

              <small>
                {
                  comment.length
                }/4000
              </small>
            </label>

            <div className="watch-register-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setFormOpen(
                    false
                  )
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn primary"
                disabled={
                  saving ||
                  !watchedAt
                }
                onClick={
                  createEntry
                }
              >
                {saving ? (
                  <Loader2
                    size={15}
                    className="spin"
                  />
                ) : (
                  <Check
                    size={15}
                  />
                )}

                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div
          className="mycatalog-confirm-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setDeleteId(
                null
              );
            }
          }}
        >
          <div className="mycatalog-confirm-modal">
            <div className="mycatalog-confirm-icon danger">
              <Trash2
                size={20}
              />
            </div>

            <div>
              <span className="eyebrow">
                EXCLUIR VISUALIZAÇÃO
              </span>

              <h3>
                Remover esta entrada do histórico?
              </h3>

              <p className="muted">
                Só esta sessão será apagada. O título continua na biblioteca.
              </p>
            </div>

            <div className="mycatalog-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setDeleteId(
                    null
                  )
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn danger"
                disabled={
                  saving
                }
                onClick={() =>
                  removeEntry(
                    deleteId
                  )
                }
              >
                <Trash2
                  size={14}
                />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}