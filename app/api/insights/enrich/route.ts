import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

/*
 * POST /api/insights/enrich
 *
 * Completa, a partir do TMDB (dados públicos), o que os Insights precisam e o
 * catálogo não guardava para títulos antigos: idioma original, países,
 * diretores e (se vazios) elenco/criadores. ≤ 20 títulos por chamada, só da
 * biblioteca do usuário. Não toca em pôster/sinopse/gêneros
 * (isso é do /api/library/repair-media).
 *
 * Idempotência e concorrência:
 *  - Só pega `media` SEM `raw.enriched_v2` → título completo nunca é
 *    reprocessado (media é compartilhada: enriquece 1× para todos).
 *  - RESERVA ATÔMICA: um único UPDATE … FOR UPDATE SKIP LOCKED grava
 *    `raw.enrich_claimed_at`. Duas abas/sessões/usuários ao mesmo tempo nunca
 *    pegam o mesmo título. Reserva expira em 5 min (falha de rede → tenta de novo).
 *  - A escrita final só acontece se o título ainda não foi enriquecido
 *    (`AND raw->>'enriched_v2' IS NULL`) e remove a reserva.
 *  - 404 no TMDB marca como enriquecido (não insiste num título removido).
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const BATCH = 20;

type Row = { id: number; tmdb_id: number; media_type: "movie" | "tv" };

export async function POST() {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) return NextResponse.json({ enriched: 0, remaining: 0 });

    const sql = getDb();

    const claimed = (await sql`
      WITH candidates AS (
        SELECT m.id
        FROM public.media m
        WHERE m.id IN (SELECT li.media_id FROM public.library_items li WHERE li.user_id = ${userId})
          AND m.tmdb_id IS NOT NULL
          AND (m.raw->>'enriched_v2') IS NULL
          AND (
            (m.raw->>'enrich_claimed_at') IS NULL
            OR (m.raw->>'enrich_claimed_at')::timestamptz < now() - interval '5 minutes'
          )
        ORDER BY m.id
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.media m
      SET raw = coalesce(m.raw, '{}'::jsonb) || jsonb_build_object('enrich_claimed_at', now())
      FROM candidates c
      WHERE m.id = c.id
      RETURNING m.id, m.tmdb_id, m.media_type
    `) as Row[];

    const language = process.env.TMDB_LANGUAGE || "pt-BR";

    const results = await Promise.all(
      claimed.map(async (row) => {
        const response = await fetch(
          `${TMDB_BASE}/${row.media_type}/${row.tmdb_id}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}&append_to_response=credits`,
          { signal: AbortSignal.timeout(8000), cache: "no-store" }
        ).catch(() => null);

        // Falha de rede/limite: a reserva expira e o título volta à fila.
        if (!response || (!response.ok && response.status !== 404)) return false;

        const d = response.ok ? await response.json().catch(() => null) : null;
        const crew: { job?: string; name?: string }[] = Array.isArray(d?.credits?.crew) ? d.credits.crew : [];
        const cast: { name?: string }[] = Array.isArray(d?.credits?.cast) ? d.credits.cast : [];
        const directors = Array.from(new Set(crew.filter((c) => c.job === "Director" && c.name).map((c) => String(c.name)))).slice(0, 3);
        const countries: string[] = Array.isArray(d?.production_countries)
          ? d.production_countries.map((c: { iso_3166_1?: string }) => c.iso_3166_1).filter(Boolean)
          : [];
        const origin: string[] = Array.isArray(d?.origin_country) ? d.origin_country.filter(Boolean) : [];
        const castNames = cast.slice(0, 5).map((c) => String(c.name)).filter(Boolean);
        const creators: string[] = Array.isArray(d?.created_by) ? d.created_by.map((c: { name?: string }) => String(c.name)).filter(Boolean) : [];

        const patch = JSON.stringify({
          original_language: d?.original_language ?? null,
          origin_country: origin.length ? origin : countries,
          production_countries: countries.map((iso_3166_1) => ({ iso_3166_1 })),
          directors,
          enriched_v2: "1",
        });

        const updated = await sql`
          UPDATE public.media SET
            raw = (coalesce(raw, '{}'::jsonb) - 'enrich_claimed_at') || ${patch}::jsonb,
            cast_names = CASE
              WHEN coalesce(cardinality(cast_names), 0) = 0 AND cardinality(${castNames}::text[]) > 0
              THEN ${castNames}::text[] ELSE cast_names END,
            creator_names = CASE
              WHEN coalesce(cardinality(creator_names), 0) = 0 AND cardinality(${creators}::text[]) > 0
              THEN ${creators}::text[] ELSE creator_names END
          WHERE id = ${row.id} AND (raw->>'enriched_v2') IS NULL
          RETURNING id
        `;

        return updated.length > 0;
      })
    );

    const remaining = (await sql`
      SELECT count(*)::int AS n
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${userId} AND m.tmdb_id IS NOT NULL AND (m.raw->>'enriched_v2') IS NULL
    `) as { n: number }[];

    return NextResponse.json(
      { enriched: results.filter(Boolean).length, remaining: remaining[0]?.n ?? 0 },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return respostaDeErro(error, "POST /api/insights/enrich");
  }
}
