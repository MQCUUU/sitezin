import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

export default async function MyProfileRedirect() {
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;
  if (!user || !user.id) redirect("/login");

  const sql = getDb();
  const rows = await sql`
    SELECT username
    FROM public.profiles
    WHERE id = ${user.id}
    LIMIT 1
  `;

  const username = rows[0]?.username;
  if (!username) redirect("/");
  redirect(`/u/${username}`);
}
