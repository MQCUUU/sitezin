import {
  createHash,
} from "crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

import {
  effectiveExcludedStatuses,
  exclusionReason,
  parseAssistantIntent,
  type AssistantIntent,
} from "@/lib/assistant-intent";
import { buildTasteProfile, genreFit, type TasteRow } from "@/lib/taste-profile";

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
  const intent = parseAssistantIntent(message);

  /*
   * ==========================================
   * 0. BIBLIOTECA + OCULTOS + SERVIÇOS
   * ==========================================
   * V2.3 — o assistente sempre conhece a biblioteca do usuário: o que ele
   * assistiu/está assistindo/abandonou, notas, favoritos e serviços. Antes só
   * via 30 títulos e só se a frase "parecesse" pessoal.
   */
  let items: any[] = [];
  let hiddenKeys = new Set<string>();
  let services: string[] = [];

  try {
    const [libraryRows, hiddenRows, serviceRows] = await Promise.all([
      sql`
        SELECT
          li.id,
          li.status,
          li.favorite,
          li.personal_rating,
          json_build_object(
            'tmdb_id', m.tmdb_id,
            'media_type', m.media_type,
            'title', m.title,
            'original_title', m.original_title,
            'genres', m.genres,
            'release_date', m.release_date,
            'first_air_date', m.first_air_date
          ) as media
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${user.id}
      `,
      sql`
        SELECT tmdb_id, media_type
        FROM public.user_hidden_titles
        WHERE user_id = ${user.id}
      `.catch(() => [] as any[]),
      sql`
        SELECT provider_name
        FROM public.user_streaming_services
        WHERE user_id = ${user.id}
      `.catch(() => [] as any[]),
    ]);

    items = (libraryRows as any[]) || [];
    hiddenKeys = new Set(
      ((hiddenRows as any[]) || []).map(
        (row: any) => `${row.media_type}-${Number(row.tmdb_id)}`
      )
    );
    services = ((serviceRows as any[]) || []).map((row: any) => String(row.provider_name));
  } catch (libraryError: any) {
    return NextResponse.json(
      { error: libraryError?.message || "Erro ao consultar biblioteca" },
      { status: 500 }
    );
  }

  const tasteRows: TasteRow[] = items
    .filter((item: any) => item.media?.tmdb_id)
    .map((item: any) => ({
      tmdb_id: Number(item.media.tmdb_id),
      media_type: item.media.media_type === "tv" ? "tv" : "movie",
      title: String(item.media.title || ""),
      status: String(item.status || ""),
      favorite: Boolean(item.favorite),
      personal_rating:
        item.personal_rating === null || item.personal_rating === undefined
          ? null
          : Number(item.personal_rating),
      genres: Array.isArray(item.media.genres) ? item.media.genres.map(String) : [],
    }));
  const taste = buildTasteProfile(tasteRows);

  /*
   * Escopo do cache: com biblioteca, a resposta depende dela (exclusões) —
   * nunca usa o cache global compartilhado.
   */
  const personalized =
    isPersonalizedPrompt(normalized) || intent.personal || items.length > 0 || hiddenKeys.size > 0;
  const scope: "global" | "personalized" = personalized ? "personalized" : "global";

  const profileKey = personalized ? buildProfileKey(items) : null;
  const queryKey = hashValue(normalized);

  const excludedStatuses = effectiveExcludedStatuses(intent);

  /** Remove o que o usuário pediu para não receber (garantia — vale mesmo se o modelo errar). */
  function applyIntent(list: any[]) {
    const rejected: { title: string; why: string }[] = [];
    const kept = list.filter((item: any) => {
      const titles = [item.title, item.name, item.original_title, item.original_name]
        .filter(Boolean)
        .map(String);
      const why = exclusionReason(
        { media_type: item.media_type, id: Number(item.id), titles },
        intent,
        taste.statusByKey,
        hiddenKeys
      );

      if (why) rejected.push({ title: titles[0] || String(item.id), why });

      return !why;
    });

    return { kept, rejected };
  }

  function decorate(list: any[]) {
    return list.map((item: any) => {
      const key = `${item.media_type}-${Number(item.id)}`;
      const status = taste.statusByKey.get(key) || null;

      return { ...item, in_library: Boolean(status), library_status: status };
    });
  }

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
      userId: user.id,
      profileKey,
    });

  if (cached) {
    const refs = Array.isArray(cached.result_refs) ? cached.result_refs : [];
    const hydrated = await hydrateCachedRefs(refs);
    const { kept } = applyIntent(hydrated as any[]);

    // O cache só vale se ainda sobram boas respostas depois das exclusões atuais.
    if (kept.length >= 3 && kept.length >= Math.min(4, hydrated.length)) {
      const hitCount = await countCacheHit(sql, cached);

      return NextResponse.json({
        mode: "cache",
        cache_hit: true,
        cache_scope: scope,
        cache_hit_count: hitCount,
        answer: cached.answer,
        results: decorate(kept),
        applied: describeIntent(intent, excludedStatuses),
      });
    }
  }

  /*
   * "Da minha fila/biblioteca": a resposta TEM que sair da biblioteca —
   * ranqueada por encaixe com o gosto (determinístico, sem depender do modelo).
   */
  if (intent.libraryOnly && tasteRows.length > 0) {
    const wantsTv = /\bseries?\b/.test(normalized) && !/\bfilmes?\b/.test(normalized);
    const wantsMovie = /\bfilmes?\b/.test(normalized) && !/\bseries?\b/.test(normalized);
    const pool = tasteRows
      .filter((row) => ["want", "paused", "watching"].includes(row.status))
      .filter((row) => (wantsTv ? row.media_type === "tv" : wantsMovie ? row.media_type === "movie" : true))
      .filter((row) => !hiddenKeys.has(`${row.media_type}-${row.tmdb_id}`))
      .map((row) => ({
        row,
        score:
          genreFit(taste, row.genres) * 10 +
          (row.status === "watching" ? 4 : row.status === "want" ? 2 : 0) +
          (row.favorite ? 2 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (pool.length > 0) {
      const hydrated = (await hydrateCachedRefs(
        pool.map(({ row }) => ({
          tmdb_id: row.tmdb_id,
          media_type: row.media_type,
          reason:
            row.status === "watching"
              ? "Você já começou — dá para continuar."
              : row.status === "paused"
                ? "Você deixou em pausa; bom momento para retomar."
                : "Está na sua fila" +
                  (row.genres.some((genre) => (taste.affinity[genre] ?? 0) > 0.25)
                    ? ` e combina com ${row.genres.filter((genre) => (taste.affinity[genre] ?? 0) > 0.25).slice(0, 2).join(" e ")}, que você avalia bem.`
                    : "."),
        }))
      )) as any[];

      return NextResponse.json({
        mode: "library",
        cache_hit: false,
        cache_scope: scope,
        cache_hit_count: 0,
        answer: "Separei opções que já estão na sua biblioteca, pensando no seu gosto.",
        results: decorate(hydrated),
        applied: describeIntent(intent, excludedStatuses),
      });
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  /*
   * Modelo principal + reserva(s): cada modelo tem a SUA cota na API do
   * Gemini. Se o principal estourar (429) ou falhar (5xx), tenta o próximo —
   * dobra a capacidade diária sem trocar de plano.
   * GEMINI_MODEL (principal) e GEMINI_FALLBACK_MODELS (lista separada por vírgula).
   */
  const models = Array.from(
    new Set(
      [
        process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
        ...(process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.1-flash-lite").split(","),
      ]
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );

  const fallbackResponse = async (answer: string, mode = "fallback") => {
    const fallback = await buildFallback(items, 12);
    const { kept } = applyIntent(fallback as any[]);

    return NextResponse.json({
      mode,
      cache_hit: false,
      cache_scope: scope,
      cache_hit_count: 0,
      answer,
      results: decorate(kept.slice(0, 6)),
      applied: describeIntent(intent, excludedStatuses),
    });
  };

  if (!geminiKey) {
    return fallbackResponse(
      "A IA ainda não está configurada. Separei recomendações usando sua biblioteca e o TMDB."
    );
  }

  /*
   * ==========================================
   * 2. CONTEXTO PARA O GEMINI
   * ==========================================
   */
  const byStatus = (statuses: string[], limit: number) =>
    tasteRows
      .filter((row) => statuses.includes(row.status))
      .slice(0, limit)
      .map((row) => row.title);

  const likedTop = tasteRows
    .map((row) => ({ row, w: (row.personal_rating ?? 0) + (row.favorite ? 2 : 0) }))
    .filter(({ row, w }) => w >= 7 && ["watched", "rewatched", "rewatching", "watching"].includes(row.status))
    .sort((a, b) => b.w - a.w)
    .slice(0, 25)
    .map(({ row }) => `${row.title} (${row.media_type === "tv" ? "série" : "filme"}${row.personal_rating ? `, nota ${row.personal_rating}` : ""}${row.favorite ? ", favorito" : ""})`);

  const forbiddenTitles = (() => {
    const set = new Set<string>();

    if (intent.excludeAllLibrary) {
      tasteRows.forEach((row) => set.add(row.title));
    } else {
      tasteRows
        .filter((row) => excludedStatuses.has(row.status))
        .forEach((row) => set.add(row.title));
    }

    return Array.from(set).filter(Boolean).slice(0, 450);
  })();

  const context = {
    estatisticas: {
      titulos_na_biblioteca: tasteRows.length,
      generos_que_mais_gosta: taste.topGenres,
      generos_que_evita: taste.avoidGenres,
      servicos_de_streaming: services,
    },
    favoritos_e_bem_avaliados: likedTop,
    na_fila_para_assistir: byStatus(["want"], 25),
    abandonados: byStatus(["dropped"], 15),
  };

  const buildPrompt = (extraForbidden: string[]) => `
Você é o assistente de recomendações do MyCatalog.
Pedido do usuário:
${message}

Dados REAIS da biblioteca deste usuário (use para personalizar):
${JSON.stringify(context)}

TÍTULOS PROIBIDOS (jamais recomende nenhum destes, nem variações/sequências/refilmagens com o mesmo nome):
${JSON.stringify([...forbiddenTitles, ...intent.excludeTitles, ...extraForbidden].slice(0, 520))}

Regras:
- Retorne EXATAMENTE 10 recomendações (nunca menos), todas diferentes entre si: ${
    intent.onlyType === "tv" ? "SÉRIES (nunca filmes)" : intent.onlyType === "movie" ? "FILMES (nunca séries)" : "filmes ou séries"
  }, do mais ao menos adequado.
- Respeite TODAS as restrições do pedido (gênero, tipo, época, duração, país, tom).
- Nunca recomende títulos proibidos${
    services.length ? "; prefira o que provavelmente está em: " + services.join(", ") : ""
  }.
- Não invente títulos nem IDs do TMDB. Use o título oficial mais conhecido.
- "media_type" apenas "movie" ou "tv".
- "reason" em PT-BR, até 140 caracteres, citando por que combina com o pedido E com o gosto do usuário quando fizer sentido.
- Responda SOMENTE JSON válido.
Formato:
{
  "answer": "resposta curta em português",
  "recommendations": [
    { "title": "Nome", "media_type": "movie", "year": 2024, "reason": "motivo" }
  ]
}
`;

  async function askGemini(extraForbidden: string[]) {
    let response: Response | null = null;

    for (const model of models) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(geminiKey as string)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: buildPrompt(extraForbidden) }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.6,
              maxOutputTokens: 1800,
            },
          }),
        }
      );

      if (response.ok) break;

      console.error("Gemini:", model, response.status);

      // Cota/indisponibilidade → próximo modelo; outros erros (400/401/403) não adiantam repetir.
      if (response.status !== 429 && response.status < 500) break;
    }

    if (!response || !response.ok) {
      throw new Error(`Gemini ${response?.status ?? "sem resposta"}`);
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
    const parsed = JSON.parse(text);
    const suggestions: GeminiRecommendation[] = Array.isArray(parsed?.recommendations)
      ? parsed.recommendations.slice(0, 12)
      : [];

    const resolved = (
      await Promise.all(
        suggestions.map(async (suggestion) => {
          const item = await searchTmdb(suggestion.title, suggestion.media_type, suggestion.year);

          return item
            ? { ...item, media_type: suggestion.media_type, reason: suggestion.reason || "" }
            : null;
        })
      )
    ).filter(Boolean) as any[];

    return { answer: String(parsed?.answer || "Separei algumas opções para você."), resolved };
  }

  /*
   * ==========================================
   * 3. GEMINI + GARANTIA DE EXCLUSÕES
   * ==========================================
   * Até 2 tentativas: se o filtro derrubar quase tudo, repete pedindo
   * outros títulos (informando o que foi rejeitado).
   */
  try {
    let answer = "";
    const accepted: any[] = [];
    const seen = new Set<string>();
    let extraForbidden: string[] = [];

    for (let attempt = 0; attempt < 3 && accepted.length < 5; attempt++) {
      const round = await askGemini(extraForbidden);
      if (!answer) answer = round.answer;

      const { kept, rejected } = applyIntent(round.resolved);

      for (const item of kept) {
        const key = `${item.media_type}-${Number(item.id)}`;

        if (!seen.has(key)) {
          seen.add(key);
          accepted.push(item);
        }
      }

      // Próxima rodada: pede OUTROS títulos (nem os rejeitados, nem os já aceitos).
      extraForbidden = [
        ...extraForbidden,
        ...rejected.map((entry) => entry.title),
        ...kept.map((item: any) => String(item.title || item.name || "")),
      ].filter(Boolean);

      if (round.resolved.length === 0) break;
    }

    if (accepted.length === 0) {
      throw new Error("Nenhuma recomendação elegível depois das exclusões.");
    }

    const finalResults = accepted.slice(0, 6);

    const refs: CachedRef[] = finalResults.map((item) => ({
      tmdb_id: Number(item.id),
      media_type: item.media_type,
      reason: String(item.reason || ""),
    }));

    // Só guarda respostas boas (≥ 3): uma resposta magra não deve ser reaproveitada.
    if (finalResults.length >= 3) {
      await saveCache({
        sql,
        userId: user.id,
        scope,
        queryKey,
        normalizedQuery: normalized,
        profileKey,
        answer,
        refs,
      });

      cleanupExpiredCache(sql);
    }

    return NextResponse.json({
      mode: "gemini",
      cache_hit: false,
      cache_scope: scope,
      cache_hit_count: 0,
      answer,
      results: decorate(finalResults),
      applied: describeIntent(intent, excludedStatuses),
    });
  } catch (error) {
    console.error("Gemini indisponível, usando fallback:", error);

    return fallbackResponse(
      "A IA atingiu um limite ou ficou indisponível, então usei seu perfil e o TMDB para continuar recomendando normalmente."
    );
  }
}

/** Resumo do que foi aplicado (a tela mostra "Não incluí: …"). */
function describeIntent(intent: AssistantIntent, statuses: Set<string>) {
  const labels: Record<string, string> = {
    watched: "assistidos",
    rewatched: "reassistidos",
    rewatching: "reassistindo",
    watching: "em andamento",
    dropped: "abandonados",
    paused: "pausados",
    want: "da sua fila",
  };

  return {
    library_excluded: intent.excludeAllLibrary,
    statuses: Array.from(statuses).map((status) => labels[status] || status),
    titles: intent.excludeTitles,
    library_only: intent.libraryOnly,
  };
}
