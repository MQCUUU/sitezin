// Testes de domínio de Configurações, Perfil e Privacidade (V3.3): node scripts/test-settings.mjs
// Puro (sem rede/banco). Os fluxos com banco/sessão (A/B/C/visitante, senha,
// exclusão, restore, Letterboxd) foram validados ponta a ponta no ambiente TEST.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const prefs = await import("../lib/preferences.ts");
const fs = (await import("node:fs")).default;
const { sanitizePreferences, DEFAULT_PREFERENCES, PREFERENCES_KEY, applyPreferences, contrastRatio } = prefs;

const { parseStreamingServices, providersToTmdbFilter, MAX_STREAMING_SERVICES } = await import("../lib/streaming-services.ts");
const { relevantBrProviders, collapseProviderVariants } = await import("../lib/streaming/providers-br.ts");
const { canViewProfile, canViewSection, mergeSocialSettings, followStatusFor } = await import("../lib/social/visibility.ts");
const { buildSeriesNotices, RECENT_SEASON_DAYS } = await import("../lib/notifications/series.ts");
const { planRestore, csvCell, BACKUP_VERSION, MAX_BACKUP_ITEMS } = await import("../lib/backup/plan.ts");
const { chooseLetterboxdMovie } = await import("../lib/letterboxd/match.ts");
const { isValidUsername, normalizeUsername } = await import("../lib/username.ts");

/* ================================================================ APARÊNCIA */

test("aparência: só valores conhecidos; lixo/JSON inválido vira padrão (nunca aplicado cru)", () => {
  assert.deepEqual(sanitizePreferences(null), DEFAULT_PREFERENCES);
  assert.deepEqual(sanitizePreferences({ theme: "neon", accent: "red", density: 1, radius: "x", motion: "?", defaultSort: "pop" }), DEFAULT_PREFERENCES);
  const ok = sanitizePreferences({ theme: "oled", accent: "#22C55E", density: "compact", radius: "square", motion: "reduced", defaultSort: "az" });
  assert.equal(ok.accent, "#22c55e");
  assert.equal(ok.theme, "oled");
  assert.equal(ok.defaultSort, "az");
  assert.equal(sanitizePreferences({ accent: "#22c55e; background:url(x)" }).accent, DEFAULT_PREFERENCES.accent, "sem injeção de CSS");
});

test("aparência: uma única chave; o campo accent continua aceito (compatível), mas não há mais opções de cor", () => {
  assert.equal(PREFERENCES_KEY, "mycatalog.preferences.v1");
  assert.deepEqual(Object.keys(DEFAULT_PREFERENCES).sort(), ["accent", "defaultSort", "density", "motion", "radius", "theme"]);
  for (const gone of ["ACCENT_OPTIONS", "readableAccent", "onAccent", "DARK_SURFACE", "LIGHT_SURFACE"]) {
    assert.equal(prefs[gone], undefined, gone);
  }
});

test("aparência: a cor da marca é fixa — applyPreferences não escreve nem herda --accent", () => {
  const set = [];
  const removed = [];
  globalThis.document = { documentElement: { dataset: {}, style: { setProperty: (k) => set.push(k), removeProperty: (k) => removed.push(k) } } };
  try {
    applyPreferences({ ...DEFAULT_PREFERENCES, accent: "#22c55e", theme: "light" });
    assert.deepEqual(set.filter((k) => /accent/.test(k)), []);
    for (const k of ["--accent", "--accent2", "--on-accent"]) assert.ok(removed.includes(k), k);
    assert.equal(globalThis.document.documentElement.dataset.theme, "light");
  } finally {
    delete globalThis.document;
  }
});

test("aparência: âmbar MyCatalog legível em todos os temas (≥ 4.5:1 sobre fundo e superfícies)", () => {
  const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const block = (selector) => {
    const i = css.indexOf(selector + " {");
    assert.ok(i >= 0, selector);
    const body = css.slice(i, css.indexOf("}", i));
    return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
  };
  const dark = block(":root");
  const oled = { ...dark, ...block('html[data-theme="oled"]') };
  const light = { ...dark, ...block('html[data-theme="light"]') };
  assert.equal(dark.accent, "#f39a2b");
  assert.equal(light.accent, "#9a4a00");
  for (const [name, t] of Object.entries({ dark, oled, light })) {
    for (const surface of ["bg", "panel", "panel2"]) {
      assert.ok(contrastRatio(t.accent, t[surface]) >= 4.5, `${name} accent/${surface}: ${contrastRatio(t.accent, t[surface]).toFixed(2)}`);
      assert.ok(contrastRatio(t.text, t[surface]) >= 7, `${name} text/${surface}`);
      assert.ok(contrastRatio(t.muted, t[surface]) >= 4.5, `${name} muted/${surface}`);
    }
    assert.ok(contrastRatio(t["on-accent"], t.accent) >= 4.5, `${name} on-accent`);
  }
});

