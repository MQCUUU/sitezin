import { createPublicKey, verify as verifySignature } from "node:crypto";

const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const UNKNOWN_KID_REFRESH_COOLDOWN_MS = 5 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const FROM = "MyCatalog <noreply@catalogmy.pro>";

type NeonJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type LinkType = "forget-password" | "sign-in" | "email-verification";

type MagicLinkEvent = {
  event_id: string;
  event_type: "send.magic_link";
  timestamp: string;
  user: { email: string };
  event_data: {
    link_type: LinkType;
    link_url: string;
    expires_at: string;
  };
};

type OtpType = "email-verification" | "forget-password" | "sign-in";

type OtpEvent = {
  event_id: string;
  event_type: "send.otp";
  timestamp: string;
  user: { email: string };
  event_data: {
    otp_code: string;
    otp_type: OtpType;
    delivery_preference?: "email" | "sms";
    expires_at: string;
  };
};

type EmailContent = { subject: string; html: string; text: string };

type WebhookDependencies = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  getPublicJwk?: (authBaseUrl: string, kid: string) => Promise<NeonJwk | null>;
};

type CachedJwks = {
  keys: Map<string, NeonJwk>;
  expiresAt: number;
  lastUnknownKidRefreshAt: number;
};

const jwksCache = new Map<string, CachedJwks>();

export class NeonWebhookError extends Error {
  readonly status: 400 | 401 | 413 | 415 | 503;
  readonly publicMessage: string;

  constructor(
    status: 400 | 401 | 413 | 415 | 503,
    publicMessage: string
  ) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
    this.name = "NeonWebhookError";
  }
}

function jsonResponse(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  return Buffer.from(value, "base64url");
}

