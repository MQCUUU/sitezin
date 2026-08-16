import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

dotenv.config({
  path: ".env.local",
  override: true,
});

/*
 * ============================================================
 * MYCATALOG UNIVERSAL SEARCH INDEXER V4.3 FAST
 * ============================================================
 *
 * Indexa:
 * - mídia
 * - pessoas
 * - personagens
 * - relações pessoa -> mídia
 * - relações personagem -> mídia
 * - controle incremental
 *
 * Compacto:
 * - 1 mídia armazenada 1x
 * - 1 pessoa armazenada 1x
 * - 1 personagem armazenado 1x
 *
 * Economia:
 * - máximo de 30 atores por título
 * - sem producers
 * - sem executive producers
 * - sem crew irrelevante
 * ============================================================
 */

const TMDB_API_KEY =
  process.env.TMDB_API_KEY;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TMDB_API_KEY) {
  throw new Error(
    "TMDB_API_KEY não encontrada."
  );
}

if (!SUPABASE_URL) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL não encontrada."
  );
}

if (!SERVICE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY não encontrada."
  );
}

/*
 * ============================================================
 * CONFIGURAÇÃO
 * ============================================================
 */

const TMDB_BASE =
  "https://api.themoviedb.org/3";

const VERSION = 43;

const MOVIE_PAGES =
  Math.max(
    1,
    Math.min(
      500,
      Number(
        process.env.V4_MOVIE_PAGES ||
          250
      )
    )
  );

const TV_PAGES =
  Math.max(
    1,
    Math.min(
      500,
      Number(
        process.env.V4_TV_PAGES ||
          250
      )
    )
  );

const CONCURRENCY =
  Math.max(
    1,
    Math.min(
      12,
      Number(
        process.env.V4_CONCURRENCY ||
          8
      )
    )
  );

const DB_BATCH =
  Math.max(
    100,
    Math.min(
      3000,
      Number(
        process.env.V4_DB_BATCH_SIZE ||
          1000
      )
    )
  );

const MAX_CAST_PER_TITLE =
  Math.max(
    10,
    Math.min(
      50,
      Number(
        process.env.V4_MAX_CAST ||
          30
      )
    )
  );

const PAGE_BLOCK =
  Math.max(
    1,
    Math.min(
      20,
      Number(
        process.env.V4_PAGE_BLOCK ||
          5
      )
    )
  );

const SUPABASE_TIMEOUT_MS =
  Math.max(
    10000,
    Number(
      process.env.V4_SUPABASE_TIMEOUT_MS ||
        120000
    )
  );

const CHECKPOINT_FILE =
  "scripts/.universal-index-v43.json";

/*
 * ============================================================
 * SUPABASE
 * ============================================================
 */

async function fetchWithTimeout(
  input,
  init = {}
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(
          new Error(
            "Supabase request timeout"
          )
        ),
      SUPABASE_TIMEOUT_MS
    );

  try {
    return await fetch(
      input,
      {
        ...init,
        signal:
          controller.signal,
      }
    );
  } finally {
    clearTimeout(
      timeout
    );
  }
}

const supabase =
  createClient(
    SUPABASE_URL,
    SERVICE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },

      global: {
        fetch:
          fetchWithTimeout,
      },
    }
  );

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function validId(value) {
  const id =
    Number(value);

  return (
    Number.isInteger(id) &&
    id > 0
  );
}

function unique(
  values,
  makeKey
) {
  const map =
    new Map();

  for (
    const value of values
  ) {
    map.set(
      makeKey(value),
      value
    );
  }

  return Array.from(
    map.values()
  );
}

/*
 * ============================================================
 * PERSONAGENS / ALIASES
 * ============================================================
 *
 * Ex:
 *
 * Clark Kent / Superman
 *
 * vira:
 *
 * Clark Kent / Superman
 * Clark Kent
 * Superman
 * ============================================================
 */

