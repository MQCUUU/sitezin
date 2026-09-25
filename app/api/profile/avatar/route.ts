import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
]);

function isValidImageBuffer(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 4) return false;
  if (mime === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (mime === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mime === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return false;
}

function getExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  return "webp";
}

function isVercelBlobUrl(url: unknown): boolean {
  return typeof url === "string" && url.includes("blob.vercel-storage.com");
}

async function authenticatedProfile() {
  const session = await auth.getSession().catch(() => null);
  const user = session?.data?.user;
  if (!user || !user.id) return { user: null, profile: null };

  const sql = getDb();
  const rows = await sql`
    SELECT id, username, avatar_url
    FROM public.profiles
    WHERE id = ${user.id}
    LIMIT 1
  `;
  const profile = rows[0] || null;
  return { user, profile };
}

export async function POST(request: Request) {
  let uploadedBlobUrl: string | null = null;
  try {
    const { user, profile } = await authenticatedProfile();
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
    const blobPathname = `avatars/${user.id}/avatar-${crypto.randomUUID()}.${ext}`;

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
    const { user, profile } = await authenticatedProfile();
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