/* ================================================================ STREAMING */

test("streaming: salva só IDs canônicos do TMDB, sem duplicar a mesma entidade", () => {
  const parsed = parseStreamingServices([
    { provider_id: 8, provider_name: "Netflix" },
    { provider_id: "8", provider_name: "Netflix (de novo)" },
    { provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/a.jpg" },
  ]);
  assert.deepEqual(parsed.map((s) => s.provider_id), [8, 119]);
  assert.equal(providersToTmdbFilter(parsed), "8|119");
  assert.equal(parseStreamingServices([{ provider_id: -1, provider_name: "X" }]), null);
  assert.equal(parseStreamingServices("8"), null);
  assert.equal(parseStreamingServices(Array.from({ length: MAX_STREAMING_SERVICES + 1 }, (_, i) => ({ provider_id: i + 1, provider_name: "P" }))), null);
  assert.equal(parseStreamingServices([{ provider_id: 8, provider_name: "N", logo_path: "javascript:alert(1)" }])[0].logo_path, null);
});

test("streaming: mesma fonte canônica do Descobrir — variantes somem, serviços distintos ficam", () => {
  const raw = [
    { provider_id: 119, provider_name: "Amazon Prime Video", display_priorities: { BR: 2 } },
    { provider_id: 10, provider_name: "Amazon Video", display_priorities: { BR: 9 } },
    { provider_id: 2100, provider_name: "Amazon Prime Video with Ads", display_priorities: { BR: 3 } },
    { provider_id: 350, provider_name: "Apple TV", display_priorities: { BR: 4 } },
    { provider_id: 2, provider_name: "Apple TV Store", display_priorities: { BR: 5 } },
    { provider_id: 1853, provider_name: "Paramount Plus Apple TV Channel", display_priorities: { BR: 6 } },
  ];
  const ids = relevantBrProviders(raw).map((p) => p.provider_id);
  assert.deepEqual(ids, [119, 350, 2, 10], "assinatura × loja são serviços distintos (ids/semântica diferentes)");
  assert.deepEqual(collapseProviderVariants([{ name: "Netflix" }, { name: "Netflix Standard with Ads" }]).map((p) => p.name), ["Netflix"]);
});

/* ================================================================ PRIVACIDADE */

const OWNER = { isOwner: true, isAcceptedFollower: false };
const FOLLOWER = { isOwner: false, isAcceptedFollower: true };
const OTHER = { isOwner: false, isAcceptedFollower: false }; // autenticado não aceito
const VISITOR = { isOwner: false, isAcceptedFollower: false }; // sem login
const PUBLIC = { visibility: "public", is_public: true };
const PRIVATE = { visibility: "private", is_public: false };

test("privacidade: matriz A (dono) / B (seguidor aceito) / C (não aceito) / D (visitante)", () => {
  for (const viewer of [OWNER, FOLLOWER, OTHER, VISITOR]) assert.equal(canViewProfile(PUBLIC, viewer), true);
  assert.deepEqual([OWNER, FOLLOWER, OTHER, VISITOR].map((v) => canViewProfile(PRIVATE, v)), [true, true, false, false]);

  const matrix = (profile, setting) => [OWNER, FOLLOWER, OTHER, VISITOR].map((v) => canViewSection(profile, setting, v));
  assert.deepEqual(matrix(PUBLIC, "profile"), [true, true, true, true]);
  assert.deepEqual(matrix(PUBLIC, "followers"), [true, true, false, false]);
  assert.deepEqual(matrix(PUBLIC, "private"), [true, false, false, false]);
  assert.deepEqual(matrix(PRIVATE, "profile"), [true, true, false, false]);
  assert.deepEqual(matrix(PRIVATE, "followers"), [true, true, false, false]);
  assert.deepEqual(matrix(PRIVATE, "private"), [true, false, false, false]);
  assert.deepEqual(matrix(PUBLIC, "qualquer-coisa"), [true, false, false, false], "valor desconhecido = só o dono");
});

test("P0 regressão: perfil PRIVADO + atividade 'mesma regra do perfil' NÃO abre para visitante", () => {
  assert.equal(canViewSection(PRIVATE, "profile", VISITOR), false);
  assert.equal(canViewSection(PRIVATE, "profile", OTHER), false);
});

test("PUT parcial de privacidade não apaga as outras regras", () => {
  const current = {
    visibility: "private",
    follow_policy: "approval",
    followers_visibility: "private",
    following_visibility: "followers",
    activity_visibility: "private",
    ratings_visibility: "followers",
    reviews_visibility: "private",
    watched_titles_visibility: "followers",
    diary_visibility: "private",
    lists_visibility: "followers",
    likes_visibility: "private",
  };
  assert.deepEqual(mergeSocialSettings(current, { visibility: "public" }), { ...current, visibility: "public" });
  assert.deepEqual(mergeSocialSettings(current, { diary_visibility: "hack", follow_policy: "everyone" }), current, "inválido mantém o salvo");
  assert.deepEqual(mergeSocialSettings(current, { ratings_visibility: "private" }), { ...current, ratings_visibility: "private" });
});

test("follow: automático só em perfil público com política padrão", () => {
  assert.equal(followStatusFor({ visibility: "public", follow_policy: "profile" }), "accepted");
  assert.equal(followStatusFor({ visibility: "public", follow_policy: "approval" }), "pending");
  assert.equal(followStatusFor({ visibility: "private", follow_policy: "profile" }), "pending");
});

/* ================================================================ NOTIFICAÇÕES */

const TODAY = "2026-10-16";
const show = (overrides = {}) => ({
  name: "Série X",
  number_of_seasons: 3,
  seasons: [{ season_number: 1, air_date: "2020-01-01" }, { season_number: 3, air_date: "2026-11-20" }],
  next_episode_to_air: { season_number: 3, episode_number: 1, air_date: "2026-11-20", name: "Piloto" },
  ...overrides,
});

test("notificações: só séries curtidas; preferência desligada não gera", () => {
  assert.deepEqual(buildSeriesNotices({ tmdbId: 1, title: "X", favorite: false, details: show(), prefs: null, today: TODAY }), []);
  const off = buildSeriesNotices({ tmdbId: 1, title: "X", favorite: true, details: show(), prefs: { new_season_site: false, new_episode_site: false }, today: TODAY });
  assert.deepEqual(off, []);
  const both = buildSeriesNotices({ tmdbId: 1, title: "X", favorite: true, details: show(), prefs: null, today: TODAY });
  assert.deepEqual(both.map((n) => n.type), ["new_season", "new_episode"]);
});

test("notificações: chave de evento estável (dedup) e data date-only no meio-dia UTC", () => {
  const [season, episode] = buildSeriesNotices({ tmdbId: 42, title: "X", favorite: true, details: show(), prefs: null, today: TODAY });
  assert.equal(season.event_key, "season:42:3");
  assert.equal(episode.event_key, "episode:42:3:1:2026-11-20");
  assert.equal(episode.release_at, "2026-11-20T12:00:00.000Z");
  assert.equal(season.message, "A temporada 3 vai estrear.");
  const again = buildSeriesNotices({ tmdbId: 42, title: "X", favorite: true, details: show(), prefs: null, today: TODAY });
  assert.deepEqual(again.map((n) => n.event_key), [season.event_key, episode.event_key], "mesmo job, mesma chave");
});

test("notificações: 'nova temporada' é por usuário e por recência — não depende do catálogo compartilhado", () => {
  const old = show({ seasons: [{ season_number: 3, air_date: "2019-05-01" }], next_episode_to_air: null });
  assert.deepEqual(buildSeriesNotices({ tmdbId: 1, title: "X", favorite: true, details: old, prefs: null, today: TODAY }), [], "temporada antiga não é novidade");
  const recent = show({ seasons: [{ season_number: 3, air_date: "2026-10-01" }], next_episode_to_air: null });
  assert.equal(buildSeriesNotices({ tmdbId: 1, title: "X", favorite: true, details: recent, prefs: null, today: TODAY })[0].message, "A temporada 3 estreou.");
  const announced = show({ seasons: [{ season_number: 3, air_date: null }], next_episode_to_air: null });
  assert.equal(buildSeriesNotices({ tmdbId: 1, title: "X", favorite: true, details: announced, prefs: null, today: TODAY })[0].release_at, null);
  const firstSeason = show({ number_of_seasons: 1, seasons: [{ season_number: 1, air_date: "2026-10-10" }], next_episode_to_air: null });
  assert.deepEqual(buildSeriesNotices({ tmdbId: 1, title: "X", favorite: true, details: firstSeason, prefs: null, today: TODAY }), [], "estreia da série não é 'nova temporada'");
  assert.equal(RECENT_SEASON_DAYS, 30);
});

/* ================================================================ BACKUP */

const backupOf = (data, extra = {}) => ({ mycatalog_backup: true, version: 2, data: { library: [], ...data }, ...extra });
const libItem = (over = {}) => ({
  id: "old-li-1",
  status: "watched",
  favorite: true,
  personal_rating: 8,
  updated_at: "2026-01-01T00:00:00Z",
  media: { id: 77, tmdb_id: 603, media_type: "movie", title: "Matrix" },
  ...over,
});

test("backup inválido falha ANTES de qualquer escrita", () => {
  assert.equal(planRestore(null).ok, false);
  assert.equal(planRestore({}).ok, false);
  assert.match(planRestore({ mycatalog_backup: true, version: 9, data: { library: [] } }).error, /Versão/);
  assert.equal(planRestore({ mycatalog_backup: true, version: 2, data: {} }).ok, false, "sem biblioteca");
  assert.equal(planRestore({ mycatalog_backup: true, version: 2, data: { library: "x" } }).ok, false, "tipo errado");
  const huge = backupOf({ library: Array.from({ length: MAX_BACKUP_ITEMS + 1 }, () => ({})) });
  assert.match(planRestore(huge).error, /grande demais/);
});

test("backup: nada do arquivo é autoridade de dono; valores inválidos são saneados", () => {
  const result = planRestore(
    backupOf({ library: [libItem({ user_id: "outra-conta", status: "hackeado", personal_rating: 99, review: "ok" })] }, { account: { id: "outra-conta" } })
  );
  assert.equal(result.ok, true);
  const [item] = result.plan.library;
  assert.equal("user_id" in item, false);
  assert.equal(item.status, "want");
  assert.equal(item.personal_rating, null);
  assert.equal(item.tmdb_id, 603);
});

test("backup v1: visualizações/atividade mapeadas pelos ids da própria biblioteca do arquivo; duplicata ignorada", () => {
  const result = planRestore({
    mycatalog_backup: true,
    version: 1,
    data: {
      library: [libItem(), libItem()],
      watch_history: [{ library_item_id: "old-li-1", media_id: 77, watched_at: "2026-02-02T10:00:00Z", rating: 7 }, { library_item_id: "nada" }],
      activity_events: [{ media_id: 77, event_type: "watch_logged", occurred_at: "2026-02-02T10:00:00Z" }, { media_id: 77, event_type: "library_removed", occurred_at: "2026-02-02T10:00:00Z" }],
      hidden_titles: [{ tmdb_id: 5, media_type: "tv" }, { tmdb_id: 5, media_type: "x" }],
    },
  });
  assert.equal(result.plan.library.length, 1);
  assert.deepEqual(result.plan.watches.map((w) => [w.tmdb_id, w.media_type]), [[603, "movie"]]);
  assert.equal(result.plan.activity.length, 1, "remoção não é restaurada");
  assert.equal(result.plan.hidden.length, 1);
  assert.equal(result.plan.skipped, 4);
  assert.equal(BACKUP_VERSION, 2);
});

test("backup: data impossível é recusada na validação (não derruba a transação)", () => {
  const result = planRestore(backupOf({ library: [libItem()], watch_history: [{ tmdb_id: 603, media_type: "movie", watched_at: "0000-01-01T00:00:00Z" }, { tmdb_id: 603, media_type: "movie", watched_at: "+275760-09-13T00:00:00Z" }] }));
  assert.equal(result.plan.watches.length, 0);
  assert.equal(result.plan.skipped, 2);
});

test("backup v2: progresso de episódios entra (e só de séries)", () => {
  const result = planRestore(
    backupOf({ episodes_progress: [{ tmdb_id: 1396, media_type: "tv", season_number: 1, episode_number: 2, watched: true }, { tmdb_id: 603, media_type: "movie", season_number: 1, episode_number: 1 }] })
  );
  assert.equal(result.plan.episodes.length, 1);
  assert.equal(result.plan.episodes[0].episode_number, 2);
});

test("CSV: UTF-8 entre aspas e sem fórmula (CSV injection)", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell("+SUM(A1)"), `"'+SUM(A1)"`);
  assert.equal(csvCell("@cmd"), `"'@cmd"`);
  assert.equal(csvCell("-2+3"), `"'-2+3"`);
  assert.equal(csvCell(-1), `"-1"`, "número legítimo continua número");
  assert.equal(csvCell("Coração Valente"), `"Coração Valente"`);
  assert.equal(csvCell(null), `""`);
  assert.equal(csvCell(new Date("2026-10-16T23:25:56.659Z")), `"2026-10-16T23:25:56.659Z"`, "Date do driver vira ISO (sem aspas extras)");
});

