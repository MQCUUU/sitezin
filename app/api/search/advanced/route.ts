import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createSupabaseClient,
  SupabaseClient,
} from "@supabase/supabase-js";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

type MediaType =
  | "movie"
  | "tv";

type TMDBParams =
  Record<
    string,
    string
  >;

type CharacterRow = {
  media_type: MediaType;
  tmdb_id: number;
  media_title: string;
  person_id: number;
  popularity: number;
  character_id:
    number;
  character_name:
    string;
  normalized_name:
    string;
  name_similarity:
    number;
  match_kind:
    string;
  media_count:
    number;
  max_media_popularity:
    number;
  avg_media_popularity:
    number;
  sum_media_popularity:
    number;
  entity_score:
    number;
};

type PersonRow = {
  media_type: MediaType;
  tmdb_id: number;
  media_title: string;
  role: number;
  popularity: number;
  person_id:
    number;
  person_name:
    string;
  normalized_name:
    string;
  name_similarity:
    number;
  match_kind:
    string;
  media_count:
    number;
  important_credit_count:
    number;
  max_media_popularity:
    number;
  avg_media_popularity:
    number;
  sum_media_popularity:
    number;
  entity_score:
    number;
};

type CharacterMediaRow = {
  media_type: MediaType;
  tmdb_id: number;
  media_title: string;
  character_name: string;
  person_name: string | null;
  popularity: number;
};

type PersonMediaRow = {
  media_type: MediaType;
  tmdb_id: number;
  media_title: string;
  role: number;
  popularity: number;
};

type MediaResult = {
  id:
    number;
  media_type:
    MediaType;
  title?:
    string;
  name?:
    string;
  poster_path?:
    string |
    null;
  backdrop_path?:
    string |
    null;
  release_date?:
    string;
  first_air_date?:
    string;
  vote_average?:
    number;
  vote_count?:
    number;
  popularity?:
    number;
  overview?:
    string;
  reason?:
    string;
  character?:
    string;
  character_actor?:
    string |
    null;
  person_name?:
    string;
  role?:
    number;
};

function normalize(
  value:
    string
) {
  return String(
    value ||
      ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}\s+.-]/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function compact(
  value:
    string
) {
  return normalize(
    value
  ).replace(
    /\s+/g,
    ""
  );
}

function tokens(
  value:
    string
) {
  return normalize(
    value
  )
    .split(
      " "
    )
    .filter(
      Boolean
    );
}

function levenshtein(
  a:
    string,
  b:
    string
) {
  const x =
    compact(
      a
    );

  const y =
    compact(
      b
    );

  if (!x) {
    return y.length;
  }

  if (!y) {
    return x.length;
  }

  const previous =
    Array.from(
      {
        length:
          y.length +
          1,
      },
      (
        _,
        index
      ) =>
        index
    );

  for (
    let i =
      1;
    i <=
      x.length;
    i++
  ) {
    const current =
      [
        i,
      ];

    for (
      let j =
        1;
      j <=
        y.length;
      j++
    ) {
      current[
        j
      ] =
        Math.min(
          current[
            j -
            1
          ] +
            1,

          previous[
            j
          ] +
            1,

          previous[
            j -
            1
          ] +
            (
              x[
                i -
                  1
              ] ===
              y[
                j -
                  1
              ]
                ? 0
                : 1
            )
        );
    }

    for (
      let j =
        0;
      j <
        current.length;
      j++
    ) {
      previous[
        j
      ] =
        current[
          j
        ];
    }
  }

  return previous[
    y.length
  ];
}

function similarity(
  a:
    string,
  b:
    string
) {
  const x =
    compact(
      a
    );

  const y =
    compact(
      b
    );

  if (
    !x ||
    !y
  ) {
    return 0;
  }

  const distance =
    levenshtein(
      x,
      y
    );

  return (
    1 -
    distance /
      Math.max(
        x.length,
        y.length
      )
  );
}

function titleOf(
  item:
    any
) {
  return String(
    item?.title ||
      item?.name ||
      ""
  ).trim();
}

function mediaKey(
  mediaType:
    string,
  id:
    number
) {
  return `${mediaType}-${id}`;
}

function isMediaType(
  value:
    any
): value is MediaType {
  return (
    value ===
      "movie" ||
    value ===
      "tv"
  );
}

function exactNameMatch(
  query:
    string,
  candidate:
    string
) {
  return (
    normalize(
      query
    ) ===
    normalize(
      candidate
    )
  );
}

function surnameMatch(
  query:
    string,
  candidate:
    string
) {
  const q =
    tokens(
      query
    );

  const name =
    tokens(
      candidate
    );

  if (
    q.length !==
      1 ||
    name.length <
      2
  ) {
    return false;
  }

  return similarity(
    name[
      name.length - 1
    ],
    q[0]
  ) >= 0.86;
}

function personNameScore(
  query:
    string,
  name:
    string
) {
  const q =
    normalize(
      query
    );

  const n =
    normalize(
      name
    );

  let score =
    similarity(
      q,
      n
    ) *
    100;

  if (
    q ===
    n
  ) {
    score +=
      200;
  }

  if (
    n.startsWith(
      `${q} `
    ) ||
    n.startsWith(
      q
    )
  ) {
    score +=
      70;
  }

  if (
    surnameMatch(
      q,
      n
    )
  ) {
    score +=
      160;
  } else if (
    q.length === 1 &&
    tokens(
      name
    ).some(
      (token) =>
        similarity(
          token,
          q[0]
        ) >= 0.9
    )
  ) {
    score +=
      90;
  }

  return score;
}

