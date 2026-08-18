import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const [{ data, error }, { count: unread }] = await Promise.all([
    s.from("notifications").select("id,type,title,message,href,release_at,release_precision,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    s.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notifications: data || [], unread: unread || 0 }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json();
  let query = s.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (!body.all) query = query.eq("id", String(body.id || ""));
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
