import {
  createHash,
} from "crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

const TMDB_BASE =
  "https://api.themoviedb.org/3";

const CACHE_DAYS =
  30;

type MediaType =
  | "movie"
  | "tv";

type CachedRef = {
  tmdb_id: number;
  media_type:
    MediaType;
  reason:
    string;
};

type GeminiRecommendation = {
  title: string;
  media_type:
    MediaType;
  year?:
    number | null;
  reason?:
    string;
};

/*
 * ==========================================
 * NORMALIZAÇÃO / HASH
 * ==========================================
 */

function normalizeQuery(
  value: string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function hashValue(
  value: string
) {
  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}

/*
 * Perguntas explicitamente ligadas ao perfil
 * usam cache pessoal.
 *
 * Perguntas gerais podem usar cache global
 * compartilhado por todos os usuários.
 */

function isPersonalizedPrompt(
  normalized:
    string
) {
  const patterns = [
    "meu gosto",
    "meus gostos",
    "minha biblioteca",
    "meus favoritos",
    "meus favorito",
    "minhas notas",
    "minha nota",
    "que eu gosto",
    "que eu gostei",
    "que eu assisti",
    "que ja assisti",
    "que eu vi",
    "baseado em mim",
    "baseado no meu",
    "baseado na minha",
    "para mim",
    "pra mim",
    "me recomenda",
    "me recomende",
    "recomenda pra mim",
  ];

  return patterns.some(
    (
      pattern
    ) =>
      normalized.includes(
        pattern
      )
  );
}

function buildProfileKey(
  library:
    any[]
) {
  const profile =
    library
      .filter(
        (
          item
        ) =>
          item?.media
            ?.tmdb_id &&
          item?.media
            ?.media_type
      )
      .map(
        (
          item
        ) => ({
          id:
            Number(
              item.media
                .tmdb_id
            ),
          type:
            item.media
              .media_type,
          status:
            item.status ||
            "",
          favorite:
            Boolean(
              item.favorite
            ),
          rating:
            item.personal_rating ===
              null ||
            item.personal_rating ===
              undefined
              ? null
              : Number(
                  item.personal_rating
                ),
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          `${a.type}-${a.id}`.localeCompare(
            `${b.type}-${b.id}`
          )
      );

  return hashValue(
    JSON.stringify(
      profile
    )
  );
}

/*
 * ==========================================
 * TMDB
 * ==========================================
 */

async function searchTmdb(
  title: string,
  type: MediaType,
  year?: number | null
) {
  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    return null;
  }

  const params =
    new URLSearchParams({
      api_key:
        apiKey,
      language:
        process.env.TMDB_LANGUAGE ||
        "pt-BR",
      query:
        title,
      include_adult:
        "false",
    });

  if (year) {
    params.set(
      type === "movie"
        ? "year"
        : "first_air_date_year",
      String(
        year
      )
    );
  }

  const response =
    await fetch(
      `${TMDB_BASE}/search/${type}?${params.toString()}`,
      {
        next: {
          revalidate:
            21600,
        },
      }
    );

  if (!response.ok) {
    return null;
  }

  const data =
    await response.json();

  return Array.isArray(
    data?.results
  )
    ? data.results[0] ||
        null
    : null;
}

async function hydrateTmdbRef(
  ref: CachedRef
) {
  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    return null;
  }

  const params =
    new URLSearchParams({
      api_key:
        apiKey,
      language:
        process.env.TMDB_LANGUAGE ||
        "pt-BR",
    });

  const response =
    await fetch(
      `${TMDB_BASE}/${ref.media_type}/${ref.tmdb_id}?${params.toString()}`,
      {
        next: {
          revalidate:
            21600,
        },
      }
    );

  if (!response.ok) {
    return null;
  }

  const item =
    await response.json();

  return {
    ...item,
    media_type:
      ref.media_type,
    reason:
      ref.reason,
  };
}

async function hydrateCachedRefs(
  refs: CachedRef[]
) {
  const items =
    await Promise.all(
      refs.map(
        hydrateTmdbRef
      )
    );

  return items.filter(
    Boolean
  );
}

/*
 * ==========================================
 * FALLBACK SEM IA
 * ==========================================
 */

async function buildFallback(
  library:
    any[],
  limit = 6
) {
  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {
    return [];
  }

  const seeds =
    library
      .filter(
        (
          item
        ) =>
          item?.media
            ?.tmdb_id &&
          item?.media
            ?.media_type &&
          (
            Number(
              item.personal_rating ||
                0
            ) >= 7 ||
            item.favorite
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          (
            Number(
              b.personal_rating ||
                0
            ) +
            (
              b.favorite
                ? 2
                : 0
            )
          ) -
          (
            Number(
              a.personal_rating ||
                0
            ) +
            (
              a.favorite
                ? 2
                : 0
            )
          )
      )
      .slice(
        0,
        4
      );

  const existing =
    new Set(
      library.map(
        (
          item
        ) =>
          `${item.media?.media_type}-${item.media?.tmdb_id}`
      )
    );

  const candidates:
    any[] =
    [];

  for (
    const seed
    of seeds
  ) {
    const media =
      seed.media;

    const response =
      await fetch(
        `${TMDB_BASE}/${media.media_type}/${media.tmdb_id}/recommendations?api_key=${encodeURIComponent(
          apiKey
        )}&language=${encodeURIComponent(
          process.env.TMDB_LANGUAGE ||
            "pt-BR"
        )}&page=1`,
        {
          next: {
            revalidate:
              21600,
          },
        }
      );

    if (!response.ok) {
      continue;
    }

    const data =
      await response.json();

    for (
      const item
      of (
        data?.results ||
        []
      )
    ) {
      const key =
        `${media.media_type}-${item.id}`;

      if (
        existing.has(
          key
        )
      ) {
        continue;
      }

      candidates.push({
        ...item,
        media_type:
          media.media_type,
        reason:
          `Parecido com ${media.title}`,
      });

      existing.add(
        key
      );

      if (
        candidates.length >=
        limit
      ) {
        return candidates;
      }
    }
  }

  return candidates;
}

/*
 * ==========================================
 * CACHE
 * ==========================================
 */

async function findCache({
  s,
  queryKey,
  scope,
  userId,
  profileKey,
}: {
  s: any;
  queryKey: string;
  scope:
    | "global"
    | "personalized";
  userId: string;
  profileKey:
    string | null;
}) {
  let query =
    s
      .from(
        "ai_recommendation_cache"
      )
      .select(
        `
        id,
        answer,
        result_refs,
        hit_count,
        expires_at
        `
      )
      .eq(
        "query_key",
        queryKey
      )
      .eq(
        "scope",
        scope
      )
      .gt(
        "expires_at",
        new Date()
          .toISOString()
      )
      .limit(
        1
      );

  if (
    scope ===
    "personalized"
  ) {
    query =
      query
        .eq(
          "user_id",
          userId
        )
        .eq(
          "profile_key",
          profileKey
        );
  }

  const {
    data,
    error,
  } =
    await query
      .maybeSingle();

  if (error) {
    console.error(
      "Erro ao consultar cache de IA:",
      error
    );

    return null;
  }

  return data ||
    null;
}

async function countCacheHit(
  s: any,
  cache:
    any
) {
  const nextCount =
    Number(
      cache.hit_count ||
        0
    ) + 1;

  await s
    .from(
      "ai_recommendation_cache"
    )
    .update({
      hit_count:
        nextCount,
      last_hit_at:
        new Date()
          .toISOString(),
    })
    .eq(
      "id",
      cache.id
    );

  return nextCount;
}

async function saveCache({
  s,
  userId,
  scope,
  queryKey,
  normalizedQuery,
  profileKey,
  answer,
  refs,
}: {
  s: any;
  userId: string;
  scope:
    | "global"
    | "personalized";
  queryKey: string;
  normalizedQuery:
    string;
  profileKey:
    string | null;
  answer:
    string;
  refs:
    CachedRef[];
}) {
  const expiresAt =
    new Date(
      Date.now() +
      CACHE_DAYS *
        24 *
        60 *
        60 *
        1000
    )
      .toISOString();

  const payload = {
    scope,
    user_id:
      scope ===
      "personalized"
        ? userId
        : null,
    query_key:
      queryKey,
    query_text:
      normalizedQuery,
    profile_key:
      scope ===
      "personalized"
        ? profileKey
        : null,
    answer,
    result_refs:
      refs,
    hit_count:
      0,
    expires_at:
      expiresAt,
    last_hit_at:
      null,
  };

  const {
    error,
  } =
    await s
      .from(
        "ai_recommendation_cache"
      )
      .insert(
        payload
      );

  /*
   * Duas pessoas podem fazer a mesma
   * pergunta nova exatamente ao mesmo tempo.
   * Nesse caso o índice unique pode ganhar
   * a corrida e a segunda inserção falhar
   * com 23505. Isso é normal e não derruba
   * a resposta.
   */
  if (
    error &&
    error.code !==
      "23505"
  ) {
    console.error(
      "Erro ao salvar cache da IA:",
      error
    );
  }
}

async function cleanupExpiredCache(
  s: any
) {
  /*
   * Limpeza oportunista.
   * Não precisa de cron para começar.
   */
  try {
    await s
      .from(
        "ai_recommendation_cache"
      )
      .delete()
      .lt(
        "expires_at",
        new Date(
          Date.now() -
          7 *
            24 *
            60 *
            60 *
            1000
        )
          .toISOString()
      );
  } catch {
    // Cache nunca deve derrubar o assistente.
  }
}

/*
 * ==========================================
 * API
 * ==========================================
 */

export async function POST(
  req: NextRequest
) {
  const s =
    await createClient();

  const {
    data: {
      user,
    },
  } =
    await s.auth.getUser();

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

const {
  data: assistantAllowed,
  error: rateLimitError
} = await s.rpc(
  "consume_assistant_rate_limit"
);

if (rateLimitError) {
  /*
   * O rate limiting é uma camada adicional de proteção.
   * Uma falha temporária na RPC não pode derrubar o
   * Assistente inteiro.
   */
  console.error(
    "Erro ao verificar limite do assistente:",
    {
      message:
        rateLimitError.message,
      code:
        rateLimitError.code,
      details:
        rateLimitError.details,
      hint:
        rateLimitError.hint
    }
  );
}

/*
 * Bloqueamos somente quando a função respondeu
 * explicitamente `false`.
 *
 * null pode significar que a RPC não foi encontrada ou
 * apresentou uma falha temporária.
 */
if (
  !rateLimitError &&
  assistantAllowed === false
) {
  return NextResponse.json(
    {
      error:
        "Você atingiu o limite de 20 perguntas em 10 minutos. Aguarde um pouco e tente novamente."
    },
    {
      status: 429,

      headers: {
        "Retry-After": "600",
        "Cache-Control":
          "private, no-store"
      }
    }
  );
}

  const body =
    await req.json();

  const message =
    String(
      body?.message ||
        ""
    ).trim();

  if (!message) {
    return NextResponse.json(
      {
        error:
          "Digite o que você quer assistir.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    message.length >
    1000
  ) {
    return NextResponse.json(
      {
        error:
          "A pergunta está muito longa.",
      },
      {
        status: 400,
      }
    );
  }

  const normalized =
    normalizeQuery(
      message
    );

  const personalized =
    isPersonalizedPrompt(
      normalized
    );

  const scope:
    | "global"
    | "personalized" =
    personalized
      ? "personalized"
      : "global";

  /*
   * Biblioteca só é necessária para
   * perguntas personalizadas e fallback.
   */

  const {
    data: library,
    error:
      libraryError,
  } =
    await s
      .from(
        "library_items"
      )
      .select(`
        id,
        status,
        favorite,
        personal_rating,
        media:media_id(
          tmdb_id,
          media_type,
          title,
          genres,
          release_date,
          first_air_date
        )
      `)
      .eq(
        "user_id",
        user.id
      );

  if (libraryError) {
    return NextResponse.json(
      {
        error:
          libraryError.message,
      },
      {
        status: 500,
      }
    );
  }

  const items =
    Array.isArray(
      library
    )
      ? library
      : [];

  const profileKey =
    personalized
      ? buildProfileKey(
          items
        )
      : null;

  /*
   * O query_key global depende somente da
   * pergunta normalizada.
   *
   * No pessoal, o perfil entra na chave
   * lógica através de profile_key.
   */

  const queryKey =
    hashValue(
      normalized
    );

  /*
   * ==========================================
   * 1. CACHE PRIMEIRO
   * ==========================================
   */

  const cached =
    await findCache({
      s,
      queryKey,
      scope,
      userId:
        user.id,
      profileKey,
    });

  if (cached) {
    const refs =
      Array.isArray(
        cached.result_refs
      )
        ? cached.result_refs
        : [];

    const hydrated =
      await hydrateCachedRefs(
        refs
      );

    /*
     * Se todos os IDs antigos sumiram do TMDB,
     * ignoramos o cache e geramos novamente.
     */

    if (
      hydrated.length >
      0
    ) {
      const hitCount =
        await countCacheHit(
          s,
          cached
        );

      return NextResponse.json({
        mode:
          "cache",
        cache_hit:
          true,
        cache_scope:
          scope,
        cache_hit_count:
          hitCount,
        answer:
          cached.answer,
        results:
          hydrated,
      });
    }
  }

  /*
   * ==========================================
   * 2. PERFIL PARA GEMINI
   * ==========================================
   */

  const profile =
    personalized
      ? items
          .filter(
            (
              item: any
            ) =>
              item.media
          )
          .sort(
            (
              a: any,
              b: any
            ) =>
              (
                Number(
                  b.personal_rating ||
                    0
                ) +
                (
                  b.favorite
                    ? 2
                    : 0
                )
              ) -
              (
                Number(
                  a.personal_rating ||
                    0
                ) +
                (
                  a.favorite
                    ? 2
                    : 0
                )
              )
          )
          .slice(
            0,
            30
          )
          .map(
            (
              item: any
            ) => ({
              title:
                item.media.title,
              type:
                item.media.media_type,
              status:
                item.status,
              favorite:
                Boolean(
                  item.favorite
                ),
              rating:
                item.personal_rating,
              genres:
                item.media.genres ||
                [],
            })
          )
      : [];

  const geminiKey =
    process.env.GEMINI_API_KEY;

  const model =
    process.env.GEMINI_MODEL ||
    "gemini-3.5-flash-lite";

  /*
   * ==========================================
   * 3. SEM GEMINI -> FALLBACK
   * ==========================================
   */

  if (!geminiKey) {
    const fallback =
      await buildFallback(
        items,
        6
      );

    return NextResponse.json({
      mode:
        "fallback",
      cache_hit:
        false,
      cache_scope:
        scope,
      cache_hit_count:
        0,
      answer:
        "A IA ainda não está configurada. Separei recomendações usando sua biblioteca e o TMDB.",
      results:
        fallback,
    });
  }

  /*
   * ==========================================
   * 4. GEMINI
   * ==========================================
   */

  try {
    const profileContext =
      personalized
        ? `
Perfil do usuário:
${JSON.stringify(
  profile
)}
`
        : `
Esta é uma pergunta geral.
NÃO personalize usando biblioteca ou preferências de usuário.
`;

    const prompt = `
Você é o assistente de recomendações do MyCatalog.

Pedido:
${message}

${profileContext}

Regras:
- Recomende no máximo 6 filmes ou séries.
- Respeite todas as restrições da pergunta.
- Não invente títulos.
- Não invente IDs do TMDB.
- Em "title", use o título oficial mais conhecido.
- Em "media_type", use apenas "movie" ou "tv".
- "reason" deve ter no máximo 140 caracteres.
- Responda SOMENTE JSON válido.

Formato:
{
  "answer": "resposta curta em português",
  "recommendations": [
    {
      "title": "Nome",
      "media_type": "movie",
      "year": 2024,
      "reason": "motivo"
    }
  ]
}
`;

    const response =
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`,
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              contents: [
                {
                  role:
                    "user",
                  parts: [
                    {
                      text:
                        prompt,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType:
                  "application/json",
                temperature:
                  0.65,
                maxOutputTokens:
                  1200,
              },
            }),
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "Gemini:",
        response.status,
        errorText
      );

      throw new Error(
        `Gemini ${response.status}`
      );
    }

    const data =
      await response.json();

    const raw =
      data?.candidates?.[0]
        ?.content?.parts
        ?.map(
          (
            part: any
          ) =>
            part.text ||
            ""
        )
        .join("") ||
      "";

    const parsed =
      JSON.parse(
        raw
      );

    const suggestions =
      Array.isArray(
        parsed
          ?.recommendations
      )
        ? (
            parsed.recommendations as GeminiRecommendation[]
          ).slice(
            0,
            6
          )
        : [];

    /*
     * Gemini decide títulos.
     * TMDB confirma cada um.
     */

    const resolved =
      (
        await Promise.all(
          suggestions.map(
            async (
              suggestion
            ) => {
              const item =
                await searchTmdb(
                  suggestion.title,
                  suggestion.media_type,
                  suggestion.year
                );

              if (!item) {
                return null;
              }

              return {
                ...item,
                media_type:
                  suggestion.media_type,
                reason:
                  suggestion.reason ||
                  "",
              };
            }
          )
        )
      ).filter(
        Boolean
      ) as any[];

    if (
      resolved.length ===
      0
    ) {
      throw new Error(
        "Nenhuma recomendação verificável."
      );
    }

    const answer =
      String(
        parsed?.answer ||
          "Separei algumas opções para você."
      );

    /*
     * Guardamos apenas IDs + motivo.
     * Pôster, nota, data etc. são buscados
     * novamente no TMDB em futuros hits.
     */

    const refs:
      CachedRef[] =
      resolved.map(
        (
          item
        ) => ({
          tmdb_id:
            Number(
              item.id
            ),
          media_type:
            item.media_type,
          reason:
            String(
              item.reason ||
                ""
            ),
        })
      );

    await saveCache({
      s,
      userId:
        user.id,
      scope,
      queryKey,
      normalizedQuery:
        normalized,
      profileKey,
      answer,
      refs,
    });

    /*
     * Não esperamos essa limpeza para
     * responder ao usuário.
     */
    cleanupExpiredCache(
      s
    );

    return NextResponse.json({
      mode:
        "gemini",
      cache_hit:
        false,
      cache_scope:
        scope,
      cache_hit_count:
        0,
      answer,
      results:
        resolved,
    });
  } catch (
    error
  ) {
    console.error(
      "Gemini indisponível, usando fallback:",
      error
    );

    const fallback =
      await buildFallback(
        items,
        6
      );

    return NextResponse.json({
      mode:
        "fallback",
      cache_hit:
        false,
      cache_scope:
        scope,
      cache_hit_count:
        0,
      answer:
        "A IA atingiu um limite ou ficou indisponível, então usei seu perfil e o TMDB para continuar recomendando normalmente.",
      results:
        fallback,
    });
  }
}