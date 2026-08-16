import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

function normalize(
  value:
    string
) {
  return value
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}\s.-]/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function levenshtein(
  a:
    string,
  b:
    string
) {
  const x =
    normalize(
      a
    ).replace(
      /\s+/g,
      ""
    );

  const y =
    normalize(
      b
    ).replace(
      /\s+/g,
      ""
    );

  if (!x) {
    return y.length;
  }

  if (!y) {
    return x.length;
  }

  const prev =
    Array.from(
      {
        length:
          y.length +
          1,
      },
      (
        _,
        i
      ) =>
        i
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

          prev[
            j
          ] +
            1,

          prev[
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
      prev[
        j
      ] =
        current[
          j
        ];
    }
  }

  return prev[
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
    normalize(
      a
    ).replace(
      /\s+/g,
      ""
    );

  const y =
    normalize(
      b
    ).replace(
      /\s+/g,
      ""
    );

  if (
    !x ||
    !y
  ) {
    return 0;
  }

  return (
    1 -
    levenshtein(
      x,
      y
    ) /
      Math.max(
        x.length,
        y.length
      )
  );
}

function personScore(
  query:
    string,
  person:
    any
) {
  const q =
    normalize(
      query
    );

  const name =
    normalize(
      person.name ||
        ""
    );

  const qTokens =
    q.split(
      " "
    );

  const nameTokens =
    name.split(
      " "
    );

  let score =
    similarity(
      q,
      name
    ) *
    100;

  if (
    q ===
    name
  ) {
    score +=
      150;
  }

  if (
    qTokens.length ===
      1 &&
    nameTokens.some(
      (
        token
      ) =>
        token ===
          q ||
        similarity(
          token,
          q
        ) >=
          0.82
    )
  ) {
    score +=
      100;
  }

  score +=
    Math.log10(
      Number(
        person.popularity ||
        0
      ) +
        1
    ) *
    8;

  return score;
}

async function tmdb(
  path:
    string,
  params:
    Record<
      string,
      string
    > = {}
) {
  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    return null;
  }

  const qs =
    new URLSearchParams({
      api_key:
        apiKey,

      language:
        process.env
          .TMDB_LANGUAGE ||
        "pt-BR",

      ...params,
    });

  const response =
    await fetch(
      `${TMDB_BASE}${path}?${qs.toString()}`,
      {
        next: {
          revalidate:
            900,
        },
      }
    );

  if (
    !response.ok
  ) {
    return null;
  }

  return response.json();
}

export async function GET(
  req:
    NextRequest
) {
  const q =
    new URL(
      req.url
    )
      .searchParams
      .get(
        "q"
      )
      ?.trim() ||
    "";

  if (
    q.length <
    2
  ) {
    return NextResponse.json({
      suggestions:
        [],
    });
  }

  const personVariants =
    new Set<
      string
    >([
      q,
    ]);

  const tokens =
    normalize(
      q
    )
      .split(
        " "
      )
      .filter(
        Boolean
      );

  if (
    tokens.length >
    1
  ) {
    personVariants.add(
      tokens[
        0
      ]
    );

    personVariants.add(
      tokens[
        tokens.length -
        1
      ]
    );
  }

  if (
    normalize(
      q
    ).length >=
    5
  ) {
    personVariants.add(
      normalize(
        q
      ).slice(
        0,
        Math.max(
          4,
          normalize(
            q
          ).length -
            1
        )
      )
    );
  }

  const supabase =
    await createClient();

  const [
    multi,
    collectionSearch,
    personGroups,
    characterSearch,
  ] =
    await Promise.all([
      tmdb(
        "/search/multi",
        {
          query:
            q,

          include_adult:
            "false",
        }
      ),

      tmdb(
        "/search/collection",
        {
          query:
            q,

          include_adult:
            "false",
        }
      ),

      Promise.all(
        Array.from(
          personVariants
        )
          .slice(
            0,
            4
          )
          .map(
            (
              query
            ) =>
              tmdb(
                "/search/person",
                {
                  query,

                  include_adult:
                    "false",
                }
              )
          )
      ),

      supabase.rpc(
        "search_character_titles",
        {
          search_text:
            q,

          min_similarity:
            0.45,

          result_limit:
            12,
        }
      ),
    ]);

  const suggestions:
    any[] =
    [];

  /*
   * 1. Títulos diretos.
   */
  const direct =
    Array.isArray(
      multi?.results
    )
      ? multi.results
      : [];

  direct
    .filter(
      (
        item:
          any
      ) =>
        item.media_type ===
          "movie" ||
        item.media_type ===
          "tv"
    )
    .slice(
      0,
      5
    )
    .forEach(
      (
        item:
          any
      ) => {
        suggestions.push({
          kind:
            "media",

          ...item,
        });
      }
    );

  /*
   * 2. Pessoas — aceita sobrenome e typo.
   */
  const people =
    new Map<
      number,
      any
    >();

  for (
    const group
    of personGroups
  ) {
    for (
      const person
      of Array.isArray(
        group?.results
      )
        ? group.results
        : []
    ) {
      people.set(
        person.id,
        person
      );
    }
  }

  Array.from(
    people.values()
  )
    .map(
      (
        person
      ) => ({
        person,

        score:
          personScore(
            q,
            person
          ),
      })
    )
    .filter(
      (
        item
      ) =>
        item.score >=
        68
    )
    .sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    )
    .slice(
      0,
      3
    )
    .forEach(
      ({
        person,
      }) => {
        suggestions.push({
          kind:
            "person",

          id:
            person.id,

          name:
            person.name,

          profile_path:
            person.profile_path,

          known_for_department:
            person.known_for_department,

          popularity:
            person.popularity,

          href:
            `/search?q=${encodeURIComponent(
              person.name
            )}`,
        });
      }
    );

  /*
   * 3. Personagem — índice local derivado de
   * créditos do TMDB.
   */
  const characterRows =
    Array.isArray(
      characterSearch.data
    )
      ? characterSearch.data
      : [];

  if (
    characterRows.length >
    0
  ) {
    const bestName =
      characterRows[
        0
      ]
        .character_name;

    suggestions.push({
      kind:
        "character",

      name:
        bestName,

      matched:
        q,

      count:
        new Set(
          characterRows.map(
            (
              item:
                any
            ) =>
              `${item.media_type}-${item.tmdb_id}`
          )
        ).size,

      poster_path:
        characterRows[
          0
        ]
          .poster_path ||
        null,

      href:
        `/search?q=${encodeURIComponent(
          bestName
        )}`,
    });
  }

  /*
   * 4. Coleções / franquias.
   */
  const collections =
    Array.isArray(
      collectionSearch
        ?.results
    )
      ? collectionSearch.results
      : [];

  collections
    .slice(
      0,
      2
    )
    .forEach(
      (
        collection:
          any
      ) => {
        suggestions.push({
          kind:
            "collection",

          id:
            collection.id,

          name:
            collection.name,

          poster_path:
            collection.poster_path,

          href:
            `/collection/${collection.id}`,
        });
      }
    );

  return NextResponse.json(
    {
      query:
        q,

      suggestions:
        suggestions.slice(
          0,
          10
        ),
    },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=60, stale-while-revalidate=600",
      },
    }
  );
}