const BASE =
  "https://api.themoviedb.org/3";

/*
 * ==========================================
 * CONFIGURAÇÃO
 * ==========================================
 */

function getLanguage() {
  return (
    process.env.TMDB_LANGUAGE ||
    "pt-BR"
  );
}

/*
 * ==========================================
 * IMAGENS
 * ==========================================
 */

export const img = (
  path?: string | null,
  size = "w500"
) => {
  return path
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : "/placeholder.svg";
};

/*
 * ==========================================
 * REQUEST BASE TMDB
 * ==========================================
 */

/*
 * ==========================================
 * CACHE / PERFORMANCE
 * ==========================================
 *
 * Centralizamos TODAS as chamadas ao TMDB aqui.
 *
 * - cache persistente do Next via revalidate;
 * - deduplicação de chamadas idênticas em andamento;
 * - timeout;
 * - retry curto somente para 429/5xx;
 * - tags para invalidação futura;
 * - erros do TMDB não vazam uma página HTML.
 */

type TMDBOptions = {
  revalidate?: number;
  tags?: string[];
  timeout?: number;
  retries?: number;
};

const TMDB_CACHE = {
  SEARCH: 60 * 15,          // 15 min
  DISCOVER: 60 * 30,       // 30 min
  DETAILS: 60 * 60 * 24,   // 24 h
  SEASON: 60 * 60 * 6,     // 6 h
  RELEASES: 60 * 60 * 6,   // 6 h
  GENRES: 60 * 60 * 24 * 7,// 7 dias
  PROVIDERS: 60 * 60 * 24, // 24 h
  CALENDAR: 60 * 60 * 6,   // 6 h
} as const;

/*
 * Evita duas partes da MESMA instância do servidor
 * dispararem exatamente a mesma request ao mesmo tempo.
 *
 * O cache persistente do Next cuida de requests futuras;
 * esse Map cuida do "mesmo milissegundo".
 */
const inFlight =
  new Map<
    string,
    Promise<any>
  >();

function sleep(
  ms: number
) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function safeTag(
  path: string
) {
  /*
   * Não colocamos api_key na tag.
   * Mantemos a tag curta e determinística.
   */
  const clean =
    path
      .replace(
        /[^a-zA-Z0-9/_?-]/g,
        "_"
      )
      .slice(
        0,
        180
      );

  return `tmdb:${clean}`;
}

function retryableTMDBStatus(
  status: number
) {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

async function tmdb(
  path: string,
  options: TMDBOptions = {}
) {
  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    throw new Error(
      "TMDB_API_KEY não configurada"
    );
  }

  const separator =
    path.includes("?")
      ? "&"
      : "?";

  const url =
    `${BASE}${path}${separator}api_key=${encodeURIComponent(
      apiKey
    )}`;

  const revalidate =
    options.revalidate ??
    TMDB_CACHE.DETAILS;

  const timeout =
    options.timeout ??
    12000;

  const retries =
    options.retries ??
    1;

  /*
   * A chave inclui URL sem expor nada ao usuário.
   * O Map é apenas memória do processo.
   */
  const requestKey =
    `${path}|${revalidate}`;

  const existing =
    inFlight.get(
      requestKey
    );

  if (existing) {
    return existing;
  }

  const task =
    (async () => {
      let attempt =
        0;

      while (true) {
        const controller =
          new AbortController();

        const timer =
          setTimeout(
            () =>
              controller.abort(),
            timeout
          );

        try {
          const response =
            await fetch(
              url,
              {
                headers: {
                  accept:
                    "application/json",
                },

                signal:
                  controller.signal,

                next: {
                  revalidate,

                  tags:
                    options.tags?.length
                      ? options.tags
                      : [
                          safeTag(
                            path
                          ),
                        ],
                },
              }
            );

          if (!response.ok) {
            const body =
              await response
                .text()
                .catch(
                  () => ""
                );

            if (
              retryableTMDBStatus(
                response.status
              ) &&
              attempt <
                retries
            ) {
              attempt++;

              /*
               * Se o TMDB mandar Retry-After, respeitamos.
               * Caso contrário, backoff curto.
               */
              const retryAfter =
                Number(
                  response.headers.get(
                    "retry-after"
                  ) ||
                    0
                );

              await sleep(
                retryAfter > 0
                  ? retryAfter *
                      1000
                  : 350 *
                      attempt
              );

              continue;
            }

            throw new Error(
              `TMDB ${response.status}${
                body
                  ? `: ${body.slice(
                      0,
                      300
                    )}`
                  : ""
              }`
            );
          }

          const contentType =
            response.headers.get(
              "content-type"
            ) || "";

          if (
            !contentType.includes(
              "application/json"
            )
          ) {
            throw new Error(
              "TMDB retornou uma resposta inválida."
            );
          }

          return await response.json();
        } catch (error) {
          const timeoutError =
            error instanceof
              DOMException &&
            error.name ===
              "AbortError";

          if (
            timeoutError &&
            attempt <
              retries
          ) {
            attempt++;

            await sleep(
              250 *
                attempt
            );

            continue;
          }

          if (timeoutError) {
            throw new Error(
              "TMDB demorou demais para responder."
            );
          }

          throw error;
        } finally {
          clearTimeout(
            timer
          );
        }
      }
    })();

  inFlight.set(
    requestKey,
    task
  );

  try {
    return await task;
  } finally {
    /*
     * O resultado continua no Data Cache do Next.
     * Só removemos a Promise do Map de requests ativas.
     */
    inFlight.delete(
      requestKey
    );
  }
}