function characterAliases(value) {
  const source =
    String(value || "")
      .replace(
        /\((?:voice|uncredited|archive footage|credit only)\)/gi,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (!source) {
    return [];
  }

  const aliases =
    new Set([
      source,
    ]);

  source
    .split(
      /\s*(?:\/|\||;)\s*/
    )
    .map(
      (item) =>
        item.trim()
    )
    .filter(
      (item) =>
        item.length >= 2
    )
    .forEach(
      (item) =>
        aliases.add(item)
    );

  return Array.from(
    aliases
  );
}

/*
 * ============================================================
 * CHECKPOINT
 * ============================================================
 */

function defaultCheckpoint() {
  return {
    moviePage: 1,
    tvPage: 1,

    movieFinished: false,
    tvFinished: false,

    processed: 0,

    completed: false,

    updatedAt: null,
  };
}

function loadCheckpoint() {
  try {
    if (
      !fs.existsSync(
        CHECKPOINT_FILE
      )
    ) {
      return defaultCheckpoint();
    }

    return {
      ...defaultCheckpoint(),

      ...JSON.parse(
        fs.readFileSync(
          CHECKPOINT_FILE,
          "utf8"
        )
      ),
    };
  } catch {
    return defaultCheckpoint();
  }
}

function saveCheckpoint(value) {
  value.updatedAt =
    new Date()
      .toISOString();

  fs.writeFileSync(
    CHECKPOINT_FILE,

    JSON.stringify(
      value,
      null,
      2
    ),

    "utf8"
  );
}

/*
 * ============================================================
 * RETRY
 * ============================================================
 */

async function retry(
  callback,
  label,
  attempts = 4
) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    try {
      return await callback();
    } catch (error) {
      lastError =
        error;

      console.error(
        `⚠ ${label} (${attempt}/${attempts})`
      );

      if (
        error instanceof Error
      ) {
        console.error(
          `   ${error.message}`
        );
      }

      if (
        attempt < attempts
      ) {
        await sleep(
          attempt * 1000
        );
      }
    }
  }

  throw lastError;
}

/*
 * ============================================================
 * TMDB
 * ============================================================
 */

async function tmdb(path) {
  const separator =
    path.includes("?")
      ? "&"
      : "?";

  const url =
    `${TMDB_BASE}${path}` +
    `${separator}api_key=${encodeURIComponent(
      TMDB_API_KEY
    )}` +
    `&language=pt-BR`;

  return retry(
    async () => {
      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () =>
            controller.abort(),
          30000
        );

      try {
        const response =
          await fetch(
            url,
            {
              signal:
                controller.signal,

              headers: {
                accept:
                  "application/json",
              },
            }
          );

        if (
          response.status === 429
        ) {
          await sleep(2500);

          throw new Error(
            "TMDB rate limit"
          );
        }

        if (
          !response.ok
        ) {
          throw new Error(
            `TMDB ${response.status}: ${path}`
          );
        }

        return await response.json();
      } finally {
        clearTimeout(
          timeout
        );
      }
    },

    `TMDB ${path}`
  );
}

async function discover(
  mediaType,
  page
) {
  return tmdb(
    `/discover/${mediaType}` +
      `?page=${page}` +
      `&sort_by=popularity.desc` +
      `&include_adult=false`
  );
}

/*
 * ============================================================
 * BULK UPSERT
 * ============================================================
 */

async function bulkUpsert(
  table,
  rows,
  onConflict
) {
  if (
    !rows ||
    rows.length === 0
  ) {
    return;
  }

  for (
    let start = 0;
    start < rows.length;
    start += DB_BATCH
  ) {
    const chunk =
      rows.slice(
        start,
        start +
          DB_BATCH
      );

    await retry(
      async () => {
        const {
          error,
        } =
          await supabase
            .from(table)
            .upsert(
              chunk,
              {
                onConflict,
              }
            );

        if (error) {
          throw new Error(
            `${table}: ${error.message}`
          );
        }
      },
      `${table} ${start + 1}-${Math.min(
        start + chunk.length,
        rows.length
      )}`,
      4
    );
  }
}

/*
 * ============================================================
 * FUNÇÕES RELEVANTES DE CREW
 * ============================================================
 *
 * role:
 *
 * 1 = Actor
 * 2 = Director
 * 3 = Writer
 * 4 = Creator
 * 5 = Composer
 * ============================================================
 */

function movieCrewRoles(person) {
  const job =
    String(
      person?.job ||
        ""
    ).trim();

  switch (job) {
    case "Director":
      return [2];

    case "Writer":
    case "Screenplay":
    case "Story":
    case "Teleplay":
    case "Novel":
    case "Characters":
      return [3];

    case "Original Music Composer":
      return [5];

    default:
      return [];
  }
}