export function neonJwksUrl(authBaseUrl: string): string {
  const base = new URL(authBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new NeonWebhookError(503, "Configuração do Neon Auth inválida.");
  }
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/.well-known/jwks.json`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

async function getCachedPublicJwk(
  authBaseUrl: string,
  kid: string,
  fetchImpl: typeof fetch,
  now: () => number
): Promise<NeonJwk | null> {
  let jwksUrl: string;
  try {
    jwksUrl = neonJwksUrl(authBaseUrl);
  } catch (error) {
    if (error instanceof NeonWebhookError) throw error;
    throw new NeonWebhookError(503, "Configuração do Neon Auth inválida.");
  }

  const current = jwksCache.get(jwksUrl);
  if (current && current.expiresAt > now()) {
    const matchingKey = current.keys.get(kid);
    if (matchingKey) return matchingKey;
    if (now() - current.lastUnknownKidRefreshAt < UNKNOWN_KID_REFRESH_COOLDOWN_MS) {
      throw new NeonWebhookError(503, "A chave de assinatura está sendo atualizada; tente novamente.");
    }
    current.lastUnknownKidRefreshAt = now();
  }

  let response: Response;
  try {
    response = await fetchImpl(jwksUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    throw new NeonWebhookError(503, "Não foi possível validar a assinatura agora.");
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new NeonWebhookError(503, "Não foi possível validar a assinatura agora.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new NeonWebhookError(503, "Não foi possível validar a assinatura agora.");
  }

  const keys = isRecord(payload) && Array.isArray(payload.keys)
    ? payload.keys.filter((key): key is NeonJwk =>
        isRecord(key) && typeof key.kid === "string" && key.kty === "OKP" && key.crv === "Ed25519" && typeof key.x === "string"
      )
    : [];
  if (!keys.length) throw new NeonWebhookError(503, "Não foi possível validar a assinatura agora.");

  const cached: CachedJwks = {
    keys: new Map(keys.map((key) => [key.kid as string, key])),
    expiresAt: now() + JWKS_CACHE_TTL_MS,
    lastUnknownKidRefreshAt: now(),
  };
  jwksCache.set(jwksUrl, cached);
  return cached.keys.get(kid) ?? null;
}

function validateFreshTimestamp(timestamp: string, now: number): number {
  if (!/^\d{13}$/.test(timestamp)) throw new NeonWebhookError(401, "Assinatura do webhook inválida.");
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > WEBHOOK_MAX_AGE_MS) {
    throw new NeonWebhookError(401, "Assinatura do webhook inválida.");
  }
  return timestampMs;
}

export function verifyNeonWebhookSignature(
  rawBody: string | Uint8Array,
  signature: string,
  signatureKid: string,
  timestamp: string,
  jwk: NeonJwk,
  now: number
): boolean {
  validateFreshTimestamp(timestamp, now);

  const parts = signature.split(".");
  if (parts.length !== 3 || parts[1] !== "") return false;

  try {
    const protectedHeader = JSON.parse(decodeBase64Url(parts[0]).toString("utf8")) as unknown;
    if (
      !isRecord(protectedHeader) ||
      protectedHeader.alg !== "EdDSA" ||
      protectedHeader.kid !== signatureKid ||
      (jwk.kid && jwk.kid !== signatureKid) ||
      (jwk.alg && jwk.alg !== "EdDSA") ||
      (jwk.use && jwk.use !== "sig")
    ) return false;

    const payloadB64 = Buffer.from(rawBody).toString("base64url");
    const signaturePayloadB64 = Buffer.from(`${timestamp}.${payloadB64}`, "utf8").toString("base64url");
    const signingInput = `${parts[0]}.${signaturePayloadB64}`;
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    return verifySignature(null, Buffer.from(signingInput), publicKey, decodeBase64Url(parts[2]));
  } catch {
    return false;
  }
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 && value === value.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseMagicLinkEvent(payload: unknown, baseUrl: string, now: number): MagicLinkEvent {
  if (!isRecord(payload)) throw new NeonWebhookError(400, "Evento de autenticação inválido.");
  if (payload.event_type !== "send.magic_link") throw new NeonWebhookError(400, "Evento de autenticação não suportado.");
  if (typeof payload.event_id !== "string" || !payload.event_id || payload.event_id.length > 200 || /[\r\n\0]/.test(payload.event_id)) {
    throw new NeonWebhookError(400, "Evento de autenticação inválido.");
  }
  const eventTime = typeof payload.timestamp === "string" ? Date.parse(payload.timestamp) : Number.NaN;
  if (!Number.isFinite(eventTime) || Math.abs(now - eventTime) > WEBHOOK_MAX_AGE_MS) {
    throw new NeonWebhookError(400, "Evento de autenticação expirado.");
  }
  if (!isRecord(payload.user) || !isEmail(payload.user.email) || !isRecord(payload.event_data)) {
    throw new NeonWebhookError(400, "Evento de autenticação inválido.");
  }

  const { link_type: linkType, link_url: linkUrl, expires_at: expiresAt } = payload.event_data;
  if (linkType !== "forget-password" && linkType !== "sign-in" && linkType !== "email-verification") {
    throw new NeonWebhookError(400, "Tipo de link de autenticação não suportado.");
  }
  if (typeof linkUrl !== "string" || linkUrl.length > 8192 || /[\u0000-\u001f\u007f]/.test(linkUrl)) {
    throw new NeonWebhookError(400, "Link de autenticação inválido.");
  }
  if (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now) {
    throw new NeonWebhookError(400, "Link de autenticação expirado.");
  }

  try {
    const link = new URL(linkUrl);
    const authOrigin = new URL(baseUrl).origin;
    if (link.protocol !== "https:" || link.origin !== authOrigin || link.username || link.password) {
      throw new Error("unsafe link");
    }
  } catch {
    throw new NeonWebhookError(400, "Link de autenticação inválido.");
  }

  return payload as unknown as MagicLinkEvent;
}

function parseOtpEvent(payload: unknown, now: number): OtpEvent {
  if (!isRecord(payload) || payload.event_type !== "send.otp") {
    throw new NeonWebhookError(400, "Evento de autenticação não suportado.");
  }
  if (typeof payload.event_id !== "string" || !payload.event_id || payload.event_id.length > 200 || /[\r\n\0]/.test(payload.event_id)) {
    throw new NeonWebhookError(400, "Evento de autenticação inválido.");
  }
  const eventTime = typeof payload.timestamp === "string" ? Date.parse(payload.timestamp) : Number.NaN;
  if (!Number.isFinite(eventTime) || Math.abs(now - eventTime) > WEBHOOK_MAX_AGE_MS) {
    throw new NeonWebhookError(400, "Evento de autenticação expirado.");
  }
  if (!isRecord(payload.user) || !isEmail(payload.user.email) || !isRecord(payload.event_data)) {
    throw new NeonWebhookError(400, "Evento de autenticação inválido.");
  }

  const data = payload.event_data;
  if (data.otp_type !== "email-verification" && data.otp_type !== "forget-password" && data.otp_type !== "sign-in") {
    throw new NeonWebhookError(400, "Finalidade do código não suportada.");
  }
  if (data.delivery_preference !== undefined && data.delivery_preference !== "email") {
    throw new NeonWebhookError(400, "Canal de envio não suportado.");
  }
  if (typeof data.otp_code !== "string" || !/^\d{6}$/.test(data.otp_code)) {
    throw new NeonWebhookError(400, "Código de autenticação inválido.");
  }
  if (typeof data.expires_at !== "string" || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= now) {
    throw new NeonWebhookError(400, "Código de autenticação expirado.");
  }
  return payload as unknown as OtpEvent;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] as string);
}

export function renderMagicLinkEmail(linkType: LinkType, linkUrl: string): EmailContent {
  const copy: Record<LinkType, { subject: string; eyebrow: string; title: string; intro: string; button: string; safety: string }> = {
    "forget-password": {
      subject: "Redefina sua senha",
      eyebrow: "RECUPERAÇÃO DE ACESSO",
      title: "Redefina sua senha",
      intro: "Recebemos uma solicitação para redefinir a senha da sua conta MyCatalog. Use o botão abaixo para escolher uma nova senha.",
      button: "Redefinir minha senha",
      safety: "Se você não pediu para redefinir sua senha, ignore este e-mail. Sua senha continuará a mesma.",
    },
    "sign-in": {
      subject: "Acesse sua conta no MyCatalog",
      eyebrow: "LINK DE ACESSO",
      title: "Entre no MyCatalog",
      intro: "Você pediu um link seguro para entrar na sua conta MyCatalog. Use o botão abaixo para continuar.",
      button: "Entrar no MyCatalog",
      safety: "Se você não pediu este link, ignore este e-mail. Ninguém poderá entrar na sua conta por ele depois de expirar.",
    },
    "email-verification": {
      subject: "Confirme seu e-mail no MyCatalog",
      eyebrow: "CONFIRMAÇÃO DE E-MAIL",
      title: "Confirme seu e-mail",
      intro: "Falta só mais um passo para confirmar seu endereço e concluir a configuração da sua conta MyCatalog.",
      button: "Confirmar meu e-mail",
      safety: "Se você não criou uma conta no MyCatalog, ignore este e-mail.",
    },
  };

  const content = copy[linkType];
  const safeLink = escapeHtml(linkUrl);
  const html = `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
  <body style="margin:0;padding:0;background-color:#090b10;color:#f6f7fb;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#090b10;">
      <tr><td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
          <tr><td style="padding:0 0 18px 2px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td width="5" style="width:5px;border-radius:4px;background-color:#8b5cf6;font-size:0;line-height:0;">&nbsp;</td>
              <td style="padding-left:10px;color:#f6f7fb;font-size:19px;font-weight:750;letter-spacing:-0.4px;">MyCatalog</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:34px 32px 30px;border:1px solid #252a35;border-radius:16px;background-color:#11151d;">
            <p style="margin:0 0 12px;color:#a78bfa;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:1.4;">${content.eyebrow}</p>
            <h1 style="margin:0 0 14px;color:#f6f7fb;font-size:26px;font-weight:700;letter-spacing:-0.6px;line-height:1.2;">${content.title}</h1>
            <p style="margin:0 0 26px;color:#c1c5d0;font-size:15px;line-height:1.65;">${content.intro}</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 25px;">
              <tr><td align="center" style="border-radius:9px;background-color:#8b5cf6;">
                <a href="${safeLink}" target="_blank" style="display:inline-block;padding:14px 20px;border:1px solid #8b5cf6;border-radius:9px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">${content.button}</a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#a7adba;font-size:12px;line-height:1.55;">Se o botão não funcionar, copie e cole este link no navegador:</p>
            <p style="margin:0 0 24px;overflow-wrap:anywhere;word-break:break-word;font-size:12px;line-height:1.6;"><a href="${safeLink}" style="color:#b9a3ff;text-decoration:underline;">${safeLink}</a></p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #292e39;">
              <tr><td style="padding-top:18px;color:#a7adba;font-size:12px;line-height:1.6;">
                <strong style="color:#d4d7df;font-weight:650;">Este link tem validade limitada.</strong><br>${content.safety}
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="padding:20px 12px 0;color:#777e8c;font-size:12px;line-height:1.6;">MyCatalog<br><a href="https://www.catalogmy.pro" style="color:#8f96a4;text-decoration:none;">catalogmy.pro</a></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = `${content.title}\n\n${content.intro}\n\n${content.button}: ${linkUrl}\n\nEste link tem validade limitada.\n${content.safety}\n\nMyCatalog\nhttps://www.catalogmy.pro`;
  return { subject: content.subject, html, text };
}

