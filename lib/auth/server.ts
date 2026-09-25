import { createNeonAuth } from "@neondatabase/auth/next/server";

const baseUrl =
  process.env.NEON_AUTH_BASE_URL?.trim() ||
  process.env.NEON_AUTH_URL?.trim() ||
  "https://auth.neon.tech";

const cookieSecret =
  process.env.NEON_AUTH_COOKIE_SECRET?.trim() ||
  "d890bfa3f80c45169a6efd019f394c8e7b3017a58e23f99e43681726a8f15d2a";

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret.length >= 32 ? cookieSecret : cookieSecret.padEnd(32, "0"),
    sessionDataTtl: 300,
  },
});