function tvCrewRoles(person) {
  const roles =
    new Set();

  const jobs =
    Array.isArray(
      person?.jobs
    )
      ? person.jobs
      : [];

  for (
    const value of jobs
  ) {
    const job =
      String(
        value?.job ||
          ""
      ).trim();

    switch (job) {
      case "Director":
        roles.add(2);
        break;

      case "Writer":
      case "Screenplay":
      case "Story":
      case "Teleplay":
      case "Novel":
      case "Characters":
        roles.add(3);
        break;

      case "Original Music Composer":
        roles.add(5);
        break;
    }
  }

  return Array.from(
    roles
  );
}

/*
 * ============================================================
 * CARREGAR UM TÍTULO
 * ============================================================
 */

async function loadTitle(
  mediaType,
  item
) {
  const tmdbId =
    Number(item.id);

  if (
    !validId(tmdbId)
  ) {
    return null;
  }

  const title =
    String(
      mediaType === "movie"
        ? item.title || ""
        : item.name || ""
    ).trim();

  if (!title) {
    return null;
  }

  /*
   * FILME
   */

  if (
    mediaType === "movie"
  ) {
    const credits =
      await tmdb(
        `/movie/${tmdbId}/credits`
      );

    return {
      mediaType,
      tmdbId,
      title,

      popularity:
        Number(
          item.popularity ||
            0
        ),

      cast:
        Array.isArray(
          credits?.cast
        )
          ? credits.cast
          : [],

      crew:
        Array.isArray(
          credits?.crew
        )
          ? credits.crew
          : [],

      creators: [],
    };
  }

  /*
   * SÉRIE
   *
   * aggregate_credits é melhor para série,
   * pois inclui papéis ao longo das temporadas.
   */

  const [
    details,
    credits,
  ] =
    await Promise.all([
      tmdb(
        `/tv/${tmdbId}`
      ),

      tmdb(
        `/tv/${tmdbId}/aggregate_credits`
      ),
    ]);

  return {
    mediaType,
    tmdbId,
    title,

    popularity:
      Number(
        item.popularity ||
          0
      ),

    cast:
      Array.isArray(
        credits?.cast
      )
        ? credits.cast
        : [],

    crew:
      Array.isArray(
        credits?.crew
      )
        ? credits.crew
        : [],

    creators:
      Array.isArray(
        details?.created_by
      )
        ? details.created_by
        : [],
  };
}

/*
 * ============================================================
 * CONCORRÊNCIA TMDB
 * ============================================================
 */

async function concurrentMap(
  items,
  callback
) {
  const results =
    new Array(
      items.length
    );

  let cursor = 0;

  const count =
    Math.min(
      CONCURRENCY,
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length: count,
      },

      async () => {
        while (true) {
          const index =
            cursor++;

          if (
            index >= items.length
          ) {
            return;
          }

          try {
            results[index] =
              await callback(
                items[index],
                index
              );
          } catch (error) {
            results[index] = {
              error,
              item:
                items[index],
            };
          }
        }
      }
    )
  );

  return results;
}

/*
 * ============================================================
 * CONSTRUIR DADOS DE UMA PÁGINA
 * ============================================================
 */