export function renderOtpEmail(otpType: OtpType, otpCode: string, expiresAt: string): EmailContent {
  const copy: Record<OtpType, { subject: string; eyebrow: string; title: string; intro: string; safety: string }> = {
    "email-verification": {
      subject: "Seu código de confirmação do MyCatalog",
      eyebrow: "CONFIRMAÇÃO DE E-MAIL",
      title: "Confirme seu endereço",
      intro: "Digite este código na página de verificação para concluir a criação da sua conta.",
      safety: "Se você não criou uma conta no MyCatalog, ignore esta mensagem.",
    },
    "forget-password": {
      subject: "Seu código para redefinir a senha do MyCatalog",
      eyebrow: "RECUPERAÇÃO DE ACESSO",
      title: "Redefina sua senha",
      intro: "Use este código na página de recuperação de senha para continuar.",
      safety: "Se você não pediu para redefinir sua senha, ignore esta mensagem. Sua senha continuará a mesma.",
    },
    "sign-in": {
      subject: "Seu código de acesso ao MyCatalog",
      eyebrow: "ACESSO À CONTA",
      title: "Entre no MyCatalog",
      intro: "Digite este código na página de acesso para continuar.",
      safety: "Se você não pediu este código, ignore esta mensagem e proteja sua conta.",
    },
  };
  const content = copy[otpType];
  const expiryMinutes = Math.max(1, Math.ceil((Date.parse(expiresAt) - Date.now()) / 60_000));
  const codeHtml = escapeHtml(otpCode);
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:#090b10;color:#f6f7fb;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090b10"><tr><td align="center" style="padding:36px 16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
      <tr><td style="padding:0 0 18px 2px;color:#f6f7fb;font-size:19px;font-weight:750">▌ MyCatalog</td></tr>
      <tr><td style="padding:34px 32px 30px;border:1px solid #252a35;border-radius:16px;background:#11151d">
        <p style="margin:0 0 12px;color:#a78bfa;font-size:11px;font-weight:700;letter-spacing:1.2px">${content.eyebrow}</p>
        <h1 style="margin:0 0 14px;font-size:26px;line-height:1.2">${content.title}</h1>
        <p style="margin:0 0 24px;color:#c1c5d0;font-size:15px;line-height:1.65">${content.intro}</p>
        <p style="margin:0 0 22px;padding:18px;border:1px solid #343044;border-radius:12px;background:#171522;color:#c4b5fd;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;font-variant-numeric:tabular-nums">${codeHtml}</p>
        <p style="margin:0 0 18px;color:#a7adba;font-size:12px;line-height:1.6">Este código expira em aproximadamente ${expiryMinutes} minuto(s). Não compartilhe com ninguém.</p>
        <p style="margin:0;padding-top:18px;border-top:1px solid #292e39;color:#a7adba;font-size:12px;line-height:1.6">${content.safety}</p>
      </td></tr>
      <tr><td align="center" style="padding:20px 12px 0;color:#777e8c;font-size:12px">MyCatalog · <a href="https://www.catalogmy.pro" style="color:#8f96a4;text-decoration:none">catalogmy.pro</a></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return {
    subject: content.subject,
    html,
    text: `${content.title}\n\n${content.intro}\n\nCódigo: ${otpCode}\n\nO código expira em aproximadamente ${expiryMinutes} minuto(s). Não compartilhe com ninguém.\n${content.safety}\n\nMyCatalog · https://www.catalogmy.pro`,
  };
}

