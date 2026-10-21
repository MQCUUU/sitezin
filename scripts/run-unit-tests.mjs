// `npm test`: roda todos os testes unitários (scripts/test-*.mjs, node:test) de uma vez.
// Fica de fora test-search-entity-resolver.mjs: não é unitário (consulta o banco de DATABASE_URL).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NOT_UNIT = new Set(["test-search-entity-resolver.mjs"]);

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs
  .readdirSync(dir)
  .filter((name) => /^test-.*\.mjs$/.test(name) && !NOT_UNIT.has(name))
  .sort()
  .map((name) => path.join("scripts", name));

const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], {
  cwd: path.resolve(dir, ".."),
  stdio: "inherit",
});

process.exit(result.status ?? 1);