function characterNameScore(
  query:
    string,
  name:
    string
) {
  const q =
    normalize(
      query
    );

  const n =
    normalize(
      name
    );

  let score =
    similarity(
      q,
      n
    ) *
    100;

  if (
    q ===
    n
  ) {
    score +=
      220;
  }

  if (
    n.startsWith(
      q
    )
  ) {
    score +=
      75;
  }

  if (
    n.includes(
      q
    )
  ) {
    score +=
      35;
  }

  return score;
}

function titleScore(
  query:
    string,
  item:
    any
) {
  const title =
    titleOf(
      item
    );

  const q =
    normalize(
      query
    );

  const t =
    normalize(
      title
    );

  let score =
    similarity(
      q,
      t
    ) *
    100;

  if (
    q ===
    t
  ) {
    score +=
      500;
  } else if (
    t.startsWith(
      q
    )
  ) {
    score +=
      180;
  } else if (
    t.includes(
      q
    )
  ) {
    score +=
      90;
  }

  score +=
    Math.log10(
      Number(
        item?.popularity ||
          0
      ) +
        1
    ) *
    8;

  score +=
    Math.log10(
      Number(
        item?.vote_count ||
          0
      ) +
        1
    ) *
    4;

  return score;
}

function cleanPersonPrefix(
  query:
    string
) {
  return normalize(
    query
  )
    .replace(
      /^(?:ator|atriz|diretor|diretora|filmes? (?:com|de|do|da)|series? (?:com|de|do|da)|filmes? do ator|filmes? da atriz|series? do ator|series? da atriz|filmes? dirigidos? por|obras? dirigidas? por)\s+/,
      ""
    )
    .trim();
}

function cleanCharacterPrefix(
  query:
    string
) {
  return normalize(
    query
  )
    .replace(
      /^(?:personagem|personagem de|filmes? (?:do|da) personagem|series? (?:do|da) personagem)\s+/,
      ""
    )
    .trim();
}

function hasExplicitPersonIntent(
  query:
    string
) {
  return /^(?:ator|atriz|diretor|diretora|filmes? (?:com|de|do|da)|series? (?:com|de|do|da)|filmes? do ator|filmes? da atriz|series? do ator|series? da atriz|filmes? dirigidos? por|obras? dirigidas? por)\s+/.test(
    normalize(
      query
    )
  );
}

function hasExplicitCharacterIntent(
  query:
    string
) {
  return /^(?:personagem|personagem de|filmes? (?:do|da) personagem|series? (?:do|da) personagem)\s+/.test(
    normalize(
      query
    )
  );
}

function personRoleLabel(
  role:
    number
) {
  switch (
    Number(
      role
    )
  ) {
    case 1:
      return "Elenco";

    case 2:
      return "Direção";

    case 3:
      return "Roteiro";

    case 4:
      return "Criação";

    case 5:
      return "Trilha sonora";

    default:
      return "Crédito";
  }
}

async function enrichMedia(
  tmdb:
    <T = any>(
      path:
        string,
      params?:
        TMDBParams
    ) =>
      Promise<T | null>,
  items:
    MediaResult[],
  limit =
    20
) {
  const unique =
    new Map<
      string,
      MediaResult
    >();

  for (
    const item of items
  ) {
    if (
      !isMediaType(
        item.media_type
      ) ||
      !Number.isFinite(
        Number(
          item.id
        )
      )
    ) {
      continue;
    }

    const key =
      mediaKey(
        item.media_type,
        Number(
          item.id
        )
      );

    const current =
      unique.get(
        key
      );

    if (
      !current ||
      Number(
        item.popularity ||
          0
      ) >
        Number(
          current.popularity ||
            0
        )
    ) {
      unique.set(
        key,
        item
      );
    }
  }

  const allItems =
    Array.from(
      unique.values()
    );

  const selected =
    allItems.slice(
      0,
      limit
    );

  const enriched =
    await Promise.all(
      selected.map(
        async (
          item
        ) => {
          const details =
            await tmdb(
              `/${item.media_type}/${item.id}`
            );

          if (
            !details
          ) {
            return item;
          }

          return {
            ...details,
            ...item,

            title:
              item.media_type ===
              "movie"
                ? details.title ||
                  item.title
                : undefined,

            name:
              item.media_type ===
              "tv"
                ? details.name ||
                  item.name
                : undefined,

            media_type:
              item.media_type,

            id:
              item.id,

            reason:
              item.reason,

            character:
              item.character,

            character_actor:
              item.character_actor,

            person_name:
              item.person_name,

            role:
              item.role,
          };
        }
      )
    );

  return [
    ...enriched,
    ...allItems.slice(
      selected.length
    ),
  ];
}

async function localCharacterSearch(
  supabase:
    SupabaseClient,
  query:
    string
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "search_v4_characters",
      {
        query_text:
          query,

        result_limit:
          120,
      }
    );

  if (
    error
  ) {
    console.error(
      "search_v4_characters:",
      error.message
    );

    return [];
  }

  return (
    Array.isArray(
      data
    )
      ? data
      : []
  ) as
    CharacterRow[];
}

async function localPersonSearch(
  supabase:
    SupabaseClient,
  query:
    string
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "search_v4_people",
      {
        query_text:
          query,

        result_limit:
          120,
      }
    );

  if (
    error
  ) {
    console.error(
      "search_v4_people:",
      error.message
    );

    return [];
  }

  return (
    Array.isArray(
      data
    )
      ? data
      : []
  ) as
    PersonRow[];
}

