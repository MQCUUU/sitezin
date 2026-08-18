import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const username = (new URL(request.url).searchParams.get("username") || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return NextResponse.json({ available: false, error: "Use de 3 a 24 letras, números ou _." }, { status: 400 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ available: false }, { status: 503 });
  const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await s.from("profiles").select("id").ilike("username", username).maybeSingle();
  return NextResponse.json({ available: !data }, { headers: { "Cache-Control": "no-store" } });
}
