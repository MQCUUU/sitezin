// Fase 6 — garantias das migrations, SEM banco: node scripts/test-db-migrations.mjs (ou npm test).
// Verifica o que o repositório promete (numeração, tabelas críticas, RLS, cascatas), não a ordem
// textual do SQL. A prova ao vivo (recriar do zero e comparar com o TEST) é `npm run db:rebuild-check`.
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { listMigrations } from "./db-migrate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = listMigrations();
const all = migrations.map((m) => m.text).join("\n");

const created = new Set([...all.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.("?[a-z_]+"?)/gi)].map((m) => m[1].replace(/"/g, "")));
const withRls = new Set([...all.matchAll(/ALTER TABLE public\.("?[a-z_]+"?) ENABLE ROW LEVEL SECURITY/gi)].map((m) => m[1].replace(/"/g, "")));

test("migrations: nome NNNN_descricao.sql, numeração única e contínua a partir de 0001", () => {
  assert.ok(migrations.length >= 1);
  migrations.forEach((m, i) => assert.equal(Number(m.name.slice(0, 4)), i + 1, `esperava ${String(i + 1).padStart(4, "0")}_…, achei ${m.name}`));
  const stray = fs.readdirSync(path.join(root, "db", "migrations")).filter((n) => !/^\d{4}_[a-z0-9_-]+\.sql$/.test(n));
  assert.deepEqual(stray, [], "arquivo fora do padrão em db/migrations não seria aplicado");
});

test("nenhum SQL fora de db/ (fonte única)", () => {
  const found = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", ".next", "db", "playwright-report", "test-results"].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".sql")) found.push(path.relative(root, full));
    }
  })(root);
  assert.deepEqual(found, []);
});

test("tabelas críticas existem nas migrations (inclusive api_rate_limits, antes ausente do repo)", () => {
  for (const t of [
    "media", "profiles", "library_items", "custom_lists", "custom_list_items", "watch_entries", "episodes_progress",
    "activity_events", "api_rate_limits", "user_preferences", "user_streaming_services", "follows", "review_categories",
    "review_scores", "user_hidden_titles", "username_changes",
  ]) {
    assert.ok(created.has(t), `faltou CREATE TABLE public.${t}`);
  }
});

test("RLS ligado em toda tabela criada (padrão: sem policies, app como dono)", () => {
  const missing = [...created].filter((t) => !withRls.has(t));
  assert.deepEqual(missing, []);
});

test("dados do usuário apagam em cascata com a conta (neon_auth.user)", () => {
  for (const t of ["profiles", "library_items", "custom_lists", "watch_entries", "episodes_progress", "api_rate_limits", "user_preferences", "follows"]) {
    const re = new RegExp(`ALTER TABLE public\\.${t} ADD CONSTRAINT \\w+ FOREIGN KEY \\(\\w+\\) REFERENCES neon_auth\\."user"\\(id\\) ON DELETE CASCADE`);
    assert.match(all, re, `${t} sem FK com cascata para neon_auth.user`);
  }
});

test("restrições que protegem dados continuam (únicos e histórico preservado)", () => {
  // No banco real é um índice único (não constraint) — mesmo efeito: 1 item por título por usuário.
  assert.match(all, /CREATE UNIQUE INDEX library_items_user_media_unique ON public\.library_items USING btree \(user_id, media_id\)/);
  assert.match(all, /watch_entries ADD CONSTRAINT \w+ FOREIGN KEY \(library_item_id\) REFERENCES library_items\(id\) ON DELETE SET NULL/);
  assert.match(all, /activity_events ADD CONSTRAINT \w+ FOREIGN KEY \(library_item_id\) REFERENCES library_items\(id\) ON DELETE SET NULL/);
});

test("baseline exige o Neon Auth e não traz a tabela de exemplo da Neon", () => {
  assert.match(migrations[0].text, /to_regclass\('neon_auth\."user"'\) IS NULL/);
  assert.ok(!created.has("playing_with_neon"));
});

test("0008: reassistir vira Assistido e os CHECKs deixam de aceitar os status antigos", () => {
  const m = migrations.find((x) => x.name === "0008_remove_rewatch.sql");
  assert.ok(m, "migration 0008 existe");
  assert.match(m.text, /SET status = 'watched'\s+WHERE status IN \('rewatching', 'rewatched'\)/);
  assert.match(m.text, /SET rewatch_count = 0/);
  assert.match(m.text, /UPDATE public\.episodes_progress SET is_rewatch = false/);
  assert.match(m.text, /DELETE FROM public\.activity_events WHERE event_type = 'rewatch_started'/);
  const status = m.text.match(/library_items_status_check\s+CHECK \(([^;]*)\);/);
  assert.ok(status && !/rewatch/.test(status[1]), "status check sem reassistir");
  const events = m.text.match(/activity_events_event_type_check\s+CHECK \(([^;]*)\);/);
  assert.ok(events && !/rewatch/.test(events[1]), "tipo de evento sem rewatch_started");
  // A sessão mantida (título só com reassistidas) é convertida ANTES do DELETE.
  assert.ok(m.text.indexOf("SET is_rewatch = false, updated_at = now()") < m.text.indexOf("DELETE FROM public.watch_entries WHERE is_rewatch"));
});

test("migrations não apagam tabelas nem dados", () => {
  // Fase 6: a única exceção revisada é a 0006 (tabelas órfãs), e só com estas tabelas.
  const REVIEWED_DROPS = { "0006_drop_orphan_tables.sql": ["movie_tags", "tags", "category_ratings", "rating_categories", "friendships"] };
  // 0008 (fim do reassistir): apaga só sessões e eventos de reassistida — revisado.
  const REVIEWED_DELETES = { "0008_remove_rewatch.sql": ["activity_events", "watch_entries", "activity_events", "activity_events"] };
  for (const migration of migrations) {
    assert.doesNotMatch(migration.text, /\bTRUNCATE\b/i, migration.name);
    const deletes = [...migration.text.matchAll(/\bDELETE FROM public\.(\w+)/gi)].map((m) => m[1]);
    assert.deepEqual(deletes, REVIEWED_DELETES[migration.name] ?? [], `${migration.name}: só os DELETEs revisados`);
    const allowed = REVIEWED_DROPS[migration.name];
    if (!allowed) {
      assert.doesNotMatch(migration.text, /\bDROP TABLE\b/i, migration.name);
      continue;
    }
    const drops = [...migration.text.matchAll(/\bDROP TABLE(?: IF EXISTS)?\s+public\.(\w+)/gi)].map((m) => m[1]);
    assert.deepEqual(drops, allowed, `${migration.name}: só as tabelas revisadas`);
  }
});
