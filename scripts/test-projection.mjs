import assert from "node:assert/strict";
import { createProjectionScheduler, averageColor } from "../lib/projection.ts";

function fakeTimers() {
  let now = 0;
  let id = 0;
  const list = new Map();
  return {
    timers: {
      set: (fn, ms) => { list.set(++id, { at: now + ms, fn }); return id; },
      clear: (h) => list.delete(h),
    },
    advance(ms) {
      now += ms;
      for (const [k, t] of [...list]) if (t.at <= now) { list.delete(k); t.fn(); }
    },
  };
}

const delays = { enter: 120, leave: 220 };
{
  const f = fakeTimers(); const seen = [];
  const s = createProjectionScheduler((p) => seen.push(p), f.timers, delays);
  s.request("/a.jpg"); f.advance(119); assert.deepEqual(seen, []);
  f.advance(1); assert.deepEqual(seen, ["/a.jpg"]);
}
{ // varrer a grade: só o último alvo parado vale
  const f = fakeTimers(); const seen = [];
  const s = createProjectionScheduler((p) => seen.push(p), f.timers, delays);
  s.request("/a.jpg"); f.advance(60); s.request("/b.jpg"); f.advance(60); s.request("/c.jpg"); f.advance(120);
  assert.deepEqual(seen, ["/c.jpg"]);
}
{ // sair de um pôster e entrar em outro antes do atraso não volta ao padrão
  const f = fakeTimers(); const seen = [];
  const s = createProjectionScheduler((p) => seen.push(p), f.timers, delays);
  s.request("/a.jpg"); f.advance(120);
  s.request(null); f.advance(100); s.request("/b.jpg"); f.advance(120);
  assert.deepEqual(seen, ["/a.jpg", "/b.jpg"]);
}
{ // sair de verdade volta ao padrão; repetir o mesmo alvo não reagenda
  const f = fakeTimers(); const seen = [];
  const s = createProjectionScheduler((p) => seen.push(p), f.timers, delays);
  s.request("/a.jpg"); f.advance(120); s.request("/a.jpg"); f.advance(500);
  s.request(null); f.advance(220);
  assert.deepEqual(seen, ["/a.jpg", null]);
}
assert.equal(averageColor([255, 0, 0, 255, 0, 0, 255, 255]), "rgb(128 0 128)");
assert.equal(averageColor([1, 2, 3, 0]), null);
console.log("projection: ok");