function buildPageData(
  mediaType,
  results
) {
  const media = [];

  const people = [];

  const peopleMedia = [];

  const characters =
    new Map();

  const rawCharacterMedia =
    [];

  const indexed = [];

  for (
    const result of results
  ) {
    if (
      !result ||
      result.error
    ) {
      continue;
    }

    /*
     * ========================================================
     * MEDIA
     * ========================================================
     */

    media.push({
      media_type:
        mediaType,

      tmdb_id:
        result.tmdbId,

      title:
        result.title,

      popularity:
        result.popularity,
    });

    /*
     * ========================================================
     * CAST
     * ========================================================
     *
     * SOMENTE os primeiros 30 por padrão.
     */

    const cast =
      result.cast.slice(
        0,
        MAX_CAST_PER_TITLE
      );

    for (
      const person of cast
    ) {
      if (
        !validId(
          person?.id
        ) ||
        !person?.name
      ) {
        continue;
      }

      const personId =
        Number(
          person.id
        );

      const personName =
        String(
          person.name
        ).trim();

      const normalizedPerson =
        normalizeName(
          personName
        );

      if (
        !normalizedPerson
      ) {
        continue;
      }

      /*
       * Pessoa única.
       */

      people.push({
        person_id:
          personId,

        name:
          personName,

        normalized_name:
          normalizedPerson,
      });

      /*
       * Ator -> mídia.
       */

      peopleMedia.push({
        person_id:
          personId,

        media_type:
          mediaType,

        tmdb_id:
          result.tmdbId,

        role: 1,
      });

      /*
       * ======================================================
       * PERSONAGENS
       * ======================================================
       */

      let characterNames =
        [];

      if (
        mediaType === "movie"
      ) {
        characterNames =
          characterAliases(
            person.character
          );
      } else {
        const roles =
          Array.isArray(
            person.roles
          )
            ? person.roles
            : [];

        characterNames =
          roles.flatMap(
            (role) =>
              characterAliases(
                role.character
              )
          );
      }

      for (
        const characterName of
          characterNames
      ) {
        const normalized =
          normalizeName(
            characterName
          );

        if (
          !normalized
        ) {
          continue;
        }

        /*
         * Personagem armazenado UMA vez.
         */

        if (
          !characters.has(
            normalized
          )
        ) {
          characters.set(
            normalized,
            {
              name:
                characterName,

              normalized_name:
                normalized,
            }
          );
        }

        /*
         * Relação ainda usa normalized_name
         * temporariamente.
         *
         * Depois buscamos o ID real.
         */

        rawCharacterMedia.push({
          normalized_name:
            normalized,

          media_type:
            mediaType,

          tmdb_id:
            result.tmdbId,

          person_id:
            personId,
        });
      }
    }

    /*
     * ========================================================
     * CREW
     * ========================================================
     */

    for (
      const person of
        result.crew
    ) {
      if (
        !validId(
          person?.id
        ) ||
        !person?.name
      ) {
        continue;
      }

      const roles =
        mediaType === "movie"
          ? movieCrewRoles(
              person
            )
          : tvCrewRoles(
              person
            );

      if (
        roles.length === 0
      ) {
        continue;
      }

      const personId =
        Number(
          person.id
        );

      const personName =
        String(
          person.name
        ).trim();

      const normalized =
        normalizeName(
          personName
        );

      if (!normalized) {
        continue;
      }

      people.push({
        person_id:
          personId,

        name:
          personName,

        normalized_name:
          normalized,
      });

      for (
        const role of roles
      ) {
        peopleMedia.push({
          person_id:
            personId,

          media_type:
            mediaType,

          tmdb_id:
            result.tmdbId,

          role,
        });
      }
    }

    /*
     * ========================================================
     * CRIADORES DE SÉRIES
     * ========================================================
     */

    for (
      const person of
        result.creators
    ) {
      if (
        !validId(
          person?.id
        ) ||
        !person?.name
      ) {
        continue;
      }

      const personId =
        Number(
          person.id
        );

      const personName =
        String(
          person.name
        ).trim();

      const normalized =
        normalizeName(
          personName
        );

      if (!normalized) {
        continue;
      }

      people.push({
        person_id:
          personId,

        name:
          personName,

        normalized_name:
          normalized,
      });

      peopleMedia.push({
        person_id:
          personId,

        media_type:
          mediaType,

        tmdb_id:
          result.tmdbId,

        role: 4,
      });
    }

    /*
     * Só será salvo no FINAL.
     */

    indexed.push({
      media_type:
        mediaType,

      tmdb_id:
        result.tmdbId,

      version:
        VERSION,

      indexed_at:
        new Date()
          .toISOString(),
    });
  }

  return {
    media:
      unique(
        media,

        (x) =>
          `${x.media_type}:${x.tmdb_id}`
      ),

    people:
      unique(
        people,

        (x) =>
          String(
            x.person_id
          )
      ),

    peopleMedia:
      unique(
        peopleMedia,

        (x) =>
          [
            x.person_id,
            x.media_type,
            x.tmdb_id,
            x.role,
          ].join(":")
      ),

    characters:
      Array.from(
        characters.values()
      ),

    rawCharacterMedia:
      unique(
        rawCharacterMedia,

        (x) =>
          [
            x.normalized_name,
            x.media_type,
            x.tmdb_id,
            x.person_id,
          ].join(":")
      ),

    indexed:
      unique(
        indexed,

        (x) =>
          `${x.media_type}:${x.tmdb_id}`
      ),
  };
}

/*
 * ============================================================
 * BUSCAR IDs REAIS DOS PERSONAGENS
 * ============================================================
 */

