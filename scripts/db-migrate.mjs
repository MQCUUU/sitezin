// Migrations do MyCatalog (Fase 6 — P2-13). SQL puro, em ordem, com registro.
//
//   npm run db:migrate -- --status                 o que já foi aplicado / o que falta
//   npm run db:migrate                              aplica o que falta (cada arquivo numa transação)
//   npm run db:migrate -- --baseline               banco JÁ existente: registra a 0001 sem executá-la
//   npm run db:migrate -- --env TEST_DATABASE_URL   escolhe a variável da connection string (padrão: DATABASE_URL)
//
// Lê .env.local (sem imprimir valores). RECUSA o banco de produção (mesmo host de
// PROD_DATABASE_URL) a menos que MIGRATE_ALLOW_PROD=1 E --allow-prod — produção só
// depois de revisão (ver db/README.md).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@neondatabase/serverless";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "db", "migrations");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function loadEnv() {
  const env = { ...process.env };
  const file = path.join(root, ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const host = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};

export function listMigrations(folder = dir) {
  return fs
    .readdirSync(folder)
    .filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const text = fs.readFileSync(path.join(folder, name), "utf8");
      return { name, text, checksum: crypto.createHash("sha256").update(text).digest("hex") };
    });
}

/** Aplica (ou só lista / registra a baseline) as migrations num banco. Usado pelo CLI e por db-rebuild-check. */
export async function runMigrations(url, { status = false, baseline = false, label = "banco", log = console.log } = {}) {
  const migrations = listMigrations();
  const client = new Client(url);
  await client.connect();
  try {
    // --status é só leitura: não cria a tabela de controle.
    const hasTable = (await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok")).rows[0].ok;
    if (status && !hasTable) {
      log(`alvo: ${label} | sem public.schema_migrations (nenhuma migration registrada) | pendentes: ${migrations.length}`);
      for (const m of migrations) log(`  · ${m.name}`);
      return { applied: [], pending: migrations.map((m) => m.name) };
    }
    if (!status) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
          filename   text PRIMARY KEY,
          checksum   text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`);
      await client.query("ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY");
    }
    const applied = new Map((await client.query("SELECT filename, checksum FROM public.schema_migrations")).rows.map((r) => [r.filename, r.checksum]));

    for (const m of migrations) {
      if (applied.has(m.name) && applied.get(m.name) !== m.checksum) {
        throw new Error(`${m.name} foi ALTERADA depois de aplicada (checksum diferente). Crie uma migration nova em vez de editar.`);
      }
    }

    const pending = migrations.filter((m) => !applied.has(m.name));
    log(`alvo: ${label} | aplicadas: ${applied.size} | pendentes: ${pending.length}`);
    for (const m of migrations) log(`  ${applied.has(m.name) ? "✓" : "·"} ${m.name}`);
    if (status) return { applied: [...applied.keys()], pending: pending.map((m) => m.name) };

    if (baseline) {
      const base = migrations[0];
      if (!base || applied.has(base.name)) {
        log("baseline já registrada.");
        return { applied: [...applied.keys()], pending: pending.map((m) => m.name) };
      }
      const exists = (await client.query("SELECT to_regclass('public.library_items') IS NOT NULL AS ok")).rows[0].ok;
      if (!exists) throw new Error("--baseline é para banco que JÁ tem o schema; este parece vazio — rode sem --baseline.");
      await client.query("INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)", [base.name, base.checksum]);
      log(`registrada (sem executar): ${base.name}`);
      return { applied: [...applied.keys(), base.name], pending: pending.slice(1).map((m) => m.name) };
    }

    const done = [];
    for (const m of pending) {
      log(`aplicando ${m.name}…`);
      await client.query("BEGIN");
      try {
        await client.query(m.text);
        await client.query("INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)", [m.name, m.checksum]);
        await client.query("COMMIT");
        done.push(m.name);
      } catch (error) {
        await client.query("ROLLBACK");
        log(`FALHOU ${m.name} (nada desta migration ficou aplicado)`);
        throw error;
      }
    }
    return { applied: [...applied.keys(), ...done], pending: [] };
  } finally {
    await client.end();
  }
}

/** Mesmo host da connection string de PROD? */
export function isProductionUrl(url, env) {
  return Boolean(env.PROD_DATABASE_URL) && host(url) === host(env.PROD_DATABASE_URL);
}

async function main() {
  const env = loadEnv();
  const varName = opt("--env", "DATABASE_URL");
  const url = env[varName];
  if (!url) throw new Error(`${varName} não definida.`);
  if (isProductionUrl(url, env)) {
    if (!(flag("--allow-prod") && env.MIGRATE_ALLOW_PROD === "1")) {
      throw new Error(`${varName} aponta para PRODUÇÃO. Recusado. (Revisão + MIGRATE_ALLOW_PROD=1 + --allow-prod.)`);
    }
    console.warn("ATENÇÃO: aplicando em PRODUÇÃO (liberado explicitamente).");
  }
  await runMigrations(url, { status: flag("--status"), baseline: flag("--baseline"), label: varName });
}

export { loadEnv };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`erro: ${error.message}`);
    process.exit(1);
  });
}