/*
 * ==========================================
 * BUSCA
 * ==========================================
 */

export async function searchTMDB(
  q: string
) {
  return tmdb(
    `/search/multi?query=${encodeURIComponent(
      q
    )}&include_adult=false&language=${getLanguage()}`,
    {
      revalidate:
        TMDB_CACHE.SEARCH,
    }
  );
}

/*
 * ==========================================
 * DETALHES
 * ==========================================
 */

export async function detailsTMDB(
  type: "movie" | "tv",
  id: number | string
) {
  return tmdb(
    `/${type}/${id}?language=${getLanguage()}&append_to_response=credits,videos,images`,
    {
      revalidate:
        TMDB_CACHE.DETAILS,

      tags: [
        `tmdb:${type}:${id}`,
      ],
    }
  );
}


/*
 * ==========================================
 * DETALHES LEVES
 * ==========================================
 *
 * Calendar/Home não precisam de credits, videos
 * e images. Usar detailsTMDB() nesses loops podia
 * multiplicar bastante o payload sem necessidade.
 */
async function lightweightDetailsTMDB(
  type: "movie" | "tv",
  id: number | string
) {
  return tmdb(
    `/${type}/${id}?language=${getLanguage()}`,
    {
      revalidate:
        TMDB_CACHE.CALENDAR,

      tags: [
        `tmdb:${type}:${id}`,
      ],
    }
  );
}

/*
 * ==========================================
 * DETALHES DE TEMPORADA
 * ==========================================
 */

export async function seasonTMDB(
  tvId: number | string,
  seasonNumber: number
) {
  return tmdb(
    `/tv/${tvId}/season/${seasonNumber}?language=${getLanguage()}`,
    {
      revalidate:
        TMDB_CACHE.SEASON,

      tags: [
        `tmdb:tv:${tvId}`,
        `tmdb:tv:${tvId}:season:${seasonNumber}`,
      ],
    }
  );
}

/*
 * ==========================================
 * DATAS DE LANÇAMENTO DE FILME
 * ==========================================
 */

export async function movieReleaseDatesTMDB(
  movieId: number | string
) {
  return tmdb(
    `/movie/${movieId}/release_dates`,
    {
      revalidate:
        TMDB_CACHE.RELEASES,

      tags: [
        `tmdb:movie:${movieId}`,
        `tmdb:movie:${movieId}:release-dates`,
      ],
    }
  );
}

/*
 * ==========================================
 * TIPOS DO CALENDÁRIO
 * ==========================================
 */

