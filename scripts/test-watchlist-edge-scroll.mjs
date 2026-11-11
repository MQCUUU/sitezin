// Watchlist: rolagem automática ao arrastar perto do topo ou do pé da tela.
// node --experimental-strip-types --test scripts/test-watchlist-edge-scroll.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { edgeScrollStep, EDGE_ZONE, EDGE_MAX_STEP } = await import("../lib/watchlist-edge-scroll.ts");

const view = { height: 800, top: 64, bottom: 0 };

test("no meio da tela não rola", () => {
  assert.equal(edgeScrollStep(400, view), 0);
});

test("perto do pé rola para baixo, mais rápido quanto mais perto", () => {
  const far = edgeScrollStep(800 - EDGE_ZONE + 10, view);
  const near = edgeScrollStep(795, view);
  assert.ok(far > 0);
  assert.ok(near > far);
  assert.ok(near <= EDGE_MAX_STEP);
});

test("perto do topo (abaixo da barra) rola para cima", () => {
  assert.ok(edgeScrollStep(64 + 10, view) < 0);
  assert.equal(edgeScrollStep(64 + EDGE_ZONE + 1, view), 0);
});

test("sobre a barra de cima ou de baixo rola na velocidade máxima", () => {
  assert.equal(edgeScrollStep(20, view), -EDGE_MAX_STEP);
  assert.equal(edgeScrollStep(780, { height: 800, top: 0, bottom: 72 }), EDGE_MAX_STEP);
});

test("a 60 px do pé já rola", () => {
  assert.ok(edgeScrollStep(740, view) > 0);
});
