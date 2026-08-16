"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Flag,
  PlayCircle,
  Trophy,
} from "lucide-react";

type SeasonProgressProps = {
  libraryItem: any;
  totalSeasons: number;
  onChange?: (item: any) => void;
};

export function SeasonProgress({
  libraryItem,
  totalSeasons,
  onChange,
}: SeasonProgressProps) {
  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  /*
   * Evita tentar corrigir dados antigos
   * várias vezes durante o mesmo render.
   */
  const syncedWatched =
    useRef(false);

  /*
   * ==========================================
   * TOTAL DE TEMPORADAS
   * ==========================================
   */

  const safeTotalSeasons =
    Math.max(
      Number(totalSeasons || 0),
      0
    );

  /*
   * ==========================================
   * STATUS
   * ==========================================
   */

  const isWatched =
    libraryItem?.status ===
    "watched";

  const isDropped =
    libraryItem?.status ===
    "dropped";

  /*
   * ==========================================
   * TEMPORADAS CONCLUÍDAS
   * ==========================================
   *
   * IMPORTANTE:
   *
   * Séries antigas podem estar:
   *
   * status = watched
   * completed_seasons = 0
   *
   * Nesse caso consideramos automaticamente
   * todas as temporadas como concluídas.
   */

  const databaseCompleted =
    Math.max(
      Number(
        libraryItem
          ?.completed_seasons || 0
      ),
      0
    );

  const completed =
    isWatched &&
    safeTotalSeasons > 0
      ? safeTotalSeasons
      : Math.min(
          databaseCompleted,
          safeTotalSeasons ||
            databaseCompleted
        );

  /*
   * ==========================================
   * TEMPORADA ATUAL
   * ==========================================
   */

  const defaultCurrent =
    isWatched &&
    safeTotalSeasons > 0
      ? safeTotalSeasons
      : completed <
        safeTotalSeasons
      ? completed + 1
      : Math.max(
          safeTotalSeasons,
          1
        );

  const current =
    isWatched &&
    safeTotalSeasons > 0
      ? safeTotalSeasons
      : Math.min(
          Math.max(
            Number(
              libraryItem
                ?.current_season ||
                defaultCurrent
            ),
            1
          ),
          Math.max(
            safeTotalSeasons,
            1
          )
        );

  /*
   * ==========================================
   * PROGRESSO %
   * ==========================================
   */

  const progress =
    useMemo(() => {
      if (
        safeTotalSeasons <= 0
      ) {
        return 0;
      }

      /*
       * Assistido sempre = 100%
       */

      if (isWatched) {
        return 100;
      }

      return Math.min(
        100,
        Math.round(
          (
            completed /
            safeTotalSeasons
          ) * 100
        )
      );
    }, [
      completed,
      safeTotalSeasons,
      isWatched,
    ]);

  /*
   * ==========================================
   * PATCH
   * ==========================================
   */

  async function patch(
    values: Record<
      string,
      any
    >
  ) {
    if (
      !libraryItem?.id ||
      saving
    ) {
      return null;
    }

    setSaving(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/library/${libraryItem.id}`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                values
              ),
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
            "Erro ao salvar progresso."
        );
      }

      onChange?.(
        data
      );

      return data;
    } catch (err) {
      console.error(
        "Erro ao atualizar temporada:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar o progresso."
      );

      return null;
    } finally {
      setSaving(
        false
      );
    }
  }

  /*
   * ==========================================
   * CORRIGIR SÉRIES ANTIGAS
   * ==========================================
   *
   * Se uma série já estava como Assistido
   * antes de criarmos completed_seasons,
   * sincronizamos automaticamente:
   *
   * completed_seasons = total
   * current_season = última
   *
   * Isso acontece uma única vez.
   */

  useEffect(() => {
    if (
      syncedWatched.current
    ) {
      return;
    }

    if (
      !libraryItem?.id ||
      !isWatched ||
      safeTotalSeasons <= 0
    ) {
      return;
    }

    const alreadyCorrect =
      databaseCompleted ===
        safeTotalSeasons &&
      Number(
        libraryItem
          ?.current_season || 0
      ) ===
        safeTotalSeasons;

    if (
      alreadyCorrect
    ) {
      syncedWatched.current =
        true;

      return;
    }

    syncedWatched.current =
      true;

    /*
     * Fazemos a requisição aqui diretamente
     * para não depender do estado saving
     * durante o mount.
     */

    async function syncWatchedSeries() {
      try {
        const response =
          await fetch(
            `/api/library/${libraryItem.id}`,
            {
              method:
                "PATCH",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  {
                    completed_seasons:
                      safeTotalSeasons,

                    current_season:
                      safeTotalSeasons,
                  }
                ),
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
              "Erro ao sincronizar série concluída."
          );
        }

        onChange?.(
          data
        );
      } catch (err) {
        console.error(
          "Erro ao sincronizar série antiga:",
          err
        );
      }
    }

    syncWatchedSeries();
  }, [
    libraryItem?.id,
    libraryItem?.current_season,
    databaseCompleted,
    safeTotalSeasons,
    isWatched,
    onChange,
  ]);

  /*
   * ==========================================
   * MUDAR TEMPORADA ATUAL
   * ==========================================
   *
   * Se escolher T6:
   *
   * concluídas = 5
   *
   * Se voltar para T5:
   *
   * concluídas = 4
   *
   * Assim você consegue corrigir erros.
   */

  async function changeCurrentSeason(
    season: number
  ) {
    const safeSeason =
      Math.min(
        Math.max(
          season,
          1
        ),
        Math.max(
          safeTotalSeasons,
          1
        )
      );

    const impliedCompleted =
      Math.max(
        0,
        safeSeason - 1
      );

    const values: Record<
      string,
      any
    > = {
      current_season:
        safeSeason,

      completed_seasons:
        Math.min(
          impliedCompleted,
          safeTotalSeasons
        ),
    };

    /*
     * Se estiver abandonada,
     * corrige também onde parou.
     */

    if (
      isDropped
    ) {
      values.stopped_season =
        safeSeason;
    }

    /*
     * Se estava marcada como Assistido
     * e o usuário diminui o progresso,
     * ela volta para Assistindo.
     */

    if (
      isWatched &&
      impliedCompleted <
        safeTotalSeasons
    ) {
      values.status =
        "watching";
    }

    await patch(
      values
    );
  }

  /*
   * ==========================================
   * CONCLUIR TEMPORADA
   * ==========================================
   */

  async function completeCurrentSeason() {
    if (
      safeTotalSeasons <= 0
    ) {
      return;
    }

    const seasonToComplete =
      current;

    const newCompleted =
      Math.max(
        completed,
        seasonToComplete
      );

    const nextSeason =
      Math.min(
        seasonToComplete + 1,
        safeTotalSeasons
      );

    const finishedSeries =
      newCompleted >=
      safeTotalSeasons;

    const values: Record<
      string,
      any
    > = {
      completed_seasons:
        newCompleted,

      current_season:
        nextSeason,
    };

    /*
     * Terminou a última temporada.
     */

    if (
      finishedSeries
    ) {
      values.status =
        "watched";
    }

    await patch(
      values
    );
  }

  /*
   * ==========================================
   * FINALIZADA
   * ==========================================
   */

  const finished =
    safeTotalSeasons > 0 &&
    (
      isWatched ||
      completed >=
        safeTotalSeasons
    );

  /*
   * ==========================================
   * ONDE PAROU
   * ==========================================
   */

  const stoppedSeason =
    Number(
      libraryItem
        ?.stopped_season ||
        current
    );

  /*
   * ==========================================
   * SEM TOTAL DE TEMPORADAS
   * ==========================================
   */

  if (
    safeTotalSeasons <= 0
  ) {
    return (
      <div className="season-progress-card">

        <div className="season-progress-head">

          <div>

            <span>
              Progresso da série
            </span>

            <strong>
              Número de temporadas
              indisponível
            </strong>

          </div>

        </div>

      </div>
    );
  }

  /*
   * ==========================================
   * INTERFACE
   * ==========================================
   */

  return (
    <div className="season-progress-card">

      {/* CABEÇALHO */}

      <div className="season-progress-head">

        <div>

          <span>
            Progresso da série
          </span>

          <strong>
            {completed} de{" "}
            {safeTotalSeasons}{" "}
            {safeTotalSeasons === 1
              ? "temporada concluída"
              : "temporadas concluídas"}
          </strong>

        </div>

        <b>
          {progress}%
        </b>

      </div>

      {/* BARRA */}

      <div className="season-progress-bar">

        <span
          style={{
            width:
              `${progress}%`,
          }}
        />

      </div>

      {/* TEMPORADA ATUAL */}

      <label className="season-field">

        <span>

          <PlayCircle
            size={15}
          />

          Temporada atual

        </span>

        <select
          value={current}
          disabled={saving}
          onChange={(event) =>
            changeCurrentSeason(
              Number(
                event.target
                  .value
              )
            )
          }
        >

          {Array.from(
            {
              length:
                safeTotalSeasons,
            },
            (_, index) =>
              index + 1
          ).map(
            (season) => (
              <option
                key={season}
                value={season}
              >
                Temporada{" "}
                {season}
              </option>
            )
          )}

        </select>

      </label>

      {/* ABANDONADA */}

      {isDropped && (
        <div className="season-stopped">

          <Flag
            size={15}
          />

          <span>
            Você parou na{" "}
            <strong>
              temporada{" "}
              {stoppedSeason}
            </strong>
            .
          </span>

        </div>
      )}

      {/* CONCLUIR */}

      {!finished &&
        !isDropped && (
        <button
          type="button"
          className="btn primary season-complete-btn"
          disabled={saving}
          onClick={
            completeCurrentSeason
          }
        >

          <CheckCircle2
            size={16}
          />

          {saving
            ? "Salvando..."
            : `Concluir temporada ${current}`}

        </button>
      )}

      {/* FINALIZADA */}

      {finished && (
        <div className="season-finished">

          <Trophy
            size={17}
          />

          <div>

            <strong>
              Série concluída
            </strong>

            <span>
              Você terminou todas
              as{" "}
              {safeTotalSeasons}{" "}
              temporadas.
            </span>

          </div>

        </div>
      )}

      {/* ERRO */}

      {error && (
        <div className="season-progress-error">
          {error}
        </div>
      )}

    </div>
  );
}