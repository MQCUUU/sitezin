/*
 * Validação de imagens enviadas pelo usuário (avatar e banner do perfil).
 * O tipo declarado pelo navegador não basta: o conteúdo é conferido pela
 * assinatura dos primeiros bytes (WebP, PNG, JPEG).
 */

export const ALLOWED_IMAGE_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

export function isValidImageBuffer(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 4) return false;

  if (mime === "image/webp") {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }

  if (mime === "image/png") {
    return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }

  if (mime === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  return false;
}

export function imageExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  return "webp";
}

export function isVercelBlobUrl(url: unknown): boolean {
  return typeof url === "string" && url.includes("blob.vercel-storage.com");
}
