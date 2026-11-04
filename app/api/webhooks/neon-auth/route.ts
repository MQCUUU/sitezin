import { handleNeonAuthEmailWebhook } from "@/lib/auth/neon-email-webhook";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleNeonAuthEmailWebhook(request);
}
