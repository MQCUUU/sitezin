import { neon } from "@neondatabase/serverless";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url.includes("COLOCAR_AQUI")) {
    throw new Error(
      "[Database Error] A variável de ambiente DATABASE_URL não foi configurada no .env.local. " +
      "Copie a connection string no console da Neon: Dashboard -> Connection Details -> Connection string."
    );
  }
  return url;
}

export function getDb() {
  return neon(getDatabaseUrl());
}