async function loadCharacterMedia(
  supabase: SupabaseClient,
  characterId: number
) {
  const { data, error } =
    await supabase.rpc(
      "search_v4_character_media",
      {
        target_character_id:
          characterId,
      }
    );

  if (error) {
    console.error(
      "search_v4_character_media:",
      error.message
    );
    return [];
  }

  return (Array.isArray(data) ? data : []) as CharacterMediaRow[];
}

async function loadPersonMedia(
  supabase: SupabaseClient,
  personId: number
) {
  const { data, error } =
    await supabase.rpc(
      "search_v4_person_media",
      {
        target_person_id:
          personId,
      }
    );

  if (error) {
    console.error(
      "search_v4_person_media:",
      error.message
    );
    return [];
  }

  return (Array.isArray(data) ? data : []) as PersonMediaRow[];
}

function characterMediaResults(
  rows: CharacterMediaRow[]
): MediaResult[] {
  return rows.map((row) => ({
    id: Number(row.tmdb_id),
    media_type: row.media_type,
    title: row.media_type === "movie" ? row.media_title : undefined,
    name: row.media_type === "tv" ? row.media_title : undefined,
    popularity: Number(row.popularity || 0),
    character: row.character_name,
    character_actor: row.person_name,
    reason: row.person_name
      ? `Personagem: ${row.character_name} · ${row.person_name}`
      : `Personagem: ${row.character_name}`,
  }));
}

function personMediaResults(
  personName: string,
  rows: PersonMediaRow[]
): MediaResult[] {
  return rows.map((row) => ({
    id: Number(row.tmdb_id),
    media_type: row.media_type,
    title: row.media_type === "movie" ? row.media_title : undefined,
    name: row.media_type === "tv" ? row.media_title : undefined,
    popularity: Number(row.popularity || 0),
    person_name: personName,
    role: Number(row.role),
    reason: `${personRoleLabel(Number(row.role))}: ${personName}`,
  }));
}

function buildCharacterResults(
  query:
    string,
  rows:
    CharacterRow[]
) {
  if (
    rows.length ===
      0
  ) {
    return {
      name:
        "",
      score:
        0,
      results:
        [] as
          MediaResult[],
    };
  }

  const grouped =
    new Map<
      string,
      {
        score:
          number;
        name:
          string;
        rows:
          CharacterRow[];
      }
    >();

  for (
    const row of rows
  ) {
    const name =
      String(
        row.character_name ||
          ""
      ).trim();

    if (!name) {
      continue;
    }

    const key =
      normalize(
        name
      );

    const score =
      characterNameScore(
        query,
        name
      );

    const current =
      grouped.get(
        key
      );

    if (
      !current
    ) {
      grouped.set(
        key,
        {
          score,
          name,
          rows: [
            row,
          ],
        }
      );
    } else {
      current.rows.push(
        row
      );

      current.score =
        Math.max(
          current.score,
          score
        );
    }
  }

  const best =
    Array.from(
      grouped.values()
    ).sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    )[
      0
    ];

  if (!best) {
    return {
      name:
        "",
      score:
        0,
      results:
        [] as
          MediaResult[],
    };
  }

  const merged =
    new Map<
      string,
      MediaResult
    >();

  for (
    const row of best.rows
  ) {
    const key =
      mediaKey(
        row.media_type,
        Number(
          row.tmdb_id
        )
      );

    const result:
      MediaResult = {
      id:
        Number(
          row.tmdb_id
        ),

      media_type:
        row.media_type,

      title:
        row.media_type ===
        "movie"
          ? row.media_title
          : undefined,

      name:
        row.media_type ===
        "tv"
          ? row.media_title
          : undefined,

      popularity:
        Number(
          row.popularity ||
            0
        ),

      character:
        row.character_name,

      character_actor:
        null,

      reason:
        `Personagem: ${row.character_name}`,
    };

    const current =
      merged.get(
        key
      );

    if (
      !current ||
      Number(
        result.popularity ||
          0
      ) >
        Number(
          current.popularity ||
            0
        )
    ) {
      merged.set(
        key,
        result
      );
    }
  }

  const results =
    Array.from(
      merged.values()
    ).sort(
      (
        a,
        b
      ) =>
        Number(
          b.popularity ||
            0
        ) -
        Number(
          a.popularity ||
            0
        )
    );

  return {
    name:
      best.name,

    score:
      best.score,

    results,
  };
}

