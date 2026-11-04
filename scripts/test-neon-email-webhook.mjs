import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  handleNeonAuthEmailWebhook,
  renderMagicLinkEmail,
  renderOtpEmail,
} from "../lib/auth/neon-email-webhook.ts";

const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const AUTH_BASE = "https://auth.example.neon.tech";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "EdDSA", use: "sig" };

function makeEvent(linkType = "forget-password", eventId = "evt_123") {
  return {
    event_id: eventId,
    event_type: "send.magic_link",
    timestamp: new Date(NOW).toISOString(),
    user: { email: "person@example.com" },
    event_data: {
      link_type: linkType,
      link_url: `${AUTH_BASE}/magic-link?token=secret-token&callbackURL=https%3A%2F%2Fwww.catalogmy.pro%2Freset-password`,
      expires_at: new Date(NOW + 15 * 60_000).toISOString(),
    },
  };
}

function makeOtpEvent(otpType = "email-verification", eventId = "evt_otp_123") {
  return {
    event_id: eventId,
    event_type: "send.otp",
    timestamp: new Date(NOW).toISOString(),
    user: { email: "person@example.com" },
    event_data: {
      otp_code: "123456",
      otp_type: otpType,
      delivery_preference: "email",
      expires_at: new Date(NOW + 5 * 60_000).toISOString(),
    },
  };
}

function signedHeaders(rawBody, event, overrides = {}) {
  const timestamp = String(NOW);
  const protectedHeader = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: "test-key" })).toString("base64url");
  const payloadB64 = Buffer.from(rawBody).toString("base64url");
  const signaturePayloadB64 = Buffer.from(`${timestamp}.${payloadB64}`).toString("base64url");
  const signingInput = `${protectedHeader}.${signaturePayloadB64}`;
  const signature = sign(null, Buffer.from(signingInput), privateKey).toString("base64url");
  return new Headers({
    "content-type": "application/json",
    "x-neon-signature": `${protectedHeader}..${signature}`,
    "x-neon-signature-kid": "test-key",
    "x-neon-timestamp": timestamp,
    "x-neon-event-id": event.event_id,
    "x-neon-event-type": event.event_type,
    ...overrides,
  });
}

function makeRequest(event, headerOverrides = {}) {
  const rawBody = JSON.stringify(event);
  return new Request("https://www.catalogmy.pro/api/webhooks/neon-auth", {
    method: "POST",
    headers: signedHeaders(rawBody, event, headerOverrides),
    body: rawBody,
  });
}

function dependencies(fetchImpl, overrides = {}) {
  return {
    env: { NEON_AUTH_BASE_URL: AUTH_BASE, RESEND_API_KEY: "test-resend-key" },
    fetchImpl,
    now: () => NOW,
    getPublicJwk: async () => publicJwk,
    ...overrides,
  };
}

