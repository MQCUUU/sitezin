// Checagem ao vivo do banco (Fase 6), SOMENTE LEITURA: npm run test:db [-- --env TEST_DATABASE_URL]
//  - nenhuma migration pendente (e nenhuma alterada depois de aplicada);
//  - tabelas críticas existem, com RLS ligado;
//  - nenhum privilégio para papéis anônimos (anon/authenticated/public) no schema public.
import { neon } from "@neondatabase/serverless";

import { loadEnv, runMigrations } from "./db-migrate.mjs";

const args = process.argv.slice(2);
const varName = args.includes("--env") ? args[args.indexOf("--env") + 1] : "DATABASE_URL";
const env = loadEnv();
const url = env[varName];
if (!url) {
  console.error(`${varName} não definida.`);
  process.exit(1);
}

const CRITICAL = ["profiles", "library_items", "custom_lists", "custom_list_items", "watch_entries", "episodes_progress", "api_rate_limits", "user_preferences"];
const failures = [];

const { pending } = await runMigrations(url, { status: true, label: varName, log: () => {} });
if (pending.length) failures.push(`migrations pendentes: ${pending.join(", ")}`);

const sql = neon(url);
const rows = await sql.query(
  `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`,
  [CRITICAL]
);
for (const t of CRITICAL) {
  const row = rows.find((r) => r.relname === t);
  if (!row) failures.push(`tabela ausente: ${t}`);
  else if (!row.relrowsecurity) failures.push(`RLS desligado: ${t}`);
}
const grants = await sql.query(
  `SELECT table_name, grantee FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')`
);
for (const g of grants) failures.push(`privilégio indevido: ${g.grantee} em ${g.table_name}`);

console.log(`banco ${varName}: ${failures.length ? "FALHOU" : "ok"} (migrations em dia, ${CRITICAL.length} tabelas críticas com RLS, sem acesso anônimo)`);
for (const f of failures) console.log(`  ✖ ${f}`);
process.exitCode = failures.length ? 1 : 0;