export type CalendarTMDBItem = {
  tmdb_id: number;

  media_type:
    | "movie"
    | "tv";

  title: string;

  poster_path:
    string | null;

  backdrop_path:
    string | null;

  date:
    string | null;

  event_type:
    | "movie_release"
    | "episode"
    | "season";

  /*
   * SÉRIE
   */

  season_number:
    number | null;

  episode_number:
    number | null;

  episode_name:
    string | null;

  /*
   * FILME
   */

  release_type:
    number | null;

  release_label:
    string | null;

  /*
   * OUTROS
   */

  status:
    string | null;

  overview:
    string | null;
};

/*
 * ==========================================
 * TIPOS DE LANÇAMENTO TMDB
 * ==========================================
 *
 * 1 = Premiere
 * 2 = Cinema limitado
 * 3 = Cinema
 * 4 = Digital
 * 5 = Físico
 * 6 = TV
 */

function releaseTypeLabel(
  type: number
) {
  switch (type) {
    case 1:
      return "Estreia";

    case 2:
      return "Cinema limitado";

    case 3:
      return "Cinema";

    case 4:
      return "Digital";

    case 5:
      return "Mídia física";

    case 6:
      return "TV";

    default:
      return "Lançamento";
  }
}

/*
 * ==========================================
 * DATA DO BRASIL
 * ==========================================
 */

function findBrazilRelease(
  releaseDates: any
) {
  const results =
    Array.isArray(
      releaseDates?.results
    )
      ? releaseDates.results
      : [];

  /*
   * Primeiro procuramos BR.
   */

  let country =
    results.find(
      (item: any) =>
        item.iso_3166_1 ===
        "BR"
    );

  /*
   * Se não existir data brasileira,
   * usamos US como fallback.
   */

  if (!country) {
    country =
      results.find(
        (item: any) =>
          item.iso_3166_1 ===
          "US"
      );
  }

  if (
    !country ||
    !Array.isArray(
      country.release_dates
    )
  ) {
    return null;
  }

  /*
   * Ordem de preferência:
   *
   * Digital
   * Cinema
   * Cinema limitado
   * Premiere
   * Físico
   * TV
   */

  const preference = [
    4,
    3,
    2,
    1,
    5,
    6,
  ];

  for (
    const type
    of preference
  ) {
    const release =
      country.release_dates.find(
        (item: any) =>
          Number(
            item.type
          ) === type &&
          item.release_date
      );

    if (release) {
      return release;
    }
  }

  return (
    country.release_dates.find(
      (item: any) =>
        item.release_date
    ) ||
    null
  );
}

/*
 * ==========================================
 * PRÓXIMA TEMPORADA
 * ==========================================
 */

function findNextSeason(
  details: any
) {
  const seasons =
    Array.isArray(
      details?.seasons
    )
      ? details.seasons
      : [];

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  return (
    seasons
      .filter(
        (season: any) =>
          Number(
            season.season_number
          ) > 0 &&
          season.air_date
      )
      .map(
        (season: any) => ({
          ...season,

          parsedDate:
            new Date(
              `${season.air_date}T00:00:00`
            ),
        })
      )
      .filter(
        (season: any) =>
          season.parsedDate
            .getTime() >=
          today.getTime()
      )
      .sort(
        (
          a: any,
          b: any
        ) =>
          a.parsedDate.getTime() -
          b.parsedDate.getTime()
      )[0] ||
    null
  );
}

/*
 * ==========================================
 * CALENDÁRIO TMDB
 * ==========================================
 *
 * Essa função recebe um título
 * da biblioteca e transforma os
 * dados do TMDB em eventos simples
 * para o calendário.
 */

export async function calendarTMDB(
  type: "movie" | "tv",
  id: number | string
): Promise<
  CalendarTMDBItem[]
