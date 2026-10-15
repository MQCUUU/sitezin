// Testes do estado da Biblioteca na URL (V2.6): node scripts/test-library-url.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { parseLibraryQuery, serializeLibraryQuery, withChange, panelFilterCount, hasAnyFilter, apiParams } from "../lib/library/url.ts";

const parse = (qs) => parseLibraryQuery(new URLSearchParams(qs));

test("/library → padrão", () => {
  const q = parse("");
  assert.deepEqual(q, { page: 1, status: "all", favorite: false, type: "all", genre: "all", year: "all", minRating: "all", minTmdbRating: "all", sort: null, search: "" });
  assert.equal(serializeLibraryQuery(q), "");
});

test("?page=2, ?status=watching, ?status=watched&page=3", () => {
  assert.equal(parse("page=2").page, 2);
  assert.equal(parse("status=watching").status, "watching");
  const q = parse("status=watched&page=3");
  assert.equal(serializeLibraryQuery(q), "status=watched&page=3");
});

test("apelidos: q → search; liked=1 → favorite (URL canônica usa os nomes existentes)", () => {
  assert.equal(serializeLibraryQuery(parse("q=breaking")), "search=breaking");
  assert.equal(serializeLibraryQuery(parse("liked=1")), "favorite=true");
});

test("URL inválida é normalizada", () => {
  const q = parse("page=-4&status=hacked&type=book&sort=drop&year=abc&min_rating=11&min_tmdb_rating=x");
  assert.equal(serializeLibraryQuery(q), "");
  assert.equal(parse("page=2.5").page, 1);
  assert.equal(parse("page=abc").page, 1);
});

test("mudar filtro/status/busca/ordenação volta para a página 1; mudar página não", () => {
  const q = parse("status=watched&page=6");
  assert.equal(withChange(q, { status: "want" }).page, 1);
  assert.equal(withChange(q, { favorite: true }).page, 1);
  assert.equal(withChange(q, { search: "x" }).page, 1);
  assert.equal(withChange(q, { sort: "az" }).page, 1);
  assert.equal(withChange(q, { page: 7 }).page, 7);
});

test("Curtidos combina com status (ortogonal)", () => {
  const q = withChange(parse("status=watched"), { favorite: true });
  assert.equal(serializeLibraryQuery(q), "status=watched&favorite=true");
  const api = apiParams(q, "added", 24);
  assert.equal(api.get("status"), "watched");
  assert.equal(api.get("favorite"), "true");
});

test("contagem de filtros do painel não inclui status/curtidos/ordenação/busca", () => {
  assert.equal(panelFilterCount(parse("status=watched&favorite=true&sort=az&search=x")), 0);
  assert.equal(panelFilterCount(parse("type=movie&genre=Drama&min_rating=8")), 3);
  assert.equal(hasAnyFilter(parse("sort=az")), false);
  assert.equal(hasAnyFilter(parse("search=x")), true);
});

test("api: sort efetivo e paginação", () => {
  const p = apiParams(parse("page=3&type=tv"), "rating", 24);
  assert.equal(p.get("page"), "3");
  assert.equal(p.get("media_type"), "tv");
  assert.equal(p.get("sort"), "rating");
  assert.equal(p.get("limit"), "24");
});