/* ================================================================ LETTERBOXD */

test("Letterboxd: nunca vincula filme errado só por ser do mesmo ano", () => {
  const results = [
    { id: 1, title: "More Animated Worker and Parasite", original_title: "More Animated Worker and Parasite", release_date: "2019-01-01" },
    { id: 2, title: "Parasita", original_title: "기생충", release_date: "2019-05-30" },
  ];
  assert.equal(chooseLetterboxdMovie(results, { name: "Parasite", year: 2019 }), null, "em pt-BR não casa → tenta en-US");
  assert.equal(chooseLetterboxdMovie([{ id: 2, title: "Parasite", original_title: "기생충", release_date: "2019-05-30" }], { name: "Parasite", year: 2019 }).id, 2);
});

test("Letterboxd: nome localizado OU original; ano ±1; sem ano só com candidato único", () => {
  const dune = [{ id: 438631, title: "Duna", original_title: "Dune", release_date: "2021-09-15" }, { id: 841, title: "Duna", original_title: "Dune", release_date: "1984-12-14" }];
  assert.equal(chooseLetterboxdMovie(dune, { name: "Dune", year: 2021 }).id, 438631);
  assert.equal(chooseLetterboxdMovie(dune, { name: "Dune", year: 1984 }).id, 841);
  assert.equal(chooseLetterboxdMovie(dune, { name: "Dune", year: 2022 }).id, 438631, "±1 ano");
  assert.equal(chooseLetterboxdMovie(dune, { name: "Dune" }), null, "sem ano e ambíguo → não encontrado");
  assert.equal(chooseLetterboxdMovie([{ id: 9, title: "Amélie", original_title: "Le Fabuleux", release_date: "2001-04-25" }], { name: "amelie" }).id, 9);
});