> {
  /*
   * ==========================================
   * FILME
   * ==========================================
   */

  if (type === "movie") {
    const [
      details,
      releaseDates,
    ] =
      await Promise.all([
        lightweightDetailsTMDB(
          "movie",
          id
        ),

        movieReleaseDatesTMDB(
          id
        ),
      ]);

    const release =
      findBrazilRelease(
        releaseDates
      );

    if (!release) {
      return [];
    }

    return [
      {
        tmdb_id:
          Number(id),

        media_type:
          "movie",

        title:
          details.title ||
          details.original_title ||
          "Filme",

        poster_path:
          details.poster_path ||
          null,

        backdrop_path:
          details.backdrop_path ||
          null,

        date:
          release.release_date
            ? String(
                release.release_date
              ).slice(
                0,
                10
              )
            : null,

        event_type:
          "movie_release",

        season_number:
          null,

        episode_number:
          null,

        episode_name:
          null,

        release_type:
          Number(
            release.type
          ) ||
          null,

        release_label:
          releaseTypeLabel(
            Number(
              release.type
            )
          ),

        status:
          details.status ||
          null,

        overview:
          details.overview ||
          null,
      },
    ];
  }

  /*
   * ==========================================
   * SÉRIE
   * ==========================================
   */

  const details =
    await lightweightDetailsTMDB(
      "tv",
      id
    );

  const events:
    CalendarTMDBItem[] =
    [];

  /*
   * ------------------------------------------
   * PRÓXIMO EPISÓDIO
   * ------------------------------------------
   */

  const nextEpisode =
    details.next_episode_to_air;

  if (
    nextEpisode?.air_date
  ) {
    events.push({
      tmdb_id:
        Number(id),

      media_type:
        "tv",

      title:
        details.name ||
        details.original_name ||
        "Série",

      poster_path:
        details.poster_path ||
        null,

      backdrop_path:
        details.backdrop_path ||
        null,

      date:
        nextEpisode.air_date,

      event_type:
        "episode",

      season_number:
        nextEpisode.season_number ??
        null,

      episode_number:
        nextEpisode.episode_number ??
        null,

      episode_name:
        nextEpisode.name ||
        null,

      release_type:
        null,

      release_label:
        null,

      status:
        details.status ||
        null,

      overview:
        nextEpisode.overview ||
        details.overview ||
        null,
    });
  }

  /*
   * ------------------------------------------
   * PRÓXIMA TEMPORADA
   * ------------------------------------------
   */

  const nextSeason =
    findNextSeason(
      details
    );

  /*
   * Evita duplicar a estreia da
   * temporada se o próximo episódio
   * já for o episódio 1 da mesma
   * temporada e mesma data.
   */

  if (
    nextSeason?.air_date
  ) {
    const sameAsEpisode =
      nextEpisode &&
      Number(
        nextEpisode.season_number
      ) ===
        Number(
          nextSeason.season_number
        ) &&
      Number(
        nextEpisode.episode_number
      ) === 1 &&
      nextEpisode.air_date ===
        nextSeason.air_date;

    if (!sameAsEpisode) {
      events.push({
        tmdb_id:
          Number(id),

        media_type:
          "tv",

        title:
          details.name ||
          details.original_name ||
          "Série",

        poster_path:
          details.poster_path ||
          null,

        backdrop_path:
          details.backdrop_path ||
          null,

        date:
          nextSeason.air_date,

        event_type:
          "season",

        season_number:
          Number(
            nextSeason.season_number
          ),

        episode_number:
          null,

        episode_name:
          nextSeason.name ||
          null,

        release_type:
          null,

        release_label:
          null,

        status:
          details.status ||
          null,

        overview:
          nextSeason.overview ||
          details.overview ||
          null,
      });
    }
  }

  return events;
}

/*
 * ==========================================
 * DESCOBERTA — PRÓXIMOS LANÇAMENTOS
 * ==========================================
 *
 * Usado pela página /calendar para mostrar
 * títulos futuros mesmo quando eles ainda
 * não estão na biblioteca do usuário.
 */

export type CalendarDiscoveryItem = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  date: string | null;
  event_type: "movie_release" | "series_premiere";
  overview: string | null;
  popularity: number;
  vote_average: number;
  original_language: string | null;
};

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function discoveryWindow(days = 120) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + days);

  return {
    start: dateOnly(start),
    end: dateOnly(end),
  };
}

