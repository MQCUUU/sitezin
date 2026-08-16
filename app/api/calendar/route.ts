import { NextRequest, NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";

import { createClient } from "@/lib/supabase/server";

import {
  calendarTMDB,
  upcomingDiscoveriesTMDB,
  type CalendarTMDBItem,
  type CalendarDiscoveryItem,
} from "@/lib/tmdb";

type LibraryCalendarEvent =
  CalendarTMDBItem & {
    source: "library";

    in_library: true;

    library_item_id: string;

    library_status: string;

    current_season:
      number | null;

    completed_seasons:
      number;

    stopped_season:
      number | null;
  };

type DiscoveryCalendarEvent =
  CalendarDiscoveryItem & {
    source: "discovery";

    in_library: boolean;

    library_item_id:
      string | null;

    library_status:
      string | null;

    current_season:
      number | null;

    completed_seasons:
      number;

    stopped_season:
      number | null;
  };

type CalendarResponse = {
  library:
    LibraryCalendarEvent[];

  discoveries:
    DiscoveryCalendarEvent[];

  all:
    (
      | LibraryCalendarEvent
      | DiscoveryCalendarEvent
    )[];
};

export async function GET(req: NextRequest) {
  const s =
    await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Não autenticado",
      },
      {
        status: 401,
      }
    );
  }

  /*
   * ==========================================
   * ESCOPO DA CONSULTA
   * ==========================================
   *
   * /api/calendar
   *   -> calendário completo
   *
   * /api/calendar?scope=library
   *   -> somente eventos da biblioteca
   *
   * A Home pode usar scope=library e evitar
   * as consultas de descobertas gerais.
   */

  const url =
    new URL(req.url);

  const scope =
    url.searchParams.get(
      "scope"
    ) === "library"
      ? "library"
      : "all";

  /*
   * ==========================================
   * BUSCAR BIBLIOTECA
   * ==========================================
   */

  const {
    data: library,
    error,
  } = await s
    .from("library_items")
    .select(`
      id,
      status,
      current_season,
      completed_seasons,
      stopped_season,

      media:media_id(
        id,
        tmdb_id,
        media_type,
        title
      )
    `)
    .eq(
      "user_id",
      user.id
    );

  if (error) {
  return respostaDeErro(
    error,
    "GET /api/calendar",
  );
}

  const items =
    Array.isArray(
      library
    )
      ? library
      : [];

  /*
   * ==========================================
   * MAPA DA BIBLIOTECA
   * ==========================================
   *
   * Isso serve para marcar descobertas
   * que já estão na biblioteca.
   */

  const libraryMap =
    new Map<
      string,
      any
    >();

  for (
    const item
    of items as any[]
  ) {
    const media =
      item.media;

    if (
      !media?.tmdb_id ||
      !media?.media_type
    ) {
      continue;
    }

    const key =
      `${media.media_type}-${media.tmdb_id}`;

    libraryMap.set(
      key,
      item
    );
  }

  /*
   * ==========================================
   * EVENTOS DA BIBLIOTECA
   * ==========================================
   */

  const eligible =
    items.filter(
      (item: any) => {
        const media =
          item.media;

        if (
          !media?.tmdb_id ||
          !media?.media_type
        ) {
          return false;
        }

        /*
         * Abandonados ficam fora
         * do calendário pessoal.
         */

        if (
          item.status ===
          "dropped"
        ) {
          return false;
        }

        return (
          media.media_type ===
            "movie" ||
          media.media_type ===
            "tv"
        );
      }
    );

  /*
   * ==========================================
   * BUSCAR TMDB EM PARALELO
   * ==========================================
   */

  const libraryPromise =
    Promise.allSettled(
      eligible.map(
        async (
          item: any
        ) => {
          const media =
            item.media;

          const events =
            await calendarTMDB(
              media.media_type,
              media.tmdb_id
            );

          return events.map(
            (
              event
            ): LibraryCalendarEvent => ({
              ...event,

              source:
                "library",

              in_library:
                true,

              library_item_id:
                item.id,

              library_status:
                item.status,

              current_season:
                item.current_season ??
                null,

              completed_seasons:
                Number(
                  item.completed_seasons ||
                    0
                ),

              stopped_season:
                item.stopped_season ??
                null,
            })
          );
        }
      )
    );

  /*
   * Só buscamos descobertas gerais quando
   * a página realmente precisa delas.
   */

  const discoveryPromise =
    scope === "all"
      ? upcomingDiscoveriesTMDB(
          120
        )
      : Promise.resolve([]);

  const [
    libraryResults,
    discoveryResult,
  ] =
    await Promise.all([
      libraryPromise,
      discoveryPromise,
    ]);

  /*
   * ==========================================
   * JUNTAR EVENTOS DA BIBLIOTECA
   * ==========================================
   */

  const libraryEvents:
    LibraryCalendarEvent[] =
    [];

  for (
    const result
    of libraryResults
  ) {
    if (
      result.status ===
      "fulfilled"
    ) {
      libraryEvents.push(
        ...result.value
      );
    } else {
      console.error(
        "Erro ao buscar calendário da biblioteca:",
        result.reason
      );
    }
  }

  /*
   * ==========================================
   * FILTRAR DATAS PASSADAS
   * ==========================================
   */

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  function isUpcoming(
    date:
      | string
      | null
  ) {
    if (!date) {
      return false;
    }

    const parsed =
      new Date(
        `${date}T00:00:00`
      );

    return (
      parsed.getTime() >=
      today.getTime()
    );
  }

  /*
   * ==========================================
   * LIMPAR EVENTOS DA BIBLIOTECA
   * ==========================================
   */

  const filteredLibrary =
    libraryEvents.filter(
      (
        event
      ) => {
        if (
          !isUpcoming(
            event.date
          )
        ) {
          return false;
        }

        /*
         * Se o episódio pertence
         * a uma temporada anterior
         * à atual, não mostramos.
         */

        if (
          event.media_type ===
            "tv" &&
          event.event_type ===
            "episode" &&
          event.season_number !==
            null &&
          event.current_season !==
            null &&
          event.season_number <
            event.current_season
        ) {
          return false;
        }

        return true;
      }
    );

  /*
   * ==========================================
   * REMOVER DUPLICADOS DA BIBLIOTECA
   * ==========================================
   */

  const librarySeen =
    new Set<string>();

  const uniqueLibrary =
    filteredLibrary.filter(
      (
        event
      ) => {
        const key = [
          event.media_type,
          event.tmdb_id,
          event.event_type,
          event.date,
          event.season_number ??
            "",
          event.episode_number ??
            "",
        ].join("-");

        if (
          librarySeen.has(
            key
          )
        ) {
          return false;
        }

        librarySeen.add(
          key
        );

        return true;
      }
    );

  /*
   * ==========================================
   * DESCOBERTAS
   * ==========================================
   */

  const discoveries:
    DiscoveryCalendarEvent[] =
    discoveryResult
      .filter(
        (
          event
        ) =>
          isUpcoming(
            event.date
          )
      )
      .map(
        (
          event
        ) => {
          const key =
            `${event.media_type}-${event.tmdb_id}`;

          const libraryItem =
            libraryMap.get(
              key
            );

          return {
            ...event,

            source:
              "discovery",

            in_library:
              !!libraryItem,

            library_item_id:
              libraryItem?.id ??
              null,

            library_status:
              libraryItem?.status ??
              null,

            current_season:
              libraryItem
                ?.current_season ??
              null,

            completed_seasons:
              Number(
                libraryItem
                  ?.completed_seasons ||
                  0
              ),

            stopped_season:
              libraryItem
                ?.stopped_season ??
              null,
          };
        }
      );

  /*
   * ==========================================
   * REMOVER DESCOBERTAS DUPLICADAS
   * ==========================================
   */

  const discoverySeen =
    new Set<string>();

  const uniqueDiscoveries =
    discoveries.filter(
      (
        event
      ) => {
        const key =
          `${event.media_type}-${event.tmdb_id}`;

        if (
          discoverySeen.has(
            key
          )
        ) {
          return false;
        }

        discoverySeen.add(
          key
        );

        return true;
      }
    );

  /*
   * ==========================================
   * ORDENAR
   * ==========================================
   */

  function sortByDate(
    a: {
      date:
        | string
        | null;
    },
    b: {
      date:
        | string
        | null;
    }
  ) {
    if (
      !a.date &&
      !b.date
    ) {
      return 0;
    }

    if (!a.date) {
      return 1;
    }

    if (!b.date) {
      return -1;
    }

    return (
      new Date(
        `${a.date}T00:00:00`
      ).getTime() -
      new Date(
        `${b.date}T00:00:00`
      ).getTime()
    );
  }

  uniqueLibrary.sort(
    sortByDate
  );

  /*
   * ==========================================
   * RESPOSTA LEVE PARA A HOME
   * ==========================================
   */

  if (
    scope === "library"
  ) {
    return NextResponse.json(
      {
        library:
          uniqueLibrary,

        discoveries:
          [],

        all:
          uniqueLibrary,
      } satisfies CalendarResponse,
      {
        headers: {
          /*
           * Dados pessoais: cache privado
           * e curto no navegador.
           */
          "Cache-Control":
            "private, max-age=30",
        },
      }
    );
  }

  uniqueDiscoveries.sort(
    (
      a,
      b
    ) => {
      const difference =
        sortByDate(
          a,
          b
        );

      if (
        difference !== 0
      ) {
        return difference;
      }

      return (
        b.popularity -
        a.popularity
      );
    }
  );

  /*
   * ==========================================
   * JUNTAR TODOS
   * ==========================================
   */

  const all =
    [
      ...uniqueLibrary,
      ...uniqueDiscoveries,
    ].sort(
      sortByDate
    );

  /*
   * ==========================================
   * RETORNO
   * ==========================================
   */

  const response:
    CalendarResponse =
    {
      library:
        uniqueLibrary,

      discoveries:
        uniqueDiscoveries,

      all,
    };

  return NextResponse.json(
    response,
    {
      headers: {
        /*
         * A resposta contém dados pessoais da
         * biblioteca, então nunca usamos cache
         * público/compartilhado.
         */
        "Cache-Control":
          "private, max-age=30",
      },
    }
  );
}