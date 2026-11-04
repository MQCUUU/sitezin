import assert from "node:assert/strict";
import test from "node:test";
import { requiresEmailVerification } from "../lib/auth-client.ts";

test("recognizes Neon and Better Auth unverified-email error codes", () => {
  assert.equal(requiresEmailVerification({ code: "EMAIL_NOT_VERIFIED" }), true);
  assert.equal(requiresEmailVerification({ code: "email_not_confirmed" }), true);
});

test("recognizes unverified-email messages returned with generic status codes", () => {
  assert.equal(requiresEmailVerification({ status: 403, code: "FEATURE_NOT_SUPPORTED", message: "Email not verified" }), true);
  assert.equal(requiresEmailVerification({ status: 422, message: "Please confirm your email before signing in" }), true);
});

test("does not treat invalid credentials as an email-verification error", () => {
  assert.equal(requiresEmailVerification({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" }), false);
  assert.equal(requiresEmailVerification({ code: "FEATURE_NOT_SUPPORTED", status: 403, message: "Provider not supported" }), false);
});
