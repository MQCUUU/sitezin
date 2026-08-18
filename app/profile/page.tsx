import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MyProfileRedirect() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.username) redirect("/");
  redirect(`/u/${profile.username}`);
}
