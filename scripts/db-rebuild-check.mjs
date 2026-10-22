// Prova que o repositório recria o banco (Fase 6 — P2-13).
//
//   npm run db:rebuild-check            cria um banco DESCARTÁVEL no compute do TEST, aplica
//                                       db/migrations do zero, compara com o TEST, faz um smoke
//                                       de integridade e APAGA o banco no fim
//   npm run db:rebuild-check -- --keep  mantém o banco (imprime só o NOME, nunca a URL)
//
// Usa TEST_DATABASE_URL (nunca PROD — recusa se o host for o de PROD_DATABASE_URL).
// O schema neon_auth (do Neon Auth) é simulado por db/dev/neon-auth-stub.sql: o app real
// precisa do Neon Auth habilitado no branch (ver db/README.md).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, neon } from "@neondatabase/serverless";

import { isProductionUrl, loadEnv, runMigrations } from "./db-migrate.mjs";
import { diff, snapshot } from "./db-drift.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");

const KNOWN_DRIFT = {
  "tables.playing_with_neon": "resíduo: tabela de exemplo criada pela Neon (fora da baseline de propósito)",
};

async function smoke(url) {
  const client = new Client(url);
  await client.connect();
  const ok = [];
  const check = (label, cond) => {
    if (!cond) throw new Error(`smoke falhou: ${label}`);
    ok.push(label);
  };
  try {
    const user = crypto.randomUUID();
    const other = crypto.randomUUID();
    await client.query(`INSERT INTO neon_auth."user"(id, email) VALUES ($1, 'a@exemplo.test'), ($2, 'b@exemplo.test')`, [user, other]);
    await client.query(`INSERT INTO public.profiles(id, username) VALUES ($1, 'smoke_a')`, [user]);
    const media = (await client.query(`INSERT INTO public.media(tmdb_id, media_type, title) VALUES (603, 'movie', 'Matrix') RETURNING id`)).rows[0].id;
    const item = (await client.query(`INSERT INTO public.library_items(user_id, media_id, status) VALUES ($1, $2, 'want') RETURNING id`, [user, media])).rows[0].id;
    check("biblioteca: insere item", Boolean(item));

    let duplicateBlocked = false;
    try {
      await client.query(`INSERT INTO public.library_items(user_id, media_id) VALUES ($1, $2)`, [user, media]);
    } catch (error) {
      duplicateBlocked = error.code === "23505";
    }
    check("biblioteca: mesmo título 2× é barrado (unique)", duplicateBlocked);

    let badStatus = false;
    try {
      await client.query(`INSERT INTO public.library_items(user_id, media_id, status) VALUES ($1, $2, 'invalido')`, [other, media]);
    } catch (error) {
      badStatus = error.code === "23514";
    }
    check("biblioteca: status fora da lista é barrado (CHECK)", badStatus);

    const list = (await client.query(`INSERT INTO public.custom_lists(user_id, name) VALUES ($1, 'Smoke') RETURNING id`, [user])).rows[0].id;
    await client.query(`INSERT INTO public.custom_list_items(list_id, media_id) VALUES ($1, $2)`, [list, media]);
    check("listas: lista + item", true);

    const rl = await client.query(
      `INSERT INTO public.api_rate_limits(user_id, action, window_started_at, request_count) VALUES ($1, 'assistant', clock_timestamp(), 1)
       ON CONFLICT (user_id, action) DO UPDATE SET request_count = api_rate_limits.request_count + 1 RETURNING request_count`,
      [user]
    );
    check("rate limit: tabela api_rate_limits existe e aceita o upsert do assistente", Number(rl.rows[0].request_count) === 1);

    await client.query(`INSERT INTO public.watch_entries(user_id, media_id, library_item_id) VALUES ($1, $2, $3)`, [user, media, item]);
    await client.query(`DELETE FROM public.library_items WHERE id = $1`, [item]);
    const kept = (await client.query(`SELECT count(*)::int AS n, count(library_item_id)::int AS linked FROM public.watch_entries WHERE user_id = $1`, [user])).rows[0];
    check("remover da biblioteca preserva o histórico (FK SET NULL)", kept.n === 1 && kept.linked === 0);

    await client.query(`DELETE FROM neon_auth."user" WHERE id = $1`, [user]);
    const left = (await client.query(
      `SELECT (SELECT count(*) FROM public.profiles WHERE id = $1) + (SELECT count(*) FROM public.custom_lists WHERE user_id = $1)
            + (SELECT count(*) FROM public.watch_entries WHERE user_id = $1) + (SELECT count(*) FROM public.api_rate_limits WHERE user_id = $1) AS n`,
      [user]
    )).rows[0].n;
    check("excluir a conta apaga em cascata todos os dados do usuário", Number(left) === 0);
    const otherLeft = (await client.query(`SELECT count(*)::int AS n FROM neon_auth."user" WHERE id = $1`, [other])).rows[0].n;
    check("excluir uma conta não toca outra", otherLeft === 1);
  } finally {
    await client.end();
  }
  return ok;
}

async function main() {
  const env = loadEnv();
  const testUrl = env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL não definida.");
  if (isProductionUrl(testUrl, env)) throw new Error("TEST_DATABASE_URL aponta para PRODUÇÃO. Recusado.");

  const name = `mycatalog_rebuild_${new Date().toISOString().replace(/\D/g, "").slice(0, 12)}`;
  const target = new URL(testUrl);
  target.pathname = `/${name}`;
  const rebuildUrl = target.toString();
  const admin = neon(testUrl);

  console.log(`criando banco descartável ${name} (no compute do TEST)…`);
  await admin.query(`CREATE DATABASE ${name}`);
  let failed = false;
  try {
    const client = new Client(rebuildUrl);
    await client.connect();
    await client.query(fs.readFileSync(path.join(root, "db", "dev", "neon-auth-stub.sql"), "utf8"));
    await client.end();

    await runMigrations(rebuildUrl, { label: name });

    const drift = diff(await snapshot(testUrl), await snapshot(rebuildUrl));
    const unexpected = drift.filter((d) => !KNOWN_DRIFT[`${d.section}.${d.key}`] && !d.key.startsWith("playing_with_neon"));
    console.log(`drift TEST × recriado: ${drift.length} diferença(s), ${unexpected.length} inesperada(s)`);
    for (const d of drift) {
      const known = KNOWN_DRIFT[`${d.section}.${d.key}`] || (d.key.startsWith("playing_with_neon") ? KNOWN_DRIFT["tables.playing_with_neon"] : null);
      console.log(`  [${d.section}] ${d.kind}: ${d.key}${known ? ` — ${known}` : "  <== INESPERADA"}`);
    }

    const checks = await smoke(rebuildUrl);
    for (const c of checks) console.log(`  ✓ ${c}`);
    if (unexpected.length) {
      failed = true;
      console.log("RESULTADO: schema recriado DIFERENTE do TEST (ver acima).");
    } else {
      console.log("RESULTADO: o repositório recria o schema do TEST (só diferenças conhecidas).");
    }
  } catch (error) {
    failed = true;
    console.error(`erro: ${error.message}`);
  } finally {
    if (keep) {
      console.log(`banco mantido: ${name} (apague com DROP DATABASE quando terminar).`);
    } else {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      console.log(`banco descartável ${name} apagado.`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`erro: ${error.message}`);
  process.exit(1);
});
