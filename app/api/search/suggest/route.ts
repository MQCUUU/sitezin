import {
  NextRequest,
  NextResponse,
} from "next/server";

import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "@/lib/db/neon";
import { createUpstreamLog, sqlCallName, type UpstreamLog } from "@/lib/search/upstream";
import { isSelfPortrayal, rankTitles } from "@/lib/search/rank";
import { needsPersonVariants, personVariantsFor, PRIMARY_TIMEOUT_MS, SECONDARY_TIMEOUT_MS } from "@/lib/search/progressive";

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
    > = {},
  timeoutMs = PRIMARY_TIMEOUT_MS
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

  const log = upstream.getStore();
  // V3.2: timeout por fonte; falha/timeout degrada para "sem resultados dessa fonte" (nunca 500).
  const doFetch = async () => {
    const response = await fetch(
      `${TMDB_BASE}${path}?${qs.toString()}`,
      {
        next: {
          revalidate:
            900,
        },
        signal: AbortSignal.timeout(timeoutMs),
      }
    );

    if (!response.ok) throw new Error(`tmdb ${response.status}`);

    return response.json();
  };

  try {
    return log ? await log.track(`tmdb:${path}`, doFetch) : await doFetch();
  } catch {
    return null;
  }
}

/*
 * V3.2 — cada chamada externa (TMDB) e local (SQL) desta requisição vai no
 * Server-Timing (lib/search/upstream.ts): auditoria da busca fria/quente.
 */
const upstream = new AsyncLocalStorage<UpstreamLog>();

function trackedDb() {
  const sql = getDb();
  const log = upstream.getStore();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((strings: TemplateStringsArray, ...values: any[]) =>
    log ? log.track(sqlCallName(strings), () => sql(strings, ...values)) : sql(strings, ...values)) as typeof sql;
}

export async function GET(req: NextRequest) {
  const log = createUpstreamLog();
  const started = performance.now();
  const response = await upstream.run(log, () => handle(req));

  response.headers.set("Server-Timing", log.header(performance.now() - started));

  return response;
}

async function handle(
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

  // Busca via Neon PostgreSQL trackedDb()
/*
   * @username e uma intencao explicita de procurar perfis. Nesse caso nao
   * fazemos nenhuma requisicao ao TMDB nem ao indice de personagens.
   */
  if (usersOnly) {
    const sql = trackedDb();
    const safeQuery = q.replace(/[,%()]/g, "");
    const pattern = `%${safeQuery}%`;
    const data = await sql`
      SELECT id, username, display_name, avatar_url
      FROM public.profiles
      WHERE username IS NOT NULL
        AND (username ILIKE ${pattern} OR display_name ILIKE ${pattern})
      LIMIT 10
    `;

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
        id: profile.username,
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

  /*
   * V3.2 — estratégia progressiva (lib/search/progressive.ts). As fontes TMDB
   * e as locais (personagens, usuários) correm em paralelo; a 2ª tentativa de
   * pessoa (variantes) só dispara quando a 1ª não trouxe título exato, e
   * corre enquanto o SQL ainda responde.
   */
  const tmdbSources = (async () => {
    const [multi, primaryPeople] = await Promise.all([
      tmdb("/search/multi", { query: q, include_adult: "false" }),
      tmdb("/search/person", { query: q, include_adult: "false" }),
    ]);
    const multiResults = Array.isArray(multi?.results) ? multi.results : [];
    const firstPeople = [
      ...multiResults.filter((item: any) => item.media_type === "person"),
      ...(Array.isArray(primaryPeople?.results) ? primaryPeople.results : []),
    ];
    const variants = needsPersonVariants(q, multiResults) ? personVariantsFor(q) : [];
    const variantGroups = await Promise.all(
      variants.map((query) => tmdb("/search/person", { query, include_adult: "false" }, SECONDARY_TIMEOUT_MS))
    );

    return { multi, personGroups: [{ results: firstPeople }, ...variantGroups] };
  })();

  const [
    { multi, personGroups },
    collectionSearch,
    characterSearch,
    userSearch,
  ] =
    await Promise.all([
      tmdbSources,

      tmdb(
        "/search/collection",
        {
          query:
            q,

          include_adult:
            "false",
        },
        SECONDARY_TIMEOUT_MS
      ),

      (async () => {
        try {
          const sql = trackedDb();
          const rows = await sql`
            SELECT character_id, character_name, normalized_name, name_similarity, match_kind,
                   media_count, max_media_popularity, avg_media_popularity, sum_media_popularity, entity_score
            FROM public.search_v4_characters(${q}, 5)
          `;
          return { data: rows || [], error: null };
        } catch (e: any) {
          return { data: [], error: e };
        }
      })(),
      (async () => {
        try {
          const sql = trackedDb();
          const safeQuery = q.replace(/[,%()]/g, "");
          const pattern = `%${safeQuery}%`;
          const rows = await sql`
            SELECT id, username, display_name, avatar_url
            FROM public.profiles
            WHERE username IS NOT NULL
              AND (username ILIKE ${pattern} OR display_name ILIKE ${pattern})
            LIMIT 4
          `;
          return { data: rows || [], error: null };
        } catch (e: any) {
          return { data: [], error: e };
        }
      })(),
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
    suggestions.push({ kind: "user", id: profile.username, name: profile.display_name || profile.username, username: profile.username, avatar_url: profile.avatar_url, href: `/u/${profile.username}` });
  }

  /*
   * 1. Títulos diretos.
   */
  // V3.2: mesma relevância da página completa (lib/search/rank.ts) sobre a página do TMDB, sem duplicatas.
  const direct =
    rankTitles(
      q,
      Array.isArray(
        multi?.results
      )
        ? multi.results
        : []
    ).map(({ _score, ...item }) => item);

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

  if (characterRows.length > 0) {
    const bestName =
      characterRows[
        0
      ]
        .character_name;

    const sql = trackedDb();
    const mediaRows = await sql`
      SELECT media_type, tmdb_id, media_title, character_name, person_name, popularity
      FROM public.search_v4_character_media(${characterRows[0].character_id})
    `;

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

  /*
   * Personagem exato esconde pessoas homônimas obscuras ("Walter White"). V3.2:
   * exceto quando é a PRÓPRIA pessoa conhecida fazendo ela mesma ("Tom
   * Hanks" em Os Simpsons) — aí a pessoa fica e o personagem sai.
   */
  const knownPeople = personGroups.flatMap((group: any) => (Array.isArray(group?.results) ? group.results : []));
  const selfPortrayal = characterRows.some((item: any) => isSelfPortrayal(q, item.character_name, knownPeople));

  const resolvedSuggestions =
    selfPortrayal
      ? suggestions.filter((item) => item.kind !== "character" && !(item.reason && String(item.reason).startsWith("Com ")))
      : hasExactCharacter
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
