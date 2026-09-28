import { createNeonAuth } from "@neondatabase/auth/next/server";

import { getAuthCookieSecret } from "@/lib/auth/cookie-secret";

const baseUrl =
  process.env.NEON_AUTH_BASE_URL?.trim() ||
  process.env.NEON_AUTH_URL?.trim() ||
  "https://auth.neon.tech";

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: getAuthCookieSecret(),
    sessionDataTtl: 300,
  },
});