/* ================================================================ USERNAME */

test("@: mesma regra em todas as rotas (inclusive a vitrine do perfil)", () => {
  assert.equal(normalizeUsername("  Mario_01 "), "mario_01");
  for (const ok of ["abc", "mario_01", "a".repeat(24)]) assert.equal(isValidUsername(ok), true, ok);
  for (const bad of ["ab", "a".repeat(25), "meu nome", "mário", "x-y", "<script>", "UPPER"]) assert.equal(isValidUsername(bad), false, bad);
});

/* ================================================================ CATÁLOGO E SESSÃO (bloqueio final V3.3) */


const path = (await import("node:path")).default;
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
const source = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("catálogo: só o helper do servidor cria `media` (nenhuma rota grava metadata vinda do cliente)", () => {
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const writers = [...walk(path.join(root, "app")), ...walk(path.join(root, "lib"))]
    .filter((file) => /INSERT INTO public\.media\b/.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file).split(path.sep).join("/"));
  assert.deepEqual(writers, ["lib/lists/media.ts"]);
});

test("POST /api/library: identidade = tmdb_id + tipo; título/sinopse/pôster/gêneros nunca vêm do corpo", () => {
  const route = source("app/api/library/route.ts");
  const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function", route.indexOf("export async function POST") + 10));
  assert.match(post, /resolveCatalogMedia\(sql, mediaType, tmdbId\)/);
  for (const field of ["media.title", "media.overview", "media.poster_path", "media.backdrop_path", "media.genres", "media.runtime", "media.number_of_seasons", "media.release_date"]) {
    assert.equal(post.includes(field), false, `POST não pode ler ${field} do cliente`);
  }
});

test("sessão revogada (troca de senha / conta excluída): getSession passa pela guarda do banco", () => {
  const server = source("lib/auth/server.ts");
  assert.match(server, /auth\.getSession = /);
  assert.match(server, /FROM neon_auth\.session/);
  assert.match(server, /"expiresAt" > now\(\)/);
  assert.match(server, /catch\(\(\) => false\)/, "falha fechada");
});