function buildPersonResults(
  query:
    string,
  rows:
    PersonRow[]
) {
  if (
    rows.length ===
      0
  ) {
    return {
      personName:
        "",
      personId:
        0,
      score:
        0,
      results:
        [] as
          MediaResult[],
    };
  }

  const grouped =
    new Map<
      number,
      {
        personId:
          number;
        name:
          string;
        score:
          number;
        rows:
          PersonRow[];
      }
    >();

  for (
    const row of rows
  ) {
    const personId =
      Number(
        row.person_id
      );

    const name =
      String(
        row.person_name ||
          ""
      ).trim();

    if (
      !personId ||
      !name
    ) {
      continue;
    }

    const score =
      personNameScore(
        query,
        name
      );

    const current =
      grouped.get(
        personId
      );

    if (!current) {
      grouped.set(
        personId,
        {
          personId,
          name,
          score,
          rows: [
            row,
          ],
        }
      );
    } else {
      current.rows.push(
        row
      );

      current.score =
        Math.max(
          current.score,
          score
        );
    }
  }

  const best =
    Array.from(
      grouped.values()
    ).sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    )[
      0
    ];

  if (!best) {
    return {
      personName:
        "",
      personId:
        0,
      score:
        0,
      results:
        [] as
          MediaResult[],
    };
  }

  const merged =
    new Map<
      string,
      MediaResult
    >();

  for (
    const row of best.rows
  ) {
    const key =
      mediaKey(
        row.media_type,
        Number(
          row.tmdb_id
        )
      );

    const roleLabel =
      personRoleLabel(
        row.role
      );

    const result:
      MediaResult = {
      id:
        Number(
          row.tmdb_id
        ),

      media_type:
        row.media_type,

      title:
        row.media_type ===
        "movie"
          ? row.media_title
          : undefined,

      name:
        row.media_type ===
        "tv"
          ? row.media_title
          : undefined,

      popularity:
        Number(
          row.popularity ||
            0
        ),

      role:
        Number(
          row.role
        ),

      person_name:
        row.person_name,

      reason:
        `${roleLabel}: ${row.person_name}`,
    };

    const current =
      merged.get(
        key
      );

    if (
      !current ||
      Number(
        result.popularity ||
          0
      ) >
        Number(
          current.popularity ||
            0
        )
    ) {
      merged.set(
        key,
        result
      );
    }
  }

  const results =
    Array.from(
      merged.values()
    ).sort(
      (
        a,
        b
      ) =>
        (
          Number(
            a.role ===
              2
              ? 50
              : a.role ===
                  4
                ? 45
                : a.role ===
                    1
                  ? 40
                  : a.role ===
                      3
                    ? 35
                    : 30
          ) +
          Number(
            a.popularity ||
              0
          )
        ) <
        (
          Number(
            b.role ===
              2
              ? 50
              : b.role ===
                  4
                ? 45
                : b.role ===
                    1
                  ? 40
                  : b.role ===
                      3
                    ? 35
                    : 30
          ) +
          Number(
            b.popularity ||
              0
          )
        )
          ? 1
          : -1
    );

  return {
    personName:
      best.name,

    personId:
      best.personId,

    score:
      best.score,

    results,
  };
}

function parseNaturalFilters(
  query:
    string
) {
  const q =
    normalize(
      query
    );

  const type:
    MediaType |
    null =
    /\bseries?\b/.test(
      q
    )
      ? "tv"
      : /\bfilmes?\b/.test(
          q
        )
        ? "movie"
        : null;

  const genres:
    Record<
      string,
      {
        movie?:
          number;
        tv?:
          number;
      }
    > = {
      acao: {
        movie: 28,
        tv: 10759,
      },

      aventura: {
        movie: 12,
        tv: 10759,
      },

      animacao: {
        movie: 16,
        tv: 16,
      },

      comedia: {
        movie: 35,
        tv: 35,
      },

      crime: {
        movie: 80,
        tv: 80,
      },

      documentario: {
        movie: 99,
        tv: 99,
      },

      drama: {
        movie: 18,
        tv: 18,
      },

      familia: {
        movie: 10751,
        tv: 10751,
      },

      fantasia: {
        movie: 14,
        tv: 10765,
      },

      historia: {
        movie: 36,
      },

      terror: {
        movie: 27,
      },

      musica: {
        movie: 10402,
      },

      misterio: {
        movie: 9648,
        tv: 9648,
      },

      romance: {
        movie: 10749,
      },

      ficcao: {
        movie: 878,
        tv: 10765,
      },

      "ficcao cientifica": {
        movie: 878,
        tv: 10765,
      },

      suspense: {
        movie: 53,
        tv: 9648,
      },

      guerra: {
        movie: 10752,
        tv: 10768,
      },

      faroeste: {
        movie: 37,
        tv: 37,
      },
    };

  let genreName =
    "";

  let genre:
    {
      movie?:
        number;
      tv?:
        number;
    } |
    null =
    null;

  for (
    const [
      name,
      info,
    ]
    of Object.entries(
      genres
    )
  ) {
    if (
      q.includes(
        name
      ) &&
      name.length >
        genreName.length
    ) {
      genreName =
        name;

      genre =
        info;
    }
  }

  const year =
    q.match(
      /\b(19\d{2}|20\d{2}|21\d{2})\b/
    )?.[
      1
    ] ||
    "";

  const rating =
    q.match(
      /(?:nota|avaliacao|minimo|minima)\s*(?:de\s*)?(\d(?:[.,]\d)?)\s*\+?/
    )?.[
      1
    ]?.replace(
      ",",
      "."
    ) ||
    "";

  const providers:
    Record<
      string,
      string
    > = {
      netflix:
        "8",

      prime:
        "119",

      "prime video":
        "119",

      disney:
        "337",

      "disney plus":
        "337",

      max:
        "1899",

      hbo:
        "1899",

      globoplay:
        "307",

      paramount:
        "531",

      "paramount plus":
        "531",

      appletv:
        "350",

      "apple tv":
        "350",
    };

  let providerName =
    "";

  let providerId =
    "";

  for (
    const [
      name,
      id,
    ]
    of Object.entries(
      providers
    )
  ) {
    if (
      q.includes(
        name
      )
    ) {
      providerName =
        name;

      providerId =
        id;

      break;
    }
  }

  return {
    type,
    genreName,
    genre,
    year,
    rating,
    providerName,
    providerId,

    active:
      Boolean(
        type &&
        (
          genre ||
          year ||
          rating ||
          providerId
        )
      ),
  };
}

