import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const AVATAR_BUCKET = "avatars";
const MAX_PROCESSED_SIZE = 2 * 1024 * 1024;

function ownedAvatarPath(value: unknown, userId: string): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
    const pathname = new URL(value).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}

function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

async function authenticatedProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return { supabase, user, profile };
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;
  try {
    const { supabase, user, profile } = await authenticatedProfile();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const formData = await request.formData();
    const avatar = formData.get("avatar");
    if (!(avatar instanceof File)) {
      return NextResponse.json({ error: "Selecione uma imagem válida." }, { status: 400 });
    }
    if (avatar.type !== "image/webp" || avatar.size <= 0 || avatar.size > MAX_PROCESSED_SIZE) {
      return NextResponse.json({ error: "A imagem processada é inválida ou muito grande." }, { status: 400 });
    }

    const buffer = Buffer.from(await avatar.arrayBuffer());
    if (!isWebp(buffer)) {
      return NextResponse.json({ error: "O arquivo enviado não é uma imagem WebP válida." }, { status: 400 });
    }

    uploadedPath = `${user.id}/avatar-${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(uploadedPath, buffer, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(uploadedPath);
    const avatarUrl = publicData.publicUrl;
    const { data: updatedProfile, error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id)
      .select("avatar_url")
      .single();
    if (profileError || updatedProfile?.avatar_url !== avatarUrl) {
      throw profileError || new Error("O perfil não confirmou a nova foto.");
    }

    // O perfil é a fonte de verdade. Os metadados mantêm o menu da conta
    // sincronizado, mas uma falha secundária aqui não desfaz a foto já salva.
    await supabase.auth.updateUser({
      data: { ...user.user_metadata, avatar_url: avatarUrl },
    });

    const oldPath = ownedAvatarPath(profile?.avatar_url, user.id);
    const obsoletePaths = [...new Set([oldPath, `${user.id}/avatar.webp`])]
      .filter((path): path is string => Boolean(path && path !== uploadedPath));
    if (obsoletePaths.length) {
      await supabase.storage.from(AVATAR_BUCKET).remove(obsoletePaths);
    }

    return NextResponse.json(
      { success: true, avatar_url: avatarUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    if (uploadedPath) {
      try {
        const supabase = await createClient();
        await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
      } catch {}
    }
    return NextResponse.json(
      { error: error?.message || "Não foi possível salvar a foto." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  try {
    const { supabase, user, profile } = await authenticatedProfile();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data: updatedProfile, error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id)
      .select("avatar_url")
      .single();
    if (profileError || updatedProfile?.avatar_url !== null) {
      throw profileError || new Error("O perfil não confirmou a remoção da foto.");
    }

    await supabase.auth.updateUser({
      data: { ...user.user_metadata, avatar_url: null },
    });
    const currentPath = ownedAvatarPath(profile?.avatar_url, user.id);
    const paths = [...new Set([currentPath, `${user.id}/avatar.webp`])].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(AVATAR_BUCKET).remove(paths);

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Não foi possível remover a foto." },
      { status: 400 },
    );
  }
}
