import { neon } from "@neondatabase/serverless";
import { neonEndpointId } from "@/lib/env-check";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url.includes("COLOCAR_AQUI")) {
    throw new Error(
      "[Database Error] A variável de ambiente DATABASE_URL não foi configurada no .env.local. " +
      "Copie a connection string no console da Neon: Dashboard -> Connection Details -> Connection string."
    );
  }

  // No localhost, o DATABASE_URL pode usar um papel sem bypass do RLS,
  // enquanto DATABASE_URL_UNPOOLED usa o papel do app. Só trocamos quando
  // ambos apontam para o mesmo endpoint e nunca fazemos isso em produção.
  if (process.env.NODE_ENV !== "production") {
    const unpooledUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
    const endpoint = neonEndpointId(url);

    if (
      unpooledUrl &&
      endpoint &&
      neonEndpointId(unpooledUrl) === endpoint &&
      endpoint !== neonEndpointId(process.env.PROD_DATABASE_URL)
    ) {
      return unpooledUrl;
    }
  }

  return url;
}

export function getDb() {
  return neon(getDatabaseUrl());
}
