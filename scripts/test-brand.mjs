// Marca MyCatalog V3.5: node scripts/test-brand.mjs
// Puro (lê só código-fonte e assets). Trava: fonte única da geometria, favicon
// dinâmico seguro (destaque inválido → padrão), assets/manifest/títulos e nomes
// acessíveis. O comportamento ao vivo (Configurações → favicon, refresh, outra
// aba) foi verificado em navegador real contra TEST.
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
const { DEFAULT_PREFERENCES, ACCENT_OPTIONS } = await import("../lib/preferences.ts");

const root = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const sources = [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))].map((file) => [rel(file), fs.readFileSync(file, "utf8")]);

test("destaque da marca = destaque padrão do usuário (sem segunda tabela de cor)", () => {
  assert.equal(brand.BRAND_ACCENT, DEFAULT_PREFERENCES.accent);
  assert.ok(ACCENT_OPTIONS.some((option) => option.value === brand.BRAND_ACCENT));
});

test("brandAccent: só #rrggbb passa; o resto cai no padrão", () => {
  assert.equal(brand.brandAccent("#3B82F6"), "#3b82f6");
  for (const bad of [undefined, null, "", "red", "#fff", "#12345g", '"/><script>', "url(x)", 42, {}]) {
    assert.equal(brand.brandAccent(bad), brand.BRAND_ACCENT, String(bad));
  }
});

test("favicon: SVG pequeno, data: URL codificada, sem injeção", () => {
  const svg = brand.brandMarkSvg();
  assert.ok(svg.length < 700, `svg com ${svg.length} bytes`);
  const href = brand.brandFaviconHref('"/><script>alert(1)</script>');
  assert.ok(href.startsWith("data:image/svg+xml,"));
  assert.ok(!/[<>"]/.test(href), "href precisa estar codificada");
  assert.ok(decodeURIComponent(href).includes(`stroke="${brand.BRAND_ACCENT}"`));
  assert.ok(decodeURIComponent(brand.brandFaviconHref("#22c55e")).includes('stroke="#22c55e"'));
});

test("favicon dinâmico só quando o destaque foge do padrão", () => {
  assert.equal(brand.needsDynamicFavicon(brand.BRAND_ACCENT), false);
  assert.equal(brand.needsDynamicFavicon("#8B5CF6"), false);
  assert.equal(brand.needsDynamicFavicon("lixo"), false);
  assert.equal(brand.needsDynamicFavicon("#3b82f6"), true);
});

test("monocromático: as variantes mono usam só preto e branco", () => {
  for (const variant of ["mono-light", "mono-dark"]) {
    const colors = new Set(brand.brandMarkSvg({ variant }).match(/#[0-9a-f]{6}/gi));
    assert.deepEqual([...colors].filter((c) => !/^#(000000|ffffff)$/i.test(c)), [], variant);
  }
});

test("assets estáticos gerados da mesma geometria", () => {
  assert.equal(read("app/icon.svg").trim(), brand.brandMarkSvg().trim());
  assert.ok(read("public/brand/mycatalog-mark.svg").includes(brand.BRAND_STROKE_PATH));
  for (const file of ["app/apple-icon.png", "public/brand/icon-192.png", "public/brand/icon-512.png", "public/brand/icon-maskable-512.png"]) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(1, 4).toString(), "PNG", file);
  }
});

test("manifest: ícones existem, maskable separado, tema neutro", () => {
  const manifest = read("app/manifest.ts");
  for (const src of [...manifest.matchAll(/src: "([^"]+)"/g)].map((m) => m[1])) {
    const file = src === "/icon.svg" ? "app/icon.svg" : `public${src}`;
    assert.ok(fs.existsSync(path.join(root, file)), src);
  }
  assert.match(manifest, /purpose: "maskable"/);
  assert.doesNotMatch(manifest, /theme_color: "#8b5cf6"/);
});

test("fonte única: geometria do símbolo só em lib/brand.ts", () => {
  const duplicated = sources.filter(([, src]) => src.includes(brand.BRAND_STROKE_PATH) || /M23 18 L32 33/.test(src)).map(([file]) => file);
  assert.deepEqual(duplicated, []);
  assert.doesNotMatch(read("app/opengraph-image.tsx"), /<svg|<path/);
});

test("lockup: nome com cor fixa, destaque só no traço", () => {
  const mark = read("components/brand/BrandMark.tsx");
  assert.match(mark, /var\(--accent\)/);
  assert.match(mark, /aria-hidden/);
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

test("favicon dinâmico sobrevive à navegação: 1 link, observer só nos filhos do <head>, sem polling", () => {
  const src = read("components/brand/DynamicFavicon.tsx");
  assert.match(src, /observer\.observe\(document\.head, \{ childList: true \}\)/);
  assert.doesNotMatch(src, /subtree|attributes:|setInterval|setTimeout|requestAnimationFrame/);
  assert.match(src, /getElementById\(LINK_ID\)/, "reaproveita o link existente");
  assert.match(src, /observer\.disconnect\(\)/);
});

test("favicon dinâmico montado no layout raiz", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /<DynamicFavicon \/>/);
  assert.match(layout, /styles\/brand\.css/);
});
