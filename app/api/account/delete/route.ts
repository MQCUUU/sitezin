import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

const RECENT_LOGIN_MAX_AGE_MS = 10 * 60 * 1000;

function hasRecentLogin(
  lastSignInAt: string | undefined
): boolean {
  if (!lastSignInAt) {
    return false;
  }

  const timestamp = Date.parse(lastSignInAt);

  return (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp <= RECENT_LOGIN_MAX_AGE_MS
  );
}

export async function DELETE() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        error: "Não autenticado"
      },
      {
        status: 401
      }
    );
  }

  if (!hasRecentLogin(user.last_sign_in_at)) {
    return NextResponse.json(
      {
        error:
          "Por segurança, saia da conta, entre novamente e repita a exclusão em até 10 minutos."
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  }

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "[DELETE /api/account/delete] Configuração administrativa ausente."
    );

    return NextResponse.json(
      {
        error:
          "A exclusão de conta está temporariamente indisponível."
      },
      {
        status: 503
      }
    );
  }

  const admin = createAdminClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  const { error: deleteError } =
    await admin.auth.admin.deleteUser(
      user.id,
      false
    );

  if (deleteError) {
    console.error(
      "[DELETE /api/account/delete]",
      deleteError
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível excluir a conta agora. Tente novamente."
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  }

  return NextResponse.json(
    {
      ok: true
    },
    {
      headers: {
        "Cache-Control": "private, no-store"
      }
    }
  );
}