// Fase 7 — trava de rolagem e laço do Tab compartilhados pelos modais (lib/modal-a11y).
// node scripts/test-modal-a11y.mjs (ou npm test). DOM mínimo simulado: só o que as funções usam.
const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;

globalThis.document = { body: { style: { overflow: "" } }, activeElement: null };
const { lockScroll, trapTab } = await import("../lib/modal-a11y.ts");

test("dois modais fechando FORA de ordem não deixam a página travada", () => {
  document.body.style.overflow = "";
  const soltarA = lockScroll();
  const soltarB = lockScroll();
  assert.equal(document.body.style.overflow, "hidden");
  soltarA(); // o primeiro fecha antes
  assert.equal(document.body.style.overflow, "hidden", "B ainda aberto");
  soltarB();
  assert.equal(document.body.style.overflow, "");
});

test("soltar duas vezes não desconta outro modal", () => {
  const soltarA = lockScroll();
  const soltarB = lockScroll();
  soltarA();
  soltarA();
  assert.equal(document.body.style.overflow, "hidden");
  soltarB();
  assert.equal(document.body.style.overflow, "");
});

test("devolve o overflow que a página tinha antes", () => {
  document.body.style.overflow = "clip";
  const soltar = lockScroll();
  assert.equal(document.body.style.overflow, "hidden");
  soltar();
  assert.equal(document.body.style.overflow, "clip");
  document.body.style.overflow = "";
});

test("Tab no último volta ao primeiro; Shift+Tab no primeiro vai ao último", () => {
  const focused = [];
  const el = (name) => ({ name, focus() { focused.push(name); document.activeElement = this; } });
  const first = el("primeiro"), middle = el("meio"), last = el("ultimo");
  const container = { querySelectorAll: () => [first, middle, last] };
  const ev = (shiftKey) => { const e = { key: "Tab", shiftKey, prevented: false, preventDefault() { this.prevented = true; } }; return e; };

  document.activeElement = last;
  const e1 = ev(false);
  trapTab(e1, container);
  assert.ok(e1.prevented);
  assert.equal(focused.at(-1), "primeiro");

  document.activeElement = first;
  const e2 = ev(true);
  trapTab(e2, container);
  assert.ok(e2.prevented);
  assert.equal(focused.at(-1), "ultimo");

  document.activeElement = middle;
  const e3 = ev(false);
  trapTab(e3, container);
  assert.equal(e3.prevented, false, "no meio o navegador cuida");

  const e4 = { key: "Escape", preventDefault() { throw new Error("não deveria"); } };
  trapTab(e4, container);
});

test("foco fora do modal: Tab leva ao primeiro, Shift+Tab ao último", () => {
  const focused = [];
  const el = (name) => ({ name, focus() { focused.push(name); document.activeElement = this; } });
  const first = el("primeiro"), last = el("ultimo"), outside = el("fora");
  const container = { querySelectorAll: () => [first, last], contains: (node) => node === first || node === last };
  document.activeElement = outside;
  const e1 = { key: "Tab", shiftKey: false, prevented: false, preventDefault() { this.prevented = true; } };
  trapTab(e1, container);
  assert.ok(e1.prevented);
  assert.equal(focused.at(-1), "primeiro");
  document.activeElement = outside;
  const e2 = { key: "Tab", shiftKey: true, prevented: false, preventDefault() { this.prevented = true; } };
  trapTab(e2, container);
  assert.equal(focused.at(-1), "ultimo");
});