async function loadCharacterIds(
  characters
) {
  const map =
    new Map();

  const values =
    characters
      .map(
        (item) =>
          item.normalized_name
      )
      .filter(Boolean);

  for (
    let start = 0;
    start < values.length;
    start += 100
  ) {
    const chunk =
      values.slice(
        start,
        start + 100
      );

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "search_characters"
        )
        .select(
          "id,normalized_name"
        )
        .in(
          "normalized_name",
          chunk
        );

    if (error) {
      throw new Error(
        `search_characters lookup: ${error.message}`
      );
    }

    for (
      const value of
        data || []
    ) {
      map.set(
        value.normalized_name,

        Number(
          value.id
        )
      );
    }
  }

  return map;
}

/*
 * ============================================================
 * SALVAR UMA PÁGINA
 * ============================================================
 */

async function savePage(
  mediaType,
  results
) {
  const data =
    buildPageData(
      mediaType,
      results
    );

  /*
   * 1. MEDIA
   */

  await bulkUpsert(
    "search_media",
    data.media,
    "media_type,tmdb_id"
  );

  /*
   * 2. PEOPLE
   */

  await bulkUpsert(
    "search_people",
    data.people,
    "person_id"
  );

  /*
   * Lista de pessoas válidas dessa página.
   */

  const personIds =
    new Set(
      data.people.map(
        (person) =>
          Number(
            person.person_id
          )
      )
    );

  /*
   * 3. PEOPLE -> MEDIA
   *
   * Proteção contra FK.
   */

  const safePeopleMedia =
    data.peopleMedia.filter(
      (item) =>
        personIds.has(
          Number(
            item.person_id
          )
        )
    );

  await bulkUpsert(
    "search_people_media",
    safePeopleMedia,
    "person_id,media_type,tmdb_id,role"
  );

  /*
   * 4. CHARACTERS
   */

  await bulkUpsert(
    "search_characters",
    data.characters,
    "normalized_name"
  );

  /*
   * 5. BUSCAR CHARACTER IDS
   */

  const characterIds =
    await loadCharacterIds(
      data.characters
    );

  /*
   * 6. CHARACTER -> MEDIA
   */

  const characterMedia =
    [];

  for (
    const relation of
      data.rawCharacterMedia
  ) {
    /*
     * FK de pessoa.
     */

    if (
      !personIds.has(
        Number(
          relation.person_id
        )
      )
    ) {
      continue;
    }

    const characterId =
      characterIds.get(
        relation.normalized_name
      );

    if (
      !characterId
    ) {
      continue;
    }

    characterMedia.push({
      character_id:
        characterId,

      media_type:
        relation.media_type,

      tmdb_id:
        relation.tmdb_id,

      person_id:
        Number(
          relation.person_id
        ),
    });
  }

  const uniqueCharacterMedia =
    unique(
      characterMedia,

      (item) =>
        [
          item.character_id,
          item.media_type,
          item.tmdb_id,
          item.person_id,
        ].join(":")
    );

  await bulkUpsert(
    "search_character_media",
    uniqueCharacterMedia,
    "character_id,media_type,tmdb_id,person_id"
  );

  /*
   * ========================================================
   * 7. MARCAR COMO INDEXADO
   * ========================================================
   *
   * SEMPRE por último.
   */

  await bulkUpsert(
    "search_indexed_media",
    data.indexed,
    "media_type,tmdb_id"
  );

  return {
    media:
      data.media.length,

    people:
      data.people.length,

    characters:
      data.characters.length,

    peopleMedia:
      safePeopleMedia.length,

    characterMedia:
      uniqueCharacterMedia.length,
  };
}

/*
 * ============================================================
 * PROCESSAR PÁGINA
 * ============================================================
 */