test("password reset sends the Neon URL through Resend and renders the recovery template", async () => {
  const event = makeEvent();
  let sent;
  const response = await handleNeonAuthEmailWebhook(makeRequest(event), dependencies(async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    sent = { init, body: JSON.parse(init.body) };
    return Response.json({ id: "email_1" }, { status: 200 });
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(sent.body.to, [event.user.email]);
  assert.equal(sent.body.from, "MyCatalog <noreply@catalogmy.pro>");
  assert.equal(sent.body.subject, "Redefina sua senha");
  assert.equal(sent.body.html.includes(event.event_data.link_url.replaceAll("&", "&amp;")), true);
  assert.equal(sent.body.text.includes(event.event_data.link_url), true);
  assert.equal(sent.init.headers["Idempotency-Key"], `neon-auth/${event.event_id}`);
  assert.match(sent.body.html, /ignore este e-mail/);
});

test("all magic-link types select their own subject, CTA, and copy", () => {
  const cases = [
    ["forget-password", "Redefina sua senha", "Redefinir minha senha"],
    ["sign-in", "Acesse sua conta no MyCatalog", "Entrar no MyCatalog"],
    ["email-verification", "Confirme seu e-mail no MyCatalog", "Confirmar meu e-mail"],
  ];
  for (const [type, subject, button] of cases) {
    const rendered = renderMagicLinkEmail(type, `${AUTH_BASE}/safe?token=abc`);
    assert.equal(rendered.subject, subject);
    assert.match(rendered.html, new RegExp(button));
    assert.match(rendered.text, new RegExp(button));
    assert.match(rendered.html, /<table role="presentation"/);
  }
});

test("email-verification magic links are acknowledged without sending; other magic-link flows stay unchanged", async () => {
  const event = makeEvent("email-verification", "evt_verification_link");
  let called = false;
  const response = await handleNeonAuthEmailWebhook(makeRequest(event), dependencies(async () => {
    called = true;
    return Response.json({ id: "should_not_send" });
  }));
  assert.equal(response.status, 200);
  assert.equal(called, false);

  const signInEvent = makeEvent("sign-in", "evt_sign_in_link");
  const signInResponse = await handleNeonAuthEmailWebhook(makeRequest(signInEvent), dependencies(async () => Response.json({ id: "email_sign_in" })));
  assert.equal(signInResponse.status, 200);
});

test("send.otp sends a distinct email for each supported purpose without logging or altering the code", async () => {
  for (const [type, subject] of [
    ["email-verification", "Seu código de confirmação do MyCatalog"],
    ["forget-password", "Seu código para redefinir a senha do MyCatalog"],
    ["sign-in", "Seu código de acesso ao MyCatalog"],
  ]) {
    const event = makeOtpEvent(type, `evt_${type}`);
    let sent;
    const response = await handleNeonAuthEmailWebhook(makeRequest(event), dependencies(async (_url, init) => {
      sent = { body: JSON.parse(init.body), idempotencyKey: init.headers["Idempotency-Key"] };
      return Response.json({ id: "email_otp" }, { status: 200 });
    }));
    assert.equal(response.status, 200);
    assert.equal(sent.body.subject, subject);
    assert.equal(sent.body.to[0], event.user.email);
    assert.match(sent.body.html, /123456/);
    assert.match(sent.body.text, /Código: 123456/);
    assert.equal(sent.body.html.includes("/magic-link"), false);
    assert.equal(sent.idempotencyKey, `neon-auth/${event.event_id}`);
  }
});

test("OTP rendering uses a purpose-specific template", () => {
  const rendered = renderOtpEmail("email-verification", "654321", new Date(NOW + 5 * 60_000).toISOString());
  assert.equal(rendered.subject, "Seu código de confirmação do MyCatalog");
  assert.match(rendered.html, /CONFIRMAÇÃO DE E-MAIL/);
  assert.match(rendered.text, /654321/);
  assert.doesNotMatch(rendered.html, /\/magic-link/);
});

test("rejects an invalid signature without sending email", async () => {
  const event = makeEvent();
  const request = makeRequest(event);
  const headers = new Headers(request.headers);
  headers.set("x-neon-signature", `${headers.get("x-neon-signature").slice(0, -4)}AAAA`);
  const tampered = new Request(request.url, { method: "POST", headers, body: JSON.stringify(event) });
  let called = false;
  const response = await handleNeonAuthEmailWebhook(tampered, dependencies(async () => {
    called = true;
    return Response.json({});
  }));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("rejects stale signatures and event/header mismatches", async () => {
  const event = makeEvent();
  const staleRequest = makeRequest(event);
  const staleHeaders = new Headers(staleRequest.headers);
  staleHeaders.set("x-neon-timestamp", String(NOW - 6 * 60_000));
  const stale = new Request(staleRequest.url, { method: "POST", headers: staleHeaders, body: JSON.stringify(event) });
  assert.equal((await handleNeonAuthEmailWebhook(stale, dependencies(async () => Response.json({})))).status, 401);

  const mismatched = makeRequest(event, { "x-neon-event-id": "different-id" });
  assert.equal((await handleNeonAuthEmailWebhook(mismatched, dependencies(async () => Response.json({})))).status, 400);
});

test("rejects unsupported events and unsafe or expired Neon links without sending", async () => {
  let called = false;
  const send = async () => {
    called = true;
    return Response.json({});
  };
  const unsupported = { ...makeEvent(), event_type: "send.other" };
  assert.equal((await handleNeonAuthEmailWebhook(makeRequest(unsupported), dependencies(send))).status, 400);

  for (const change of [
    (event) => { event.event_data.link_url = "https://attacker.example/reset?token=x"; },
    (event) => { event.event_data.expires_at = new Date(NOW - 1000).toISOString(); },
  ]) {
    const event = makeEvent();
    change(event);
    assert.equal((await handleNeonAuthEmailWebhook(makeRequest(event), dependencies(send))).status, 400);
  }
  assert.equal(called, false);
});

test("rejects OTP purposes, channels, codes, and expirations outside the supported contract", async () => {
  const send = async () => Response.json({});
  const mutations = [
    (event) => { event.event_data.otp_type = "change-email"; },
    (event) => { event.event_data.delivery_preference = "sms"; },
    (event) => { event.event_data.delivery_preference = "push"; },
    (event) => { event.event_data.otp_code = "12345"; },
    (event) => { event.event_data.expires_at = new Date(NOW - 1).toISOString(); },
  ];
  for (const mutate of mutations) {
    const event = makeOtpEvent();
    mutate(event);
    assert.equal((await handleNeonAuthEmailWebhook(makeRequest(event), dependencies(send))).status, 400);
  }
});

test("maps transient Resend failures to retryable 503 and does not expose provider details", async () => {
  const event = makeEvent();
  const response = await handleNeonAuthEmailWebhook(makeRequest(event), dependencies(async () =>
    Response.json({ message: "sensitive provider detail" }, { status: 429 })
  ));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /sensitive provider detail|secret-token|person@example.com/);
});
