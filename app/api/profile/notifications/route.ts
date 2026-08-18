import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const defaults = { new_follower_site: true, new_follower_email: false, follow_request_site: true, follow_request_email: false, review_like_site: true, review_like_email: false, product_updates_email: false };
export async function GET() {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data } = await s.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
  return NextResponse.json(data || defaults);
}
export async function PUT(request: Request) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json(); const values: Record<string, boolean | string> = { user_id: user.id, updated_at: new Date().toISOString() };
  for (const key of Object.keys(defaults)) values[key] = Boolean(body[key]);
  const { error } = await s.from("notification_preferences").upsert(values, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
