import { getRouteSession, sessionUnavailableResponse } from "@/lib/auth/route-session";
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado } from "@/lib/api-error";
import { ALLOWED_IMAGE_TYPES, imageExtension, isValidImageBuffer, isVercelBlobUrl } from "@/lib/profile/image-upload";

/*
 * Banner do perfil (imagem larga no topo do perfil público), como em outras redes.
 * Mesmo fluxo do avatar: valida tipo + assinatura dos bytes, envia ao Vercel Blob
 * com nome aleatório (a URL é pública e não carrega o id da conta), grava no
 * perfil e apaga o banner anterior. Se o banco falhar, o arquivo novo é removido.
 *
 * POST   multipart { banner: File }   (WebP, JPEG ou PNG, até 8 MB)
 * DELETE                              remove o banner
 */

const MAX_BANNER_BYTES = 8 * 1024 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

async function sessionProfile() {
  const session = await getRouteSession();
  if (session.unavailable) return undefined;
  const userId = session.data?.user?.id;
  if (!userId) return null;
  const rows = await getDb()`SELECT id, banner_url FROM public.profiles WHERE id = ${userId} LIMIT 1`;
  return rows[0] ? { id: String(rows[0].id), banner_url: (rows[0].banner_url as string | null) ?? null } : null;
}

export async function POST(request: Request) {
  let uploaded: string | null = null;

  try {
    const profile = await sessionProfile();
    if (profile === undefined) return sessionUnavailableResponse();
    if (!profile) return naoAutenticado();

    const form = await request.formData();
    const file = form.get("banner");

    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma imagem válida." }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Formato de imagem inválido. Formatos permitidos: WebP, JPEG, PNG." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BANNER_BYTES) {
      return NextResponse.json({ error: "A imagem é inválida ou excede o limite de 8 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isValidImageBuffer(buffer, file.type)) {
      return NextResponse.json({ error: "O conteúdo do arquivo não corresponde a uma imagem válida." }, { status: 400 });
    }

    const blob = await put(`banners/${crypto.randomUUID()}.${imageExtension(file.type)}`, buffer, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    uploaded = blob.url;

    const rows = await getDb()`UPDATE public.profiles SET banner_url = ${blob.url} WHERE id = ${profile.id} RETURNING banner_url`;
    if (rows[0]?.banner_url !== blob.url) throw new Error("O perfil não confirmou a atualização do banner.");

    if (profile.banner_url && isVercelBlobUrl(profile.banner_url) && profile.banner_url !== blob.url) {
      await del(profile.banner_url).catch(() => undefined);
    }

    return NextResponse.json({ success: true, banner_url: blob.url }, { headers: NO_STORE });
  } catch (error) {
    if (uploaded) await del(uploaded).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o banner." }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    const profile = await sessionProfile();
    if (profile === undefined) return sessionUnavailableResponse();
    if (!profile) return naoAutenticado();

    await getDb()`UPDATE public.profiles SET banner_url = NULL WHERE id = ${profile.id}`;
    if (profile.banner_url && isVercelBlobUrl(profile.banner_url)) await del(profile.banner_url).catch(() => undefined);

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível remover o banner." }, { status: 400 });
  }
}
