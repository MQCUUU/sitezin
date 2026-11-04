import test from "node:test";
import assert from "node:assert/strict";
import { getCatalogEntries, findBestMatch } from "../lib/resolve-link.ts";

const entries = getCatalogEntries();
const moviePool = entries.filter((e) => e.isMovie);
const tvPool = entries.filter((e) => !e.isMovie);

test("resolve-link: Um Sonho de Liberdade (1994 no TMDB) resolve para redecanais 1995", () => {
  const result = findBestMatch(moviePool, "Um Sonho de Liberdade", "1994");
  assert.ok(result, "Deve encontrar correspondência");
  assert.ok(result.includes("um-sonho-de-liberdade"), `Deve apontar para o filme, recebido: ${result}`);
  assert.ok(result.includes("1995"), `Deve ser a versão 1995 do catálogo redecanais, recebido: ${result}`);
});

test("resolve-link: O Rei Leão 1994 vs O Rei Leão 2019 diferenciam pelo ano", () => {
  const res1994 = findBestMatch(moviePool, "O Rei Leão", "1994");
  assert.ok(res1994?.includes("1994"), `Rei Leão 1994 deve ir para versão 1994: ${res1994}`);

  const res2019 = findBestMatch(moviePool, "O Rei Leão", "2019");
  assert.ok(res2019?.includes("2019"), `Rei Leão 2019 deve ir para versão 2019: ${res2019}`);
});

test("resolve-link: Duna (2021) vs Duna: Parte 2 (2024)", () => {
  const resDuna1 = findBestMatch(moviePool, "Duna", "2021");
  assert.ok(resDuna1?.includes("duna-dublado-2021"), `Duna 2021 deve resolver: ${resDuna1}`);

  const resDuna2 = findBestMatch(moviePool, "Duna: Parte 2", "2024");
  assert.ok(resDuna2?.includes("duna-parte-dois"), `Duna Parte 2 deve resolver: ${resDuna2}`);
});

test("resolve-link: Chuck (série, 2007) resolve para página da série", () => {
  const res = findBestMatch(tvPool, "Chuck", "2007");
  assert.ok(res?.includes("chuck"), `Chuck deve resolver para página da série: ${res}`);
});

test("resolve-link: The Flash (série, 2014) resolve para a série", () => {
  const res = findBestMatch(tvPool, "The Flash", "2014");
  assert.ok(res?.includes("the-flash"), `Flash deve resolver para página da série: ${res}`);
});