async function readBody(request: Request): Promise<Buffer> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new NeonWebhookError(413, "O evento enviado é grande demais.");
  }
  if (!request.body) throw new NeonWebhookError(400, "Evento de autenticação inválido.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new NeonWebhookError(413, "O evento enviado é grande demais.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function sendWithResend(
  event: MagicLinkEvent | OtpEvent,
  content: EmailContent,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `neon-auth/${event.event_id}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [event.user.email],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new NeonWebhookError(503, "O envio do e-mail falhou temporariamente.");
  }

  if (response.ok) {
    await response.body?.cancel().catch(() => {});
    return;
  }

  let resendErrorName = "";
  if (response.status === 409) {
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload) && typeof payload.name === "string") resendErrorName = payload.name;
    } catch { /* O corpo não é necessário para tratar outros erros. */ }
  } else {
    await response.body?.cancel().catch(() => {});
  }

  if (response.status === 408 || response.status === 429 || response.status >= 500 || resendErrorName === "concurrent_idempotent_requests") {
    throw new NeonWebhookError(503, "O envio do e-mail falhou temporariamente.");
  }
  throw new NeonWebhookError(400, "O provedor de e-mail recusou a solicitação.");
}

export async function handleNeonAuthEmailWebhook(
  request: Request,
  dependencies: WebhookDependencies = {}
): Promise<Response> {
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;
  const authBaseUrl = env.NEON_AUTH_BASE_URL?.trim() || env.NEON_AUTH_URL?.trim() || "";
  const resendApiKey = env.RESEND_API_KEY?.trim() || "";
  if (!authBaseUrl || !resendApiKey) return jsonResponse(503, "Webhook não está configurado.");

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return jsonResponse(415, "Envie o evento como JSON.");

  try {
    const rawBody = await readBody(request);
    const signature = request.headers.get("x-neon-signature") || "";
    const kid = request.headers.get("x-neon-signature-kid") || "";
    const timestamp = request.headers.get("x-neon-timestamp") || "";
    const eventId = request.headers.get("x-neon-event-id") || "";
    const headerEventType = request.headers.get("x-neon-event-type") || "";
    if (!signature || !kid || !timestamp || !eventId || !headerEventType) {
      throw new NeonWebhookError(401, "Cabeçalhos do webhook incompletos.");
    }

    validateFreshTimestamp(timestamp, now());
    const jwk = dependencies.getPublicJwk
      ? await dependencies.getPublicJwk(authBaseUrl, kid)
      : await getCachedPublicJwk(authBaseUrl, kid, fetchImpl, now);
    if (!jwk || !verifyNeonWebhookSignature(rawBody, signature, kid, timestamp, jwk, now())) {
      throw new NeonWebhookError(401, "Assinatura do webhook inválida.");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new NeonWebhookError(400, "Evento de autenticação inválido.");
    }
    if (!isRecord(payload) || payload.event_id !== eventId || payload.event_type !== headerEventType) {
      throw new NeonWebhookError(400, "Cabeçalhos e evento não correspondem.");
    }

    if (!isRecord(payload)) throw new NeonWebhookError(400, "Evento de autenticação inválido.");
    let event: MagicLinkEvent | OtpEvent;
    let content: EmailContent;
    if (payload.event_type === "send.magic_link") {
      event = parseMagicLinkEvent(payload, authBaseUrl, now());
      content = renderMagicLinkEmail(event.event_data.link_type, event.event_data.link_url);
    } else if (payload.event_type === "send.otp") {
      event = parseOtpEvent(payload, now());
      content = renderOtpEmail(event.event_data.otp_type, event.event_data.otp_code, event.event_data.expires_at);
    } else {
      throw new NeonWebhookError(400, "Evento de autenticação não suportado.");
    }
    await sendWithResend(event, content, resendApiKey, fetchImpl);
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NeonWebhookError) return jsonResponse(error.status, error.publicMessage);
    return jsonResponse(503, "Não foi possível processar o evento agora.");
  }
}
