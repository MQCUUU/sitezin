// Drift de schema (Fase 6 — P2-13): compara o schema public de dois bancos, SOMENTE LEITURA.
//
//   npm run db:drift -- --a TEST_DATABASE_URL --b REBUILD_DATABASE_URL
//   npm run db:drift -- --a TEST_DATABASE_URL --snapshot out.json      (só tira a foto)
//
// Compara: tabelas, colunas (tipo/nulo/default), constraints, índices, funções,
// triggers, RLS e extensões. Ignora public.schema_migrations (controle do runner).
// Nunca imprime connection strings.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
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

const IGNORE = new Set(["schema_migrations"]);

export async function snapshot(url) {
  const sql = neon(url);
  const q = (t) => sql.query(t);
  const [tables, columns, constraints, indexes, functions, triggers, extensions] = await Promise.all([
    q(`SELECT c.relname AS t, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`),
    q(`SELECT c.relname AS t, a.attname AS c, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS nn,
              a.attidentity AS idn, pg_get_expr(d.adbin, d.adrelid) AS def
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped`),
    q(`SELECT rel.relname AS t, con.conname AS name, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace
       WHERE n.nspname = 'public'`),
    q(`SELECT tablename AS t, indexname AS name, indexdef AS def FROM pg_indexes WHERE schemaname = 'public'`),
    q(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS name, md5(pg_get_functiondef(p.oid)) AS hash
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`),
    q(`SELECT c.relname AS t, t.tgname AS name, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal`),
    q(`SELECT extname AS name FROM pg_extension`),
  ]);
  const keep = (r) => !IGNORE.has(r.t);
  const map = (rows, key, val) => Object.fromEntries(rows.filter(keep).map((r) => [key(r), val(r)]));
  return {
    tables: map(tables, (r) => r.t, (r) => ({ rls: r.rls })),
    columns: map(columns, (r) => `${r.t}.${r.c}`, (r) => ({ type: r.type, notnull: r.nn, identity: r.idn || "", default: r.def })),
    constraints: map(constraints, (r) => `${r.t}.${r.name}`, (r) => r.def),
    indexes: map(indexes, (r) => `${r.t}.${r.name}`, (r) => r.def),
    functions: Object.fromEntries(functions.map((r) => [r.name, r.hash])),
    triggers: map(triggers, (r) => `${r.t}.${r.name}`, (r) => r.def),
    extensions: Object.fromEntries(extensions.map((r) => [r.name, true])),
  };
}

export function diff(a, b) {
  const out = [];
  for (const section of Object.keys(a)) {
    const keys = new Set([...Object.keys(a[section]), ...Object.keys(b[section] || {})]);
    for (const key of [...keys].sort()) {
      const va = a[section][key];
      const vb = (b[section] || {})[key];
      if (va === undefined) out.push({ section, key, kind: "só em B", b: vb });
      else if (vb === undefined) out.push({ section, key, kind: "só em A", a: va });
      else if (JSON.stringify(va) !== JSON.stringify(vb)) out.push({ section, key, kind: "diferente", a: va, b: vb });
    }
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const aName = opt("--a") || "DATABASE_URL";
  const urlA = env[aName];
  if (!urlA) throw new Error(`${aName} não definida.`);
  const snapA = await snapshot(urlA);
  if (opt("--snapshot")) {
    fs.writeFileSync(opt("--snapshot"), JSON.stringify(snapA, null, 1));
    return console.log(`snapshot de ${aName} salvo.`);
  }
  const bName = opt("--b");
  if (!bName || !env[bName]) throw new Error("informe --b <VARIAVEL> com a segunda connection string.");
  const result = diff(snapA, await snapshot(env[bName]));
  console.log(`drift ${aName} (A) × ${bName} (B): ${result.length} diferença(s)`);
  for (const d of result) console.log(`  [${d.section}] ${d.kind}: ${d.key}${d.kind === "diferente" ? `\n      A: ${JSON.stringify(d.a)}\n      B: ${JSON.stringify(d.b)}` : ""}`);
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(result, null, 1));
  process.exitCode = result.length ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`erro: ${error.message}`);
    process.exit(1);
  });
}
