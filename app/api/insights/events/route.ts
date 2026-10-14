import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { respostaDeErro } from "@/lib/api-error";
import { isMissingTable } from "@/lib/insights/db-safe";

/*
 * POST /api/insights/events — lote do InsightsTracker (≤ 50 eventos).
 *
 * Identidade de cada ocorrência (event_key) montada AQUI, por tipo:
 *   rec_shown / rec_opened / rec_dismissed
 *     → {tipo}:{origem}:{mídia}:{tmdb}:{exposure_id}
 *       1 por EXPOSIÇÃO. Re-render/refresh/Strict Mode reaproveitam o mesmo
 *       exposure_id → mesma chave → ON CONFLICT DO NOTHING. Uma exposição
 *       nova (outra sessão/período) tem exposure_id novo → nova linha.
 *   library_added
 *     → added:{library_item_id}
 *       1 por ENTRADA na biblioteca: só se o item foi criado há ≤ 10 min
 *       (POST /api/library também muda status de títulos antigos — isso não
 *       é uma adição). Remover e adicionar de novo cria outra library_item.
 *
 * Atribuição (last-touch por interação, decidida no navegador e VALIDADA
 * aqui): origem = ferramenta de recomendação só se vier com um exposure_id
 * desse usuário, dessa ferramenta e desse título já registrado; senão a
 * origem vira 'other' e o vínculo é descartado.
 *
 * user_id SEMPRE da sessão; nada do corpo identifica usuário. Sem sessão,
 * sem tabela/coluna (migração pendente) ou usuário removido: 204 em
 * silêncio — instrumentação nunca pode quebrar o produto.
 */

const KINDS = new Set(["rec_shown", "rec_opened", "rec_dismissed", "library_added"]);
const TOOLS = new Set(["pick", "smart_queue", "assistant", "for_you"]);
const SOURCES = new Set([...TOOLS, "home", "discover", "search", "title", "collection", "person", "lists", "profile", "library", "calendar", "other"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Event = { kind: string; source: string; tmdb_id: number; media_type: "movie" | "tv"; exposure_id: string | null };

const noContent = () => new NextResponse(null, { status: 204 });

function parse(raw: Record<string, unknown>): Event | null {
  const tmdb = Number(raw?.tmdb_id);
  const exposure = typeof raw?.exposure_id === "string" && UUID.test(raw.exposure_id) ? raw.exposure_id.toLowerCase() : null;
  const event = {
    kind: String(raw?.kind),
    source: String(raw?.source),
    tmdb_id: tmdb,
    media_type: raw?.media_type as "movie" | "tv",
    exposure_id: exposure,
  };

  if (!KINDS.has(event.kind) || !SOURCES.has(event.source)) return null;
  if (!Number.isInteger(tmdb) || tmdb <= 0 || tmdb > 2_147_483_647) return null;
  if (event.media_type !== "movie" && event.media_type !== "tv") return null;
  // Eventos de recomendação SÓ existem dentro de uma ferramenta e de uma exposição.
  if (event.kind !== "library_added" && (!TOOLS.has(event.source) || !exposure)) return null;

  return event;
}

export async function POST(request: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return noContent();

    const body = await request.json().catch(() => null);
    const seen = new Set<string>();
    const recs: (Event & { event_key: string })[] = [];
    const adds: Event[] = [];

    for (const raw of Array.isArray(body?.events) ? body.events.slice(0, 50) : []) {
      const event = parse(raw);

      if (!event) continue;

      if (event.kind === "library_added") {
        const key = `${event.media_type}:${event.tmdb_id}`;

        if (!seen.has(key)) {
          seen.add(key);
          adds.push(event);
        }

        continue;
      }

      const eventKey = `${event.kind.replace("rec_", "")}:${event.source}:${event.media_type}:${event.tmdb_id}:${event.exposure_id}`;

      if (!seen.has(eventKey)) {
        seen.add(eventKey);
        recs.push({ ...event, event_key: eventKey });
      }
    }

    if (!recs.length && !adds.length) return noContent();

    const sql = getDb();

    try {
      if (recs.length) {
        await sql`
          INSERT INTO public.user_events (user_id, kind, source, tmdb_id, media_type, exposure_id, event_key)
          SELECT ${userId}, e.kind, e.source, e.tmdb_id, e.media_type, e.exposure_id, e.event_key
          FROM unnest(
            ${recs.map((e) => e.kind)}::text[],
            ${recs.map((e) => e.source)}::text[],
            ${recs.map((e) => e.tmdb_id)}::int[],
            ${recs.map((e) => e.media_type)}::text[],
            ${recs.map((e) => e.exposure_id)}::uuid[],
            ${recs.map((e) => e.event_key)}::text[]
          ) AS e(kind, source, tmdb_id, media_type, exposure_id, event_key)
          ON CONFLICT (user_id, event_key) DO NOTHING
        `;
      }

      if (adds.length) {
        await sql`
          WITH incoming AS (
            SELECT * FROM unnest(
              ${adds.map((e) => e.source)}::text[],
              ${adds.map((e) => e.tmdb_id)}::int[],
              ${adds.map((e) => e.media_type)}::text[],
              ${adds.map((e) => e.exposure_id)}::uuid[]
            ) AS e(source, tmdb_id, media_type, exposure_id)
          ),
          resolved AS (
            SELECT
              li.id AS library_item_id,
              i.tmdb_id,
              i.media_type,
              -- vínculo com a exposição só se ela existe para ESTE usuário,
              -- ESTA ferramenta e ESTE título
              CASE WHEN exp.exposure_id IS NOT NULL THEN i.exposure_id END AS exposure_id,
              CASE
                WHEN i.source IN ('pick', 'smart_queue', 'assistant', 'for_you') AND exp.exposure_id IS NULL THEN 'other'
                ELSE i.source
              END AS source
            FROM incoming i
            JOIN public.media m ON m.tmdb_id = i.tmdb_id AND m.media_type = i.media_type
            JOIN public.library_items li ON li.media_id = m.id AND li.user_id = ${userId}
            LEFT JOIN LATERAL (
              SELECT ue.exposure_id
              FROM public.user_events ue
              WHERE ue.user_id = ${userId}
                AND ue.exposure_id = i.exposure_id
                AND ue.source = i.source
                AND ue.tmdb_id = i.tmdb_id
                AND ue.media_type = i.media_type
                AND ue.kind = 'rec_shown'
              LIMIT 1
            ) exp ON true
            WHERE li.added_at > now() - interval '10 minutes'
          )
          INSERT INTO public.user_events (user_id, kind, source, tmdb_id, media_type, exposure_id, event_key)
          SELECT ${userId}, 'library_added', r.source, r.tmdb_id, r.media_type, r.exposure_id, 'added:' || r.library_item_id
          FROM resolved r
          ON CONFLICT (user_id, event_key) DO NOTHING
        `;
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;

      // 42P01 tabela ausente · 42703 coluna ausente · 42P10 chave ausente
      // (migração pendente) · 23503 usuário removido no meio da sessão
      if (isMissingTable(error) || code === "42703" || code === "42P10" || code === "23503") return noContent();
      throw error;
    }

    return noContent();
  } catch (error) {
    return respostaDeErro(error, "POST /api/insights/events");
  }
}
