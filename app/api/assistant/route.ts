import {
  createHash,
} from "crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

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
  sql,
  queryKey,
  scope,
  userId,
  profileKey,
}: {
  sql: ReturnType<typeof getDb>;
  queryKey: string;
  scope: "global" | "personalized";
  userId: string;
  profileKey: string | null;
}) {
  try {
    const rows = scope === "personalized"
      ? await sql`
          SELECT id, answer, result_refs, hit_count, expires_at
          FROM public.ai_recommendation_cache
          WHERE query_key = ${queryKey}
            AND scope = ${scope}
            AND expires_at > now()
            AND user_id = ${userId}
            AND profile_key = ${profileKey}
          LIMIT 1
        `
      : await sql`
          SELECT id, answer, result_refs, hit_count, expires_at
          FROM public.ai_recommendation_cache
          WHERE query_key = ${queryKey}
            AND scope = ${scope}
            AND expires_at > now()
          LIMIT 1
        `;
    return rows[0] || null;
  } catch (error) {
    console.error("Erro ao consultar cache de IA:", error);
    return null;
  }
}

async function countCacheHit(
  sql: ReturnType<typeof getDb>,
  cache: any
) {
  const nextCount = Number(cache.hit_count || 0) + 1;
  try {
    await sql`
      UPDATE public.ai_recommendation_cache
      SET
        hit_count = ${nextCount},
        last_hit_at = now()
      WHERE id = ${cache.id}
    `;
  } catch (error) {
    console.error("Erro ao atualizar hit count de IA:", error);
  }
  return nextCount;
}

async function saveCache({
  sql,
  userId,
  scope,
  queryKey,
  normalizedQuery,
  profileKey,
  answer,
  refs,
}: {
  sql: ReturnType<typeof getDb>;
  userId: string;
  scope: "global" | "personalized";
  queryKey: string;
  normalizedQuery: string;
  profileKey: string | null;
  answer: string;
  refs: CachedRef[];
}) {
  const expiresAt = new Date(
    Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const targetUserId = scope === "personalized" ? userId : null;
  const targetProfileKey = scope === "personalized" ? profileKey : null;

  try {
    await sql`
      INSERT INTO public.ai_recommendation_cache (
        scope,
        user_id,
        query_key,
        query_text,
        profile_key,
        answer,
        result_refs,
        hit_count,
        expires_at,
        last_hit_at
      )
      VALUES (
        ${scope},
        ${targetUserId},
        ${queryKey},
        ${normalizedQuery},
        ${targetProfileKey},
        ${answer},
        ${JSON.stringify(refs)}::jsonb,
        0,
        ${expiresAt},
        null
      )
    `;
  } catch (error: any) {
    if (error?.code !== "23505") {
      console.error("Erro ao salvar cache da IA:", error);
    }
  }
}

async function cleanupExpiredCache(
  sql: ReturnType<typeof getDb>
) {
  try {
    await sql`
      DELETE FROM public.ai_recommendation_cache
      WHERE expires_at < (now() - interval '7 days')
    `;
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
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;

  if (!user || !user.id) {
    return NextResponse.json(
      {
        error: "Não autenticado",
      },
      {
        status: 401,
      }
    );
  }

  const sql = getDb();

  let assistantAllowed = true;
  try {
    const rlRows = await sql`
      INSERT INTO public.api_rate_limits (
        user_id,
        action,
        window_started_at,
        request_count
      )
      VALUES (
        ${user.id},
        'assistant',
        clock_timestamp(),
        1
      )
      ON CONFLICT (user_id, action)
      DO UPDATE SET
        window_started_at =
          CASE
            WHEN api_rate_limits.window_started_at <= clock_timestamp() - interval '10 minutes'
            THEN clock_timestamp()
            ELSE api_rate_limits.window_started_at
          END,
        request_count =
          CASE
            WHEN api_rate_limits.window_started_at <= clock_timestamp() - interval '10 minutes'
            THEN 1
            ELSE api_rate_limits.request_count + 1
          END
      RETURNING request_count;
    `;
    const count = Number(rlRows[0]?.request_count || 1);
    assistantAllowed = count <= 20;
  } catch (rateLimitError: any) {
    console.error(
      "Erro ao verificar limite do assistente:",
      rateLimitError
    );
  }

  if (!assistantAllowed) {
    return NextResponse.json(
      {
        error:
          "Você atingiu o limite de 20 perguntas em 10 minutos. Aguarde um pouco e tente novamente."
      },
      {
        status: 429,
        headers: {
          "Retry-After": "600",
          "Cache-Control": "private, no-store"
        }
      }
    );
  }

  const body = await req.json();
  const message = String(body?.message || "").trim();

  if (!message) {
    return NextResponse.json(
      { error: "Digite o que você quer assistir." },
      { status: 400 }
    );
  }

  if (message.length > 1000) {
    return NextResponse.json(
      { error: "A pergunta está muito longa." },
      { status: 400 }
    );
  }

  const normalized = normalizeQuery(message);
  const personalized = isPersonalizedPrompt(normalized);
  const scope: "global" | "personalized" = personalized ? "personalized" : "global";

  let items: any[] = [];
  try {
    const libraryRows = await sql`
      SELECT
        li.id,
        li.status,
        li.favorite,
        li.personal_rating,
        json_build_object(
          'tmdb_id', m.tmdb_id,
          'media_type', m.media_type,
          'title', m.title,
          'genres', m.genres,
          'release_date', m.release_date,
          'first_air_date', m.first_air_date
        ) as media
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${user.id}
    `;
    items = libraryRows || [];
  } catch (libraryError: any) {
    return NextResponse.json(
      { error: libraryError?.message || "Erro ao consultar biblioteca" },
      { status: 500 }
    );
  }



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
      sql,
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
        await countCacheHit(sql, cached);

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
      sql,
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
    cleanupExpiredCache(sql);

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