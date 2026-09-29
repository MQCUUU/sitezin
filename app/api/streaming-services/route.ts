import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { parseStreamingServices } from "@/lib/streaming-services";

/*
 * V2.1-E — GET/PUT /api/streaming-services
 *
 * Privado por usuário (sempre escopado ao `user_id` da sessão),
 * `Cache-Control: private, no-store`. PUT substitui o conjunto inteiro
 * (≤ 40 serviços) numa transação de duas queries batched.
 */

const PRIVATE = { "Cache-Control": "private, no-store" };

async function currentUserId() {
  const session = await auth.getSession().catch(() => null);
  return session?.data?.user?.id ?? null;
}

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return naoAutenticado();

    const sql = getDb();
    const rows = await sql`
      SELECT provider_id, provider_name, logo_path
      FROM public.user_streaming_services
      WHERE user_id = ${userId}
      ORDER BY provider_name
    `;

    return NextResponse.json({ services: rows }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "GET /api/streaming-services");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return naoAutenticado();

    const body = await req.json().catch(() => null);
    const services = parseStreamingServices(body?.services);

    if (!services) {
      return NextResponse.json(
        { error: "Lista de serviços inválida." },
        { status: 400, headers: PRIVATE }
      );
    }

    const sql = getDb();

    // Uma única instrução: apaga o que saiu e faz upsert do que ficou.
    await sql.transaction([
      sql`
        DELETE FROM public.user_streaming_services
        WHERE user_id = ${userId}
          AND NOT (provider_id = ANY(${services.map((s) => s.provider_id)}::int[]))
      `,
      sql`
        INSERT INTO public.user_streaming_services (user_id, provider_id, provider_name, logo_path)
        SELECT ${userId}, t.id, t.name, NULLIF(t.logo, '')
        FROM unnest(
          ${services.map((s) => s.provider_id)}::int[],
          ${services.map((s) => s.provider_name)}::text[],
          ${services.map((s) => s.logo_path ?? "")}::text[]
        ) AS t(id, name, logo)
        ON CONFLICT (user_id, provider_id)
        DO UPDATE SET provider_name = EXCLUDED.provider_name, logo_path = EXCLUDED.logo_path
      `,
    ]);

    return NextResponse.json({ services }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "PUT /api/streaming-services");
  }
}