export async function GET(
  req:
    NextRequest
) {
  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "TMDB_API_KEY não configurada",
      },
      {
        status:
          500,
      }
    );
  }

  const requestUrl =
    new URL(
      req.url
    );

  const original =
    String(
      requestUrl.searchParams.get(
        "q"
      ) ||
        ""
    ).trim();

  if (
    original.length <
      2
  ) {
    return NextResponse.json({
      handled:
        false,
    });
  }

  const q =
    normalize(
      original
    );

  const language =
    process.env.TMDB_LANGUAGE ||
    "pt-BR";

  async function tmdb<
    T = any
  >(
    path:
      string,
    params:
      TMDBParams = {}
  ):
    Promise<
      T |
      null
    > {
    const search =
      new URLSearchParams({
        api_key:
          String(
            apiKey
          ),

        language,

        ...params,
      });

    try {
      const response =
        await fetch(
          `${TMDB_BASE}${path}?${search.toString()}`,
          {
            next: {
              revalidate:
                21600,
            },
          }
        );

      if (
        !response.ok
      ) {
        return null;
      }

      return await response.json() as
        T;
    } catch {
      return null;
    }
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    console.error(
      "Busca local indisponível: credenciais do índice ausentes."
    );

    return NextResponse.json(
      {
        error:
          "Índice de busca indisponível.",
      },
      {
        status:
          500,
      }
    );
  }

  const supabase =
    createSupabaseClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession:
            false,
          autoRefreshToken:
            false,
        },
      }
    );

  /*
   * ========================================================
   * 1. COLEÇÃO / FRANQUIA
   * ========================================================
   */

  const collectionMatch =
    q.match(
      /^(?:colecao|franquia|saga)\s+(.+)$/
    );

  if (
    collectionMatch
  ) {
    const term =
      collectionMatch[
        1
      ].trim();

    const search =
      await tmdb<any>(
        "/search/collection",
        {
          query:
            term,

          include_adult:
            "false",
        }
      );

    const collection =
      Array.isArray(
        search?.results
      )
        ? search.results[
            0
          ]
        : null;

    if (
      collection?.id
    ) {
      const details =
        await tmdb<any>(
          `/collection/${collection.id}`
        );

      const results =
        Array.isArray(
          details?.parts
        )
          ? details.parts
              .map(
                (
                  item:
                    any
                ) => ({
                  ...item,

                  media_type:
                    "movie",
                })
              )
              .sort(
                (
                  a:
                    any,
                  b:
                    any
                ) =>
                  String(
                    a.release_date ||
                      ""
                  ).localeCompare(
                    String(
                      b.release_date ||
                        ""
                    )
                  )
              )
          : [];

      return NextResponse.json({
        handled:
          true,

        mode:
          "collection",

        title:
          details?.name ||
          collection.name,

        subtitle:
          `${results.length} filmes encontrados nesta coleção.`,

        collection: {
          id:
            collection.id,

          name:
            details?.name ||
            collection.name,

          overview:
            details?.overview ||
            "",

          poster_path:
            details?.poster_path ||
            collection.poster_path,

          backdrop_path:
            details?.backdrop_path ||
            collection.backdrop_path,
        },

        results,
      });
    }
  }

  /*
   * ========================================================
   * 2. FILTROS EM LINGUAGEM NATURAL
   * ========================================================
   */

  const filters =
    parseNaturalFilters(
      q
    );

  if (
    filters.active &&
    filters.type
  ) {
    const params:
      TMDBParams = {
      include_adult:
        "false",

      sort_by:
        filters.rating
          ? "vote_average.desc"
          : "popularity.desc",

      "vote_count.gte":
        filters.rating
          ? "100"
          : "30",
    };

    if (
      filters.genre?.[
        filters.type
      ]
    ) {
      params.with_genres =
        String(
          filters.genre[
            filters.type
          ]
        );
    }

    if (
      filters.year
    ) {
      params[
        filters.type ===
          "movie"
          ? "primary_release_year"
          : "first_air_date_year"
      ] =
        filters.year;
    }

    if (
      filters.rating
    ) {
      params[
        "vote_average.gte"
      ] =
        filters.rating;
    }

    if (
      filters.providerId
    ) {
      params.watch_region =
        "BR";

      params.with_watch_providers =
        filters.providerId;
    }

    const data =
      await tmdb<any>(
        `/discover/${filters.type}`,
        params
      );

    const results =
      (
        Array.isArray(
          data?.results
        )
          ? data.results
          : []
      ).map(
        (
          item:
            any
        ) => ({
          ...item,

          media_type:
            filters.type,

          reason:
            [
              filters.genreName
                ? `Gênero: ${filters.genreName}`
                : "",

              filters.year
                ? `Ano: ${filters.year}`
                : "",

              filters.rating
                ? `Nota ${filters.rating}+`
                : "",

              filters.providerName
                ? `Streaming: ${filters.providerName}`
                : "",
            ]
              .filter(
                Boolean
              )
              .join(
                " · "
              ),
        })
      );

    return NextResponse.json({
      handled:
        true,

      mode:
        "filters",

      title:
        "Busca por filtros",

      subtitle:
        [
          filters.type ===
            "movie"
            ? "Filmes"
            : "Séries",

          filters.genreName,

          filters.year,

          filters.rating
            ? `nota ${filters.rating}+`
            : "",

          filters.providerName
            ? `em ${filters.providerName}`
            : "",
        ]
          .filter(
            Boolean
          )
          .join(
            " · "
          ),

      results,
    });
  }

  /*
   * ========================================================
   * 3. BUSCAMOS EM PARALELO
   * ========================================================
   *
   * - título no TMDB
   * - pessoa no índice local
   * - personagem no índice local
   *
   * Não fazemos aliases manuais.
   */

  const personTerm =
    cleanPersonPrefix(
      q
    );

  const characterTerm =
    cleanCharacterPrefix(
      q
    );

  const [
    multiSearch,
    characterRows,
    personRows,
  ] =
    await Promise.all([
      tmdb<any>(
        "/search/multi",
        {
          query:
            q,

          include_adult:
            "false",

          page:
            "1",
        }
      ),

      localCharacterSearch(
        supabase,
        characterTerm
      ),

      localPersonSearch(
        supabase,
        personTerm
      ),
    ]);

  /*
   * ========================================================
   * 4. TÍTULO EXATO TEM PRIORIDADE MÁXIMA
   * ========================================================
   */

  const titleCandidates =
    (
      Array.isArray(
        multiSearch?.results
      )
        ? multiSearch.results
        : []
    )
      .filter(
        (
          item:
            any
        ) =>
          (
            item.media_type ===
              "movie" ||
            item.media_type ===
              "tv"
          ) &&
          titleOf(
            item
          )
      )
      .map(
        (
          item:
            any
        ) => ({
          ...item,

          _score:
            titleScore(
              q,
              item
            ),
        })
      )
      .sort(
        (
          a:
            any,
          b:
            any
        ) =>
          b._score -
          a._score
      );

  const exactTitle =
    titleCandidates.find(
      (
        item:
          any
      ) =>
        exactNameMatch(
          q,
          titleOf(
            item
          )
        )
    );

  /*
   * ========================================================
   * 5. RESOLUÇÃO GLOBAL DE ENTIDADE
   * ========================================================
   * Compara título, personagem e pessoa antes de carregar os
   * créditos da entidade vencedora.
   */

  const bestTitle =
    titleCandidates[0] ||
    null;

  const bestCharacter =
    [...characterRows].sort(
      (a, b) =>
        Number(b.entity_score || 0) -
        Number(a.entity_score || 0)
    )[0] ||
    null;

  const bestPerson =
    [...personRows].sort(
      (a, b) =>
        Number(b.entity_score || 0) -
        Number(a.entity_score || 0)
    )[0] ||
    null;

  const titleEntityScore =
    bestTitle
      ? exactNameMatch(
          q,
          titleOf(bestTitle)
        )
        ? 1200 +
          Math.min(
            100,
            Math.log10(
              Number(bestTitle.popularity || 0) + 1
            ) * 25
          )
        : normalize(titleOf(bestTitle)).startsWith(q)
          ? 650 + Math.min(80, Number(bestTitle._score || 0) / 4)
          : similarity(q, titleOf(bestTitle)) >= 0.82
            ? 470 + Math.min(60, Number(bestTitle._score || 0) / 5)
            : 0
      : 0;

  const characterEntityScore =
    bestCharacter
      ? Number(bestCharacter.entity_score || 0) +
        (
          bestCharacter.match_kind === "exact" &&
          tokens(characterTerm).length > 1
            ? 100
            : 0
        ) +
        (hasExplicitCharacterIntent(q) ? 350 : 0)
      : 0;

  const characterExactRelevant =
    bestCharacter?.match_kind === "exact" &&
    Number(bestCharacter.media_count || 0) >= 1 &&
    Number(bestCharacter.max_media_popularity || 0) >= 5;

  const personClearlyRelevant =
    Boolean(bestPerson) &&
    (
      Number(bestPerson.media_count || 0) >= 8 ||
      Number(bestPerson.important_credit_count || 0) >= 6
    );

  const obscurePersonPenalty =
    characterExactRelevant &&
    !personClearlyRelevant
      ? 250
      : 0;

  const personEntityScore =
    bestPerson
      ? Number(bestPerson.entity_score || 0) +
        (
          bestPerson.match_kind === "surname" &&
          tokens(personTerm).length === 1
            ? 120
            : 0
        ) +
        (hasExplicitPersonIntent(q) ? 350 : 0) -
        obscurePersonPenalty
      : 0;

  const entityCandidates = [
    {
      type: "title" as const,
      score: titleEntityScore,
    },
    {
      type: "character" as const,
      score: characterEntityScore,
    },
    {
      type: "person" as const,
      score: personEntityScore,
    },
  ].sort((a, b) => b.score - a.score);

  const resolvedEntity =
    entityCandidates[0];

  if (
    resolvedEntity.type === "title" &&
    resolvedEntity.score >= 600
  ) {
    const results =
      titleCandidates
        .slice(0, 40)
        .map((item: any) => {
          const { _score, ...clean } = item;
          return {
            ...clean,
            reason: exactNameMatch(q, titleOf(clean))
              ? "Título exato"
              : "Título relacionado",
          };
        });

    return NextResponse.json({
      handled: true,
      mode: "title",
      title: `Resultados para ${original}`,
      subtitle: exactTitle
        ? "Correspondência direta de título."
        : `${results.length} títulos encontrados.`,
      resolved_from: original,
      resolver: entityCandidates,
      results,
    });
  }

  if (
    resolvedEntity.type === "character" &&
    bestCharacter &&
    resolvedEntity.score >= 620
  ) {
    const mediaRows =
      await loadCharacterMedia(
        supabase,
        Number(bestCharacter.character_id)
      );

    const results =
      await enrichMedia(
        tmdb,
        characterMediaResults(mediaRows),
        20
      );

    return NextResponse.json({
      handled: true,
      mode: "character",
      title: `Títulos com ${bestCharacter.character_name}`,
      subtitle: `${results.length} ${results.length === 1 ? "título" : "títulos"} encontrados pelo índice de personagens.`,
      resolved_from: original,
      character: {
        id: Number(bestCharacter.character_id),
        name: bestCharacter.character_name,
        matched: characterTerm,
      },
      resolver: entityCandidates,
      results,
    });
  }

  if (
    resolvedEntity.type === "person" &&
    bestPerson &&
    resolvedEntity.score >= 620
  ) {
    const mediaRows =
      await loadPersonMedia(
        supabase,
        Number(bestPerson.person_id)
      );

    const results =
      await enrichMedia(
        tmdb,
        personMediaResults(bestPerson.person_name, mediaRows),
        20
      );

    return NextResponse.json({
      handled: true,
      mode: "person",
      title: `Trabalhos de ${bestPerson.person_name}`,
      subtitle: `${results.length} títulos encontrados pelo índice local.`,
      resolved_from: original,
      person: {
        id: Number(bestPerson.person_id),
        name: bestPerson.person_name,
      },
      resolver: entityCandidates,
      results,
    });
  }

  /*
   * ========================================================
   * 5. PERSONAGEM LOCAL
   * ========================================================
   */

  const character =
    buildCharacterResults(
      characterTerm,
      []
    );

  const characterExplicit =
    hasExplicitCharacterIntent(
      q
    );

  /*
   * Sem prefixo explícito, exigimos um match forte.
   *
   * Ex:
   * Neal Caffrey -> entra
   * palavra aleatória -> não entra
   */

  const characterSafe =
    character.results.length >
      0 &&
    (
      characterExplicit
        ? character.score >=
          100
        : character.score >=
          145
    );

  /*
   * ========================================================
   * 6. PESSOA LOCAL
   * ========================================================
   */

  const person =
    buildPersonResults(
      personTerm,
      []
    );

  const personExplicit =
    hasExplicitPersonIntent(
      q
    );

  const personSafe =
    person.results.length >
      0 &&
    (
      personExplicit
        ? person.score >=
          75
        : person.score >=
          120
    );

  /*
   * Personagem exato ganha de pessoa parcial.
   * Pessoa exata ganha de personagem apenas aproximado.
   */

  const characterExact =
    character.name &&
    exactNameMatch(
      characterTerm,
      character.name
    );

  const personExact =
    person.personName &&
    exactNameMatch(
      personTerm,
      person.personName
    );

  const chooseCharacter =
    characterSafe &&
    (
      characterExplicit ||
      (
        characterExact &&
        (
          tokens(
            characterTerm
          ).length > 1 ||
          !personSafe
        )
      ) ||
      !personSafe ||
      (
        !personExact &&
        character.score >=
          person.score +
            20
      )
    );

  if (
    chooseCharacter
  ) {
    const enriched =
      await enrichMedia(
        tmdb,
        character.results,
        20
      );

    return NextResponse.json({
      handled:
        true,

      mode:
        "character",

      title:
        `Títulos com ${character.name}`,

      subtitle:
        `${enriched.length} ${
          enriched.length ===
          1
            ? "título"
            : "títulos"
        } encontrados pelo índice de personagens.`,

      resolved_from:
        original,

      character: {
        name:
          character.name,

        matched:
          characterTerm,
      },

      results:
        enriched,
    });
  }

  if (
    personSafe
  ) {
    const enriched =
      await enrichMedia(
        tmdb,
        person.results,
        20
      );

    return NextResponse.json({
      handled:
        true,

      mode:
        "person",

      title:
        `Trabalhos de ${person.personName}`,

      subtitle:
        `${enriched.length} títulos encontrados pelo índice local.`,

      resolved_from:
        original,

      person: {
        id:
          person.personId,

        name:
          person.personName,
      },

      results:
        enriched,
    });
  }

  /*
   * ========================================================
   * 7. FUZZY DE PESSOA PELO TMDB
   * ========================================================
   *
   * Só entra se o índice local não encontrou algo forte.
   *
   * Ex:
   * Henri Cavill
   * Tom Holand
   * Zendaia
   */

  const wordCount =
    tokens(
      personTerm
    ).length;

  const canTryPersonFuzzy =
    personExplicit ||
    (
      wordCount >=
        1 &&
      wordCount <=
        3 &&
      !/\b(?:filme|filmes|serie|series|nota|terror|acao|comedia|romance|netflix|prime|disney|max|ano)\b/.test(
        personTerm
      )
    );

  if (
    canTryPersonFuzzy
  ) {
    const personTokens =
      tokens(
        personTerm
      );

    const variants =
      new Set<
        string
      >([
        personTerm,
      ]);

    if (
      personTokens.length >
        1
    ) {
      variants.add(
        personTokens[
          0
        ]
      );

      variants.add(
        personTokens[
          personTokens.length -
            1
        ]
      );
    }

    const compactTerm =
      compact(
        personTerm
      );

    if (
      compactTerm.length >=
        5
    ) {
      variants.add(
        compactTerm.slice(
          0,
          Math.max(
            4,
            compactTerm.length -
              1
          )
        )
      );
    }

    const groups =
      await Promise.all(
        Array.from(
          variants
        )
          .slice(
            0,
            4
          )
          .map(
            async (
              query
            ) => {
              const data =
                await tmdb<any>(
                  "/search/person",
                  {
                    query,

                    include_adult:
                      "false",
                  }
                );

              return Array.isArray(
                data?.results
              )
                ? data.results.slice(
                    0,
                    20
                  )
                : [];
            }
          )
      );

    const candidates =
      groups
        .flat()
        .filter(
          (
            candidate:
              any
          ) =>
            candidate?.id &&
            candidate?.name
        )
        .map(
          (
            candidate:
              any
          ) => ({
            candidate,

            score:
              personNameScore(
                personTerm,
                candidate.name
              ) +
              Math.log10(
                Number(
                  candidate.popularity ||
                    0
                ) +
                  1
              ) *
                6,
          })
        )
        .sort(
          (
            a:
              any,
            b:
              any
          ) =>
            b.score -
            a.score
        );

    const best =
      candidates[
        0
      ];

    const safe =
      best &&
      (
        personExplicit ||
        best.score >=
          105
      );

    if (
      safe
    ) {
      const [
        details,
        credits,
      ] =
        await Promise.all([
          tmdb<any>(
            `/person/${best.candidate.id}`
          ),

          tmdb<any>(
            `/person/${best.candidate.id}/combined_credits`
          ),
        ]);

      const merged =
        new Map<
          string,
          MediaResult
        >();

      for (
        const item of
          Array.isArray(
            credits?.cast
          )
            ? credits.cast
            : []
      ) {
        if (
          !isMediaType(
            item.media_type
          )
        ) {
          continue;
        }

        merged.set(
          mediaKey(
            item.media_type,
            item.id
          ),
          {
            ...item,

            id:
              item.id,

            media_type:
              item.media_type,

            reason:
              item.character
                ? `Como ${item.character}`
                : `Com ${best.candidate.name}`,
          }
        );
      }

      for (
        const item of
          Array.isArray(
            credits?.crew
          )
            ? credits.crew
            : []
      ) {
        if (
          !isMediaType(
            item.media_type
          )
        ) {
          continue;
        }

        const important =
          item.job ===
            "Director" ||
          item.job ===
            "Writer" ||
          item.job ===
            "Screenplay" ||
          item.job ===
            "Story" ||
          item.job ===
            "Original Music Composer";

        if (
          !important
        ) {
          continue;
        }

        const key =
          mediaKey(
            item.media_type,
            item.id
          );

        const current =
          merged.get(
            key
          );

        merged.set(
          key,
          {
            ...item,
            ...current,

            id:
              item.id,

            media_type:
              item.media_type,

            reason:
              item.job ===
                "Director"
                ? `Direção de ${best.candidate.name}`
                : `${item.job} · ${best.candidate.name}`,
          }
        );
      }

      const results =
        Array.from(
          merged.values()
        )
          .filter(
            (
              item
            ) =>
              item.poster_path ||
              item.backdrop_path
          )
          .sort(
            (
              a,
              b
            ) =>
              (
                Number(
                  b.popularity ||
                    0
                ) +
                Math.log10(
                  Number(
                    b.vote_count ||
                      0
                  ) +
                    1
                ) *
                  6
              ) -
              (
                Number(
                  a.popularity ||
                    0
                ) +
                Math.log10(
                  Number(
                    a.vote_count ||
                      0
                  ) +
                    1
                ) *
                  6
              )
          )
          .slice(
            0,
            80
          );

      return NextResponse.json({
        handled:
          true,

        mode:
          "person",

        title:
          `Trabalhos de ${best.candidate.name}`,

        subtitle:
          normalize(
            personTerm
          ) ===
          normalize(
            best.candidate.name
          )
            ? `${results.length} títulos encontrados.`
            : `Entendi “${original}” como ${best.candidate.name}.`,

        resolved_from:
          original,

        person: {
          id:
            best.candidate.id,

          name:
            best.candidate.name,

          profile_path:
            details?.profile_path ||
            best.candidate.profile_path,

          known_for_department:
            details?.known_for_department ||
            best.candidate.known_for_department,
        },

        results,
      });
    }
  }

  /*
   * ========================================================
   * 8. TÍTULO PARCIAL / FUZZY
   * ========================================================
   *
   * Só depois de personagem e pessoa.
   */

  const safeTitleResults =
    titleCandidates
      .filter(
        (
          item:
            any
        ) =>
          item._score >=
          90
      )
      .slice(
        0,
        40
      )
      .map(
        (
          item:
            any
        ) => {
          const {
            _score,
            ...clean
          } =
            item;

          return {
            ...clean,

            reason:
              "Título relacionado",
          };
        }
      );

  if (
    safeTitleResults.length >
      0
  ) {
    return NextResponse.json({
      handled:
        true,

      mode:
        "title",

      title:
        `Resultados para ${original}`,

      subtitle:
        `${safeTitleResults.length} títulos encontrados.`,

      resolved_from:
        original,

      results:
        safeTitleResults,
    });
  }

  /*
   * ========================================================
   * 9. NÃO INTERCEPTA
   * ========================================================
   *
   * A página /search pode seguir para o fallback
   * normal/IA que você já tiver configurado.
   */

  return NextResponse.json({
    handled:
      false,
  });
}
