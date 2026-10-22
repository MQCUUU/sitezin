// Fase 5 — textos de compartilhamento (pessoa, episódio, lista): node scripts/test-share-metadata.mjs (ou npm test).
// O HTML real (status, <title>, og:*, privacidade) é verificado na build de produção em tests/seo-a11y.spec.ts.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { clip, shareDescription, episodeShareTitle, listShareDescription, DEFAULT_SHARE_IMAGE } = await import(
  "../lib/share-metadata.ts"
);

test("clip: até 155 caracteres, sem cortar palavra, com reticências", () => {
  assert.equal(clip("Curto."), "Curto.");
  const long = "palavra ".repeat(40);
  const out = clip(long);
  assert.ok(out.length <= 155, `${out.length}`);
  assert.ok(out.endsWith("…"));
  assert.ok(!/\s…$/.test(out));
  assert.equal(clip("  muitos   espaços \n aqui  "), "muitos espaços aqui");
});

test("shareDescription: texto próprio quando existe, senão o resumo padrão", () => {
  assert.equal(shareDescription("Biografia real.", "padrão"), "Biografia real.");
  assert.equal(shareDescription("   ", "padrão"), "padrão");
  assert.equal(shareDescription(null, "padrão"), "padrão");
});

test("episódio: 'T1:E03 — Nome | Série'; sem repetir 'Episódio N'", () => {
  assert.equal(
    episodeShareTitle({ showName: "Game of Thrones", season: 1, episode: 1, episodeName: "O Inverno Está Chegando" }),
    "T1:E01 — O Inverno Está Chegando | Game of Thrones"
  );
  assert.equal(episodeShareTitle({ showName: "Série", season: 2, episode: 10, episodeName: "Episódio 10" }), "T2:E10 | Série");
  assert.equal(episodeShareTitle({ showName: "Série", season: 0, episode: 3, episodeName: null }), "T0:E03 | Série");
});

test("lista: descrição própria ou 'Lista com N títulos por @dono'", () => {
  assert.equal(listShareDescription({ description: "Minha seleção.", itemCount: 3, ownerUsername: "ana" }), "Minha seleção.");
  assert.equal(listShareDescription({ description: "", itemCount: 1, ownerUsername: "ana" }), "Lista com 1 título por @ana no MyCatalog.");
  assert.equal(listShareDescription({ description: null, itemCount: 12, ownerUsername: null }), "Lista com 12 títulos no MyCatalog.");
});

test("imagem padrão aponta para a imagem social do app", () => {
  assert.equal(DEFAULT_SHARE_IMAGE.url, "/opengraph-image");
  assert.equal(DEFAULT_SHARE_IMAGE.width, 1200);
});
