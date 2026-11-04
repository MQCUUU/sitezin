import { getRouteSession, sessionUnavailableResponse } from "@/lib/auth/route-session";
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db/neon";
import { ALLOWED_IMAGE_TYPES as ALLOWED_MIME_TYPES, imageExtension as getExtension, isValidImageBuffer, isVercelBlobUrl } from "@/lib/profile/image-upload";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

async function authenticatedProfile() {
  const session = await getRouteSession();
  if (session.unavailable) return { unavailable: true as const, user: null, profile: null };
  const user = session.data?.user;
  if (!user || !user.id) return { unavailable: false as const, user: null, profile: null };

  const sql = getDb();
  const rows = await sql`
    SELECT id, username, avatar_url
    FROM public.profiles
    WHERE id = ${user.id}
    LIMIT 1
  `;
  const profile = rows[0] || null;
  return { unavailable: false as const, user, profile };
}

export async function POST(request: Request) {
  let uploadedBlobUrl: string | null = null;
  try {
    const { unavailable, user, profile } = await authenticatedProfile();
    if (unavailable) return sessionUnavailableResponse();
    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const formData = await request.formData();
    const avatar = formData.get("avatar");
    if (!(avatar instanceof File)) {
      return NextResponse.json({ error: "Selecione uma imagem válida." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(avatar.type)) {
      return NextResponse.json(
        { error: "Formato de imagem inválido. Formatos permitidos: WebP, JPEG, PNG." },
        { status: 400 },
      );
    }

    if (avatar.size <= 0 || avatar.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: "A imagem é inválida ou excede o limite máximo de 5 MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await avatar.arrayBuffer());
    if (!isValidImageBuffer(buffer, avatar.type)) {
      return NextResponse.json(
        { error: "O conteúdo do arquivo não corresponde a uma imagem válida." },
        { status: 400 },
      );
    }

    const ext = getExtension(avatar.type);
    // V3.3: a URL do avatar é pública — o caminho não carrega o id interno da conta.
    const blobPathname = `avatars/${crypto.randomUUID()}.${ext}`;

    // Upload seguro para o novo Vercel Blob Storage
    const blob = await put(blobPathname, buffer, {
      access: "public",
      contentType: avatar.type,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    uploadedBlobUrl = blob.url;

    // Atualiza o avatar_url no banco Neon
    const sql = getDb();
    const updatedRows = await sql`
      UPDATE public.profiles
      SET avatar_url = ${blob.url}
      WHERE id = ${user.id}
      RETURNING avatar_url
    `;

    if (!updatedRows.length || updatedRows[0]?.avatar_url !== blob.url) {
      throw new Error("O perfil não confirmou a atualização da foto no banco de dados.");
    }

    // Remoção segura do avatar anterior se pertencia ao novo Storage (preservar legado Supabase)
    const oldAvatarUrl = profile?.avatar_url;
    if (oldAvatarUrl && isVercelBlobUrl(oldAvatarUrl) && oldAvatarUrl !== blob.url) {
      await del(oldAvatarUrl).catch(() => {});
    }

    return NextResponse.json(
      { success: true, avatar_url: blob.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    // Se o upload no Blob ocorreu mas o banco falhou, remove o novo arquivo para evitar órfãos
    if (uploadedBlobUrl) {
      try {
        await del(uploadedBlobUrl);
      } catch {}
    }
    return NextResponse.json(
      { error: error?.message || "Não foi possível salvar a foto de perfil." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  try {
    const { unavailable, user, profile } = await authenticatedProfile();
    if (unavailable) return sessionUnavailableResponse();
    if (!user || !user.id) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const sql = getDb();
    const updatedRows = await sql`
      UPDATE public.profiles
      SET avatar_url = null
      WHERE id = ${user.id}
      RETURNING avatar_url
    `;

    if (!updatedRows.length) {
      throw new Error("O perfil não confirmou a remoção da foto.");
    }

    // Remove do novo Storage somente se for objeto do Vercel Blob (legado Supabase preservado)
    const currentAvatarUrl = profile?.avatar_url;
    if (currentAvatarUrl && isVercelBlobUrl(currentAvatarUrl)) {
      await del(currentAvatarUrl).catch(() => {});
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Não foi possível remover a foto." },
      { status: 400 },
    );
  }
}