async function processPage(
  mediaType,
  page
) {
  const discovered =
    await discover(
      mediaType,
      page
    );

  const items =
    Array.isArray(
      discovered?.results
    )
      ? discovered.results
      : [];

  if (
    items.length === 0
  ) {
    return {
      indexed: 0,
      failed: 0,
    };
  }

  /*
   * ========================================================
   * DESCOBRIR OS JÁ INDEXADOS EM UMA ÚNICA QUERY
   * ========================================================
   */

  const ids =
    items
      .map(
        (item) =>
          Number(
            item.id
          )
      )
      .filter(
        validId
      );

  const {
    data:
      alreadyIndexed,
    error:
      indexedError,
  } =
    await supabase
      .from(
        "search_indexed_media"
      )
      .select(
        "tmdb_id"
      )
      .eq(
        "media_type",
        mediaType
      )
      .gte(
        "version",
        VERSION
      )
      .in(
        "tmdb_id",
        ids
      );

  if (
    indexedError
  ) {
    throw new Error(
      `search_indexed_media: ${indexedError.message}`
    );
  }

  const done =
    new Set(
      (
        alreadyIndexed ||
        []
      ).map(
        (item) =>
          Number(
            item.tmdb_id
          )
      )
    );

  const pending =
    items.filter(
      (item) =>
        !done.has(
          Number(
            item.id
          )
        )
    );

  console.log(
    `📦 ${items.length} títulos · ${pending.length} novos`
  );

  /*
   * Página inteira já indexada.
   */

  if (
    pending.length === 0
  ) {
    return {
      indexed: 0,
      failed: 0,
    };
  }

  let finished = 0;

  /*
   * ========================================================
   * TMDB EM PARALELO
   * ========================================================
   */

  const results =
    await concurrentMap(
      pending,

      async (
        item,
        index
      ) => {
        const value =
          await loadTitle(
            mediaType,
            item
          );

        finished++;

        if (
          finished % 20 === 0 ||
          finished === pending.length
        ) {
          console.log(
            `   TMDB ${finished}/${pending.length}`
          );
        }

        return value;
      }
    );

  let failed = 0;

  for (
    const value of results
  ) {
    if (
      value?.error
    ) {
      failed++;

      console.error(
        "❌ título:",
        value.item?.id,
        value.error
      );
    }
  }

  const valid =
    results.filter(
      (value) =>
        value &&
        !value.error
    );

  if (
    valid.length === 0
  ) {
    return {
      indexed: 0,
      failed,
    };
  }

  /*
   * ========================================================
   * SALVAR TUDO EM BULK
   * ========================================================
   */

  console.log(
    "💾 Salvando no Supabase..."
  );

  const saved =
    await retry(
      () =>
        savePage(
          mediaType,
          valid
        ),

      `Salvar ${mediaType} página ${page}`,

      4
    );

  console.log(
    `   mídia: ${saved.media}`
  );

  console.log(
    `   pessoas: ${saved.people}`
  );

  console.log(
    `   personagens: ${saved.characters}`
  );

  console.log(
    `   relações pessoas: ${saved.peopleMedia}`
  );

  console.log(
    `   relações personagens: ${saved.characterMedia}`
  );

  return {
    indexed:
      saved.media,

    failed,
  };
}

/*
 * ============================================================
 * ESTATÍSTICAS
 * ============================================================
 */

async function countTable(
  table
) {
  const {
    count,
    error,
  } =
    await supabase
      .from(table)
      .select(
        "*",
        {
          count: "exact",
          head: true,
        }
      );

  if (error) {
    return null;
  }

  return Number(
    count || 0
  );
}

async function printStats() {
  const [
    media,
    people,
    characters,
    peopleMedia,
    characterMedia,
    indexed,
  ] =
    await Promise.all([
      countTable(
        "search_media"
      ),

      countTable(
        "search_people"
      ),

      countTable(
        "search_characters"
      ),

      countTable(
        "search_people_media"
      ),

      countTable(
        "search_character_media"
      ),

      countTable(
        "search_indexed_media"
      ),
    ]);

  console.log("");
  console.log(
    "========== BANCO V4.3 FAST =========="
  );

  console.log(
    `Títulos: ${media ?? "?"}`
  );

  console.log(
    `Pessoas: ${people ?? "?"}`
  );

  console.log(
    `Personagens: ${characters ?? "?"}`
  );

  console.log(
    `People links: ${peopleMedia ?? "?"}`
  );

  console.log(
    `Character links: ${characterMedia ?? "?"}`
  );

  console.log(
    `Indexados: ${indexed ?? "?"}`
  );

  console.log(
    "================================"
  );
}

/*
 * ============================================================
 * PROCESSAR FILME/SÉRIE
 * ============================================================
 */