/*
 * Filmes futuros com lançamento no Brasil.
 *
 * 2|3|4 =
 * cinema limitado | cinema | digital
 *
 * Usamos discover porque ele permite filtrar
 * por região e intervalo de datas.
 */
export async function upcomingMoviesTMDB(
  days = 120,
  page = 1
): Promise<CalendarDiscoveryItem[]> {
  const { start, end } = discoveryWindow(days);

  const data = await tmdb(
    `/discover/movie?language=${getLanguage()}` +
      `&region=BR` +
      `&include_adult=false` +
      `&include_video=false` +
      `&sort_by=popularity.desc` +
      `&with_release_type=2|3|4` +
      `&release_date.gte=${start}` +
      `&release_date.lte=${end}` +
      `&page=${Math.max(1, page)}`,
    {
      revalidate: 21600,
    }
  );

  const results = Array.isArray(data?.results)
    ? data.results
    : [];

  return results
    .filter((item: any) => item?.id && item?.release_date)
    .map(
      (item: any): CalendarDiscoveryItem => ({
        tmdb_id: Number(item.id),
        media_type: "movie",
        title:
          item.title ||
          item.original_title ||
          "Filme",
        poster_path: item.poster_path || null,
        backdrop_path: item.backdrop_path || null,
        date: item.release_date || null,
        event_type: "movie_release",
        overview: item.overview || null,
        popularity: Number(item.popularity || 0),
        vote_average: Number(item.vote_average || 0),
        original_language: item.original_language || null,
      })
    );
}

/*
 * Séries NOVAS que estreiam nos próximos dias.
 *
 * Aqui usamos first_air_date, então esta lista
 * representa estreias de séries, não episódios
 * futuros de séries antigas.
 */
export async function upcomingSeriesTMDB(
  days = 120,
  page = 1
): Promise<CalendarDiscoveryItem[]> {
  const { start, end } = discoveryWindow(days);

  const data = await tmdb(
    `/discover/tv?language=${getLanguage()}` +
      `&include_adult=false` +
      `&include_null_first_air_dates=false` +
      `&sort_by=popularity.desc` +
      `&first_air_date.gte=${start}` +
      `&first_air_date.lte=${end}` +
      `&page=${Math.max(1, page)}`,
    {
      revalidate: 21600,
    }
  );

  const results = Array.isArray(data?.results)
    ? data.results
    : [];

  return results
    .filter((item: any) => item?.id && item?.first_air_date)
    .map(
      (item: any): CalendarDiscoveryItem => ({
        tmdb_id: Number(item.id),
        media_type: "tv",
        title:
          item.name ||
          item.original_name ||
          "Série",
        poster_path: item.poster_path || null,
        backdrop_path: item.backdrop_path || null,
        date: item.first_air_date || null,
        event_type: "series_premiere",
        overview: item.overview || null,
        popularity: Number(item.popularity || 0),
        vote_average: Number(item.vote_average || 0),
        original_language: item.original_language || null,
      })
    );
}

/*
 * Junta filmes e séries futuras.
 *
 * Fazemos duas páginas de cada categoria para
 * ter uma seleção melhor sem exagerar no número
 * de chamadas ao TMDB.
 */
export async function upcomingDiscoveriesTMDB(
  days = 120
): Promise<CalendarDiscoveryItem[]> {
  const results = await Promise.allSettled([
    upcomingMoviesTMDB(days, 1),
    upcomingMoviesTMDB(days, 2),
    upcomingSeriesTMDB(days, 1),
    upcomingSeriesTMDB(days, 2),
  ]);

  const items: CalendarDiscoveryItem[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      console.error(
        "Erro ao buscar próximos lançamentos no TMDB:",
        result.reason
      );
    }
  }

  const seen = new Set<string>();

  return items
    .filter((item) => {
      const key = `${item.media_type}-${item.tmdb_id}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;

      const dateDifference =
        new Date(`${a.date}T00:00:00`).getTime() -
        new Date(`${b.date}T00:00:00`).getTime();

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return b.popularity - a.popularity;
    });
}