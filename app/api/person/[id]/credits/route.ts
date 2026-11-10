import { NextRequest, NextResponse } from "next/server";

import { getPersonCredits, parsePersonId, PersonCreditsError } from "@/lib/person/credits";

/* A lógica mora em lib/person/credits.ts — a página de pessoa usa a mesma função no servidor. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = parsePersonId(id);

  if (!personId) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const data = await getPersonCredits(personId);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    if (error instanceof PersonCreditsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[GET /api/person/[id]/credits]", error);
    return NextResponse.json({ error: "Não foi possível carregar os dados da pessoa agora." }, { status: 502 });
  }
}
