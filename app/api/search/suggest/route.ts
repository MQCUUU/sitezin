import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createSupabaseClient,
} from "@supabase/supabase-js";

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
  const rawQuery =
    new URL(
      req.url
    )
      .searchParams
      .get(
        "q"
      )
      ?.trim() ||
    "";

  const usersOnly = rawQuery.startsWith("@");
  const q = usersOnly
    ? rawQuery.replace(/^@+/, "").trim()
    : rawQuery;

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = supabaseUrl && serviceRoleKey
    ? createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  /*
   * @username e uma intencao explicita de procurar perfis. Nesse caso nao
   * fazemos nenhuma requisicao ao TMDB nem ao indice de personagens.
   */
  if (usersOnly) {
    if (!supabase) {
      return NextResponse.json({ query: rawQuery, suggestions: [] });
    }

    const safeQuery = q.replace(/[,%()]/g, "");
    const { data } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url")
      .not("username", "is", null)
      .or(
        `username.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`,
      )
      .limit(10);

    const normalizedQuery = normalize(q);
    const suggestions = [...(data || [])]
      .sort((a: any, b: any) => {
        const score = (profile: any) =>
          normalize(profile.username || "") === normalizedQuery
            ? 3
            : normalize(profile.display_name || "") === normalizedQuery
              ? 2
              : normalize(profile.username || "").startsWith(normalizedQuery)
                ? 1
                : 0;
        return score(b) - score(a);
      })
      .map((profile: any) => ({
        kind: "user",
        id: profile.id,
        name: profile.display_name || profile.username,
        username: profile.username,
        avatar_url: profile.avatar_url,
        href: `/u/${profile.username}`,
      }));

    return NextResponse.json(
      { query: rawQuery, suggestions },
      {
        headers: {
          "Cache-Control":
            "public, max-age=30, s-maxage=120, stale-while-revalidate=600",
        },
      },
    );
  }

  const [
    multi,
    collectionSearch,
    personGroups,
    characterSearch,
    userSearch,
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

      supabase
        ? supabase.rpc("search_v4_characters", {
            query_text: q,
            result_limit: 5,
          })
        : Promise.resolve({ data: [], error: null }),
      supabase
        ? supabase.from("profiles").select("id,username,display_name,avatar_url").or(`username.ilike.%${q.replace(/[,%()]/g, "")}%,display_name.ilike.%${q.replace(/[,%()]/g, "")}%`).limit(4)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const suggestions:
    any[] =
    [];

  const normalizedUserQuery = normalize(q);
  const sortedUsers = [...(userSearch.data || [])].sort((a: any, b: any) => {
    const score = (profile: any) => normalize(profile.username || "") === normalizedUserQuery ? 3 : normalize(profile.display_name || "") === normalizedUserQuery ? 2 : normalize(profile.username || "").startsWith(normalizedUserQuery) ? 1 : 0;
    return score(b) - score(a);
  });
  for (const profile of sortedUsers) {
    suggestions.push({ kind: "user", id: profile.id, name: profile.display_name || profile.username, username: profile.username, avatar_url: profile.avatar_url, href: `/u/${profile.username}` });
  }

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

  let relatedCharacterMedia: any[] = [];

  if (characterRows.length > 0 && supabase) {
    const bestName =
      characterRows[
        0
      ]
        .character_name;

    const { data: mediaRows } = await supabase.rpc(
      "search_v4_character_media",
      { target_character_id: characterRows[0].character_id },
    );

    relatedCharacterMedia = Array.isArray(mediaRows)
      ? [...mediaRows]
          .sort((a: any, b: any) => Number(b.popularity || 0) - Number(a.popularity || 0))
          .slice(0, 3)
      : [];

    suggestions.push({
      kind:
        "character",

      name:
        bestName,

      matched:
        q,

      count:
        Number(characterRows[0].media_count || relatedCharacterMedia.length),

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

    for (const media of relatedCharacterMedia) {
      const alreadyIncluded = suggestions.some(
        (item) =>
          item.kind === "media" &&
          item.id === media.tmdb_id &&
          item.media_type === media.media_type,
      );

      if (!alreadyIncluded) {
        suggestions.push({
          kind: "media",
          id: media.tmdb_id,
          media_type: media.media_type,
          title: media.media_title,
          poster_path: null,
          reason: `Com ${bestName}`,
        });
      }
    }
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

  const hasExactCharacter =
    characterRows.some(
      (item: any) =>
        normalize(item.character_name || "") ===
        normalize(q)
    );

  const resolvedSuggestions =
    hasExactCharacter
      ? suggestions.filter(
          (item) =>
            item.kind !== "person"
        )
      : suggestions;

  return NextResponse.json(
    {
      query:
        q,

      suggestions:
        resolvedSuggestions.slice(
          0,
          10
        ),
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=600, stale-while-revalidate=86400",
      },
    }
  );
}
