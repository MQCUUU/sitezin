import { NextResponse } from "next/server";
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

    // A exclusão de neon_auth."user" aciona ON DELETE CASCADE em todas as 28 FKs
    // (incluindo neon_auth.session, neon_auth.account, public.profiles e dados do usuário)
    await sql`DELETE FROM neon_auth."user" WHERE id = ${user.id}`;

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
