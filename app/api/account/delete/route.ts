import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export async function DELETE() {
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

  try {
    const sql = getDb();

    const avatarRows = await sql`SELECT avatar_url FROM public.profiles WHERE id = ${user.id} LIMIT 1`;
    const avatarUrl = typeof avatarRows[0]?.avatar_url === "string" ? avatarRows[0].avatar_url : null;

    // A exclusão de neon_auth."user" aciona ON DELETE CASCADE em todas as FKs de
    // dono (sessões, perfil, biblioteca, diário, episódios, listas, follows,
    // notificações, preferências…). O catálogo compartilhado (`media`) nunca é
    // apagado por isso.
    await sql`DELETE FROM neon_auth."user" WHERE id = ${user.id}`;

    // V3.3: o arquivo do avatar fica fora do banco — remove também (melhor
    // esforço: a conta já foi excluída; uma falha aqui não a "desfaz").
    if (avatarUrl && avatarUrl.includes("blob.vercel-storage.com")) {
      await del(avatarUrl).catch((error) => console.warn("[DELETE /api/account/delete] avatar:", error?.message));
    }

    return NextResponse.json(
      {
        ok: true,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (deleteError) {
    console.error("[DELETE /api/account/delete]", deleteError);

    return NextResponse.json(
      {
        error: "Não foi possível excluir a conta agora. Tente novamente.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  }
}