async function processType({
  mediaType,
  startPage,
  maxPages,
  checkpoint,
}) {
  let page =
    Math.max(
      1,
      startPage
    );

  let pagesSinceCheckpoint =
    0;

  let nextCheckpointPage =
    page;

  let indexedSinceCheckpoint =
    0;

  while (
    page <= maxPages
  ) {
    const start =
      Date.now();

    const result =
      await processPage(
        mediaType,
        page
      );

    indexedSinceCheckpoint +=
      result.indexed;

    pagesSinceCheckpoint++;

    nextCheckpointPage =
      page + 1;

    console.log(
      `✅ ${
        mediaType === "movie"
          ? "FILME"
          : "SÉRIE"
      } ${page}/${maxPages} · ${result.indexed} novos · ${result.failed} erros · ${(
        (
          Date.now() -
          start
        ) /
        1000
      ).toFixed(1)}s`
    );

    if (
      pagesSinceCheckpoint >= PAGE_BLOCK ||
      page === maxPages
    ) {
      if (
        mediaType === "movie"
      ) {
        checkpoint.moviePage =
          nextCheckpointPage;
      } else {
        checkpoint.tvPage =
          nextCheckpointPage;
      }

      checkpoint.processed +=
        indexedSinceCheckpoint;

      saveCheckpoint(
        checkpoint
      );

      console.log(
        `💾 checkpoint salvo → próxima página ${nextCheckpointPage}`
      );

      pagesSinceCheckpoint =
        0;

      indexedSinceCheckpoint =
        0;
    }

    if (
      page % 25 === 0
    ) {
      await printStats();
    }

    page++;

    await sleep(50);
  }

  if (
    mediaType === "movie"
  ) {
    checkpoint.movieFinished =
      true;

    checkpoint.moviePage =
      maxPages + 1;
  } else {
    checkpoint.tvFinished =
      true;

    checkpoint.tvPage =
      maxPages + 1;
  }

  saveCheckpoint(
    checkpoint
  );
}

/*
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  console.log("");
  console.log(
    "=============================================="
  );

  console.log(
    " MyCatalog Universal Index V4.3 FAST"
  );

  console.log(
    "=============================================="
  );

  console.log(
    `Filmes: ${MOVIE_PAGES} páginas`
  );

  console.log(
    `Séries: ${TV_PAGES} páginas`
  );

  console.log(
    `Cast por título: ${MAX_CAST_PER_TITLE}`
  );

  console.log(
    `Concorrência: ${CONCURRENCY}`
  );

  console.log(
    `DB batch: ${DB_BATCH}`
  );

  console.log(
    `Checkpoint: a cada ${PAGE_BLOCK} páginas`
  );

  console.log(
    `Timeout Supabase: ${Math.round(
      SUPABASE_TIMEOUT_MS /
        1000
    )}s`
  );

  console.log("");

  const checkpoint =
    loadCheckpoint();

  console.log(
    `Retomando filmes: página ${checkpoint.moviePage}`
  );

  console.log(
    `Retomando séries: página ${checkpoint.tvPage}`
  );

  /*
   * Se aumentar número de páginas futuramente,
   * permite continuar.
   */

  if (
    checkpoint.moviePage <=
    MOVIE_PAGES
  ) {
    checkpoint.movieFinished =
      false;
  }

  if (
    checkpoint.tvPage <=
    TV_PAGES
  ) {
    checkpoint.tvFinished =
      false;
  }

  /*
   * FILMES
   */

  if (
    !checkpoint.movieFinished
  ) {
    await processType({
      mediaType: "movie",

      startPage:
        checkpoint.moviePage,

      maxPages:
        MOVIE_PAGES,

      checkpoint,
    });
  }

  /*
   * SÉRIES
   */

  if (
    !checkpoint.tvFinished
  ) {
    await processType({
      mediaType: "tv",

      startPage:
        checkpoint.tvPage,

      maxPages:
        TV_PAGES,

      checkpoint,
    });
  }

  checkpoint.completed =
    true;

  saveCheckpoint(
    checkpoint
  );

  console.log("");
  console.log(
    "=============================================="
  );

  console.log(
    " 🎉 INDEXAÇÃO CONCLUÍDA"
  );

  console.log(
    "=============================================="
  );

  await printStats();
}

/*
 * ============================================================
 * START
 * ============================================================
 */

main().catch(
  (error) => {
    console.error("");
    console.error(
      "❌ INDEXADOR PAROU"
    );

    console.error(error);

    console.error("");
    console.error(
      "Checkpoint preservado."
    );

    console.error(
      "Execute novamente após corrigir o erro."
    );

    process.exit(1);
  }
);