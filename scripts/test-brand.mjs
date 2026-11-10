// Marca MyCatalog (Projeção, Fase 1 — símbolo Dobra): node scripts/test-brand.mjs
// Puro (lê só código-fonte e assets). Trava: fonte única da geometria, cor fixa da
// marca (sem cor escolhida pelo usuário), assets/manifest/títulos e nomes acessíveis.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const fs = (await import("node:fs")).default;
const path = (await import("node:path")).default;
const brand = await import("../lib/brand.ts");

const root = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const sources = [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))].map((file) => [rel(file), fs.readFileSync(file, "utf8")]);

test("cor da marca é fixa: âmbar MyCatalog (frente) e âmbar fechado (verso)", () => {
  assert.equal(brand.BRAND_AMBER, "#f39a2b");
  assert.equal(brand.BRAND_AMBER_BACK, "#b7630e");
  assert.equal(brand.BRAND_ROOM, "#121113");
  // Nada de cor por usuário na marca.
  assert.equal(brand.brandAccent, undefined);
  assert.equal(brand.needsDynamicFavicon, undefined);
});

test("Dobra: quatro faces, frente por cima do verso", () => {
  assert.equal(brand.BRAND_VIEWBOX, "0 0 100 100");
  assert.equal(brand.BRAND_FACES.back.length, 2);
  assert.equal(brand.BRAND_FACES.front.length, 2);
  const svg = brand.brandMarkSvg();
  const back = svg.indexOf(brand.BRAND_AMBER_BACK);
  const front = svg.indexOf(brand.BRAND_AMBER);
  assert.ok(back > 0 && front > back, "verso desenhado antes da frente");
  for (const face of [...brand.BRAND_FACES.back, ...brand.BRAND_FACES.front]) assert.ok(svg.includes(face), face);
});

test("favicon: desenho próprio na grade de 16 px, SVG pequeno e estático", () => {
  const svg = brand.brandFaviconSvg();
  assert.ok(svg.length < 700, `svg com ${svg.length} bytes`);
  assert.match(svg, /viewBox="0 0 16 16"/);
  assert.ok(svg.includes(brand.BRAND_ROOM), "placa Sala");
  assert.equal(read("app/icon.svg").trim(), svg.trim());
});

test("monocromático: as variantes mono usam só preto e branco", () => {
  for (const variant of ["mono-light", "mono-dark"]) {
    const colors = new Set(brand.brandMarkSvg({ variant }).match(/#[0-9a-f]{6}/gi));
    assert.deepEqual([...colors].filter((c) => !/^#(000000|ffffff)$/i.test(c)), [], variant);
  }
});

test("assets estáticos gerados da mesma geometria", () => {
  assert.ok(read("public/brand/mycatalog-mark.svg").includes(brand.BRAND_FACES.front[1]));
  for (const file of ["app/apple-icon.png", "public/brand/icon-192.png", "public/brand/icon-512.png", "public/brand/icon-maskable-512.png"]) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(1, 4).toString(), "PNG", file);
  }
});

test("manifest: ícones existem, maskable separado, tema = Sala", () => {
  const manifest = read("app/manifest.ts");
  for (const src of [...manifest.matchAll(/src: "([^"]+)"/g)].map((m) => m[1])) {
    const file = src === "/icon.svg" ? "app/icon.svg" : `public${src}`;
    assert.ok(fs.existsSync(path.join(root, file)), src);
  }
  assert.match(manifest, /purpose: "maskable"/);
  assert.match(manifest, /theme_color: "#121113"/);
  assert.match(manifest, /background_color: "#121113"/);
});

test("fonte única: geometria do símbolo só em lib/brand.ts", () => {
  const duplicated = sources.filter(([, src]) => src.includes("63,72") || src.includes("61,72")).map(([file]) => file);
  assert.deepEqual(duplicated, []);
  assert.doesNotMatch(read("app/opengraph-image.tsx"), /<svg|<path|<polygon/);
});

test("lockup: o símbolo é o M da palavra (yCatalog), nome acessível MyCatalog, sem cor do usuário", () => {
  const mark = read("components/brand/BrandMark.tsx");
  assert.doesNotMatch(mark, /var\(--accent\)/);
  assert.match(mark, /aria-hidden/);
  assert.match(mark, /yCatalog/);
  assert.match(mark, /aria-label="MyCatalog"/);
  assert.match(read("styles/brand.css"), /\.brand-wordmark[\s\S]*?color: var\(--text\)/);
});

test("acessibilidade: links da marca têm nome; nenhum <main> aninhado nas telas de auth", () => {
  for (const file of ["components/Nav.tsx", "components/AuthPage.tsx", "app/forgot-password/page.tsx", "app/reset-password/page.tsx"]) {
    assert.match(read(file), /aria-label="MyCatalog — página inicial"/, file);
    assert.doesNotMatch(read(file), /^\s*<main\b/m, file);
  }
});

test("títulos de aba: toda rota principal declara o seu", () => {
  const titled = {
    "app/library/page.tsx": "Biblioteca",
    "app/diary/page.tsx": "Diário",
    "app/calendar/page.tsx": "Calendário",
    "app/lists/page.tsx": "Listas",
    "app/login/page.tsx": "Entrar",
    "app/signup/page.tsx": "Criar conta",
    "app/for-you/layout.tsx": "Para você",
    "app/search/layout.tsx": "Busca",
    "app/settings/layout.tsx": "Configurações",
    "app/forgot-password/layout.tsx": "Recuperar acesso",
    "app/reset-password/layout.tsx": "Nova senha",
  };
  for (const [file, title] of Object.entries(titled)) {
    assert.ok(read(file).includes(`title: "${title}"`), file);
  }
  assert.match(read("app/layout.tsx"), /template: "%s · MyCatalog"/);
});

test("favicon: fonte central — nenhuma rota declara ícone próprio", () => {
  const declaring = sources
    .filter(([file]) => file.startsWith("app/") && /\/(layout|page|head)\.tsx?$/.test(file))
    .filter(([, src]) => /\bicons\s*:|rel=["'](shortcut )?icon["']/.test(src))
    .map(([file]) => file);
  assert.deepEqual(declaring, []);
  const icons = fs.readdirSync(path.join(root, "app")).filter((f) => /^(icon|favicon|apple-icon)\b/.test(f)).sort();
  assert.deepEqual(icons, ["apple-icon.png", "icon.svg"]);
});

test("favicon estático: o favicon dinâmico (cor do usuário) saiu", () => {
  assert.equal(fs.existsSync(path.join(root, "components/brand/DynamicFavicon.tsx")), false);
  const layout = read("app/layout.tsx");
  assert.doesNotMatch(layout, /DynamicFavicon/);
  assert.match(layout, /styles\/brand\.css/);
});
