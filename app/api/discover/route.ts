import { NextRequest, NextResponse } from "next/server";

import { respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import {
  ALL_MAX_PAGES,
  clampPage,
  eligiblePage,
  genreForType,
  pageSlice,
  sortPool,
  MIN_RATING_VOTES,
  NEWEST_MIN_VOTES,
  PAGE_SIZE,
  RATING_MIN_VOTES,
  tmdbSortBy,
  TMDB_MAX_PAGES,
  totalsFor,
  type CatalogItem,
  type DiscoverSort,
  type MediaType,
  type TypeTotal,
} from "@/lib/discover/catalog";
import { parseDiscoverParams } from "@/lib/discover/params";
import { getUserProviderFilter, MY_SERVICES_SENTINEL } from "@/lib/streaming-services-server";

/*
 * V2.9 — GET /api/discover: catálogo neutro do TMDB (nada de perfil do usuário).
 *
 *   type=movie|tv  → página N do site = página N do TMDB (20 títulos), até a 500.
 *   type=all       → filmes e séries intercalados no servidor (lib/discover/catalog),
 *                    ordem global determinística, até a página 20.
 *   página fora do intervalo → normalizada para a última válida (`page` na resposta).
 *
 * Estado pessoal (Biblioteca, curtido, assistido) só dos títulos visíveis, em
 * consultas em lote, sempre do usuário da sessão.
 */
const TMDB_BASE = "https://api.themoviedb.org/3";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

type Filters = { sort: DiscoverSort; genre: string; year: string; rating: string; country: string; provider: string };

function tmdbParams(type: MediaType, page: number, f: Filters, apiKey: string, language: string, withGenres: string | null) {
  const p = new URLSearchParams({ api_key: apiKey, language, page: String(page), include_adult: "false", sort_by: tmdbSortBy(type, f.sort) });
  let minVotes = 0;

  if (withGenres) p.set("with_genres", withGenres);
  if (f.sort === "rating") minVotes = RATING_MIN_VOTES;
  if (f.rating) {
    p.set("vote_average.gte", f.rating);
    minVotes = Math.max(minVotes, MIN_RATING_VOTES);
  }
  if (f.sort === "newest") {
    // "Recentes" = já lançados (até hoje), com algumas avaliações; nada de datas futuras
    p.set(type === "movie" ? "primary_release_date.lte" : "first_air_date.lte", new Date().toISOString().slice(0, 10));
    minVotes = Math.max(minVotes, NEWEST_MIN_VOTES);
  }
  if (minVotes) p.set("vote_count.gte", String(minVotes));
  if (f.year) p.set(type === "movie" ? "primary_release_year" : "first_air_date_year", f.year);
  // país de ORIGEM (não qualquer coprodução)
  if (f.country) p.set("with_origin_country", f.country);
  if (f.provider) {
    p.set("with_watch_providers", f.provider);
    p.set("watch_region", "BR");
    p.set("with_watch_monetization_types", "flatrate|free|ads");
  }
  if (type === "tv") p.set("include_null_first_air_dates", "false");

  return p;
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) return NextResponse.json({ error: "TMDB_API_KEY não configurada" }, { status: 500 });

  const url = new URL(req.url);
  const q = parseDiscoverParams(url.searchParams);
  const language = process.env.TMDB_LANGUAGE || "pt-BR";
  const session = await auth.getSession().catch(() => null);
  const userId: string | undefined = session?.data?.user?.id;

  // "Nos meus serviços": resolvido no servidor a partir da sessão, só quando escolhido
  let provider = q.provider;

  if (provider === MY_SERVICES_SENTINEL) {
    provider = userId ? await getUserProviderFilter(userId) : "";

    if (!provider) {
      return NextResponse.json(
        { page: 1, per_page: PAGE_SIZE, total_pages: 1, total_results: 0, total_label: "0", results: [], needs_streaming_setup: true },
        { headers: NO_STORE }
      );
    }
  }

  const filters: Filters = { sort: q.sort, genre: q.genre, year: q.year, rating: q.rating, country: q.country, provider };
  const wanted: MediaType[] = q.type === "all" ? ["movie", "tv"] : [q.type];
  // gênero que não existe num tipo (ex.: Terror/Romance em séries) tira esse tipo da consulta
  const withGenres = new Map<MediaType, string | null>(wanted.map((t) => [t, q.genre ? genreForType(Number(q.genre), t) : null]));
  const types = wanted.filter((t) => !q.genre || withGenres.get(t));
  const unavailable = wanted.filter((t) => !types.includes(t));

  async function tmdbPage(type: MediaType, page: number) {
    const response = await fetch(`${TMDB_BASE}/discover/${type}?${tmdbParams(type, page, filters, apiKey!, language, withGenres.get(type) ?? null)}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 21600 },
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data?.status_message || "Erro ao consultar TMDB.");

    return {
      total: { total_results: Number(data.total_results || 0), total_pages: Number(data.total_pages || 0) } as TypeTotal,
      results: (Array.isArray(data.results) ? data.results : []).map((item: CatalogItem) => ({ ...item, media_type: type })) as CatalogItem[],
    };
  }

  /* estado pessoal de um conjunto de títulos — UMA consulta em lote (sessão) */
  type PersonalState = { library_id: string; favorite: boolean; status: string; personal_rating: number | null };

  async function loadState(items: CatalogItem[]) {
    const state = new Map<string, PersonalState>();
    const watchedOutside = new Set<string>();

    if (!userId || !items.length) return { state, watchedOutside };

    const rows = (await getDb().query(
      `WITH v AS (SELECT * FROM unnest($2::text[], $3::int[]) AS v(media_type, tmdb_id))
       SELECT m.media_type, m.tmdb_id, li.id::text AS library_id, li.favorite, li.status, li.personal_rating::float AS personal_rating,
              (li.id IS NULL AND (
                EXISTS (SELECT 1 FROM public.watch_entries we WHERE we.user_id = $1 AND we.media_id = m.id)
                OR EXISTS (SELECT 1 FROM public.activity_events ae WHERE ae.user_id = $1 AND ae.media_id = m.id
                           AND (ae.event_type IN ('series_completed', 'watch_logged', 'rewatch_started')
                                OR (ae.event_type = 'status_changed' AND ae.metadata->>'to' IN ('watched', 'rewatched', 'rewatching'))
                                OR (ae.event_type = 'library_added' AND ae.metadata->>'status' IN ('watched', 'rewatched', 'rewatching'))))
              )) AS watched_outside
       FROM v
       JOIN public.media m ON m.media_type = v.media_type AND m.tmdb_id = v.tmdb_id
       LEFT JOIN public.library_items li ON li.media_id = m.id AND li.user_id = $1`,
      [userId, items.map((i) => i.media_type), items.map((i) => Number(i.id))]
    )) as { media_type: string; tmdb_id: number; library_id: string | null; favorite: boolean; status: string | null; personal_rating: number | null; watched_outside: boolean }[];

    for (const r of rows) {
      const key = `${r.media_type}-${r.tmdb_id}`;

      if (r.library_id) state.set(key, { library_id: r.library_id, favorite: Boolean(r.favorite), status: String(r.status || ""), personal_rating: r.personal_rating });
      if (r.watched_outside) watchedOutside.add(key);
    }

    return { state, watchedOutside };
  }

  async function fetchPages(type: MediaType, from: number, to: number) {
    const pages = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
    const out: CatalogItem[] = [];

    // lotes de 10 chamadas (respeita o limite de requisições do TMDB)
    for (let i = 0; i < pages.length; i += 10) {
      const batch = await Promise.all(pages.slice(i, i + 10).map((n) => tmdbPage(type, n)));

      for (const p of batch) out.push(...p.results);
    }

    return out;
  }

  const poolPages = (total: TypeTotal) => Math.min(ALL_MAX_PAGES, Math.max(1, Math.min(total.total_pages, TMDB_MAX_PAGES)));
  // filtros pessoais só existem com sessão; sem eles, a paginação neutra fica exatamente como era
  const personal = Boolean(userId) && (q.hideWatched || q.onlyNew);

  try {
    let page = q.page;
    let pageItems: CatalogItem[] = [];
    let totals = totalsFor(q.type, {});
    let poolTrace: { key: string; eligible?: boolean }[] | undefined;
    let depthScope: "all" | "personal" | "tmdb" | null = null;
    let hidden = 0;
    let known: Awaited<ReturnType<typeof loadState>> | null = null;
    /* universo neutro ordenado (Todos, ou uma aba com filtros pessoais) */
    let universe: CatalogItem[] | null = null;

    if (types.length === 1 && !personal) {
      const type = types[0];
      let first = await tmdbPage(type, Math.min(page, TMDB_MAX_PAGES));

      // um tipo só (inclusive Todos + gênero que só existe nesse tipo): profundidade desse tipo
      totals = totalsFor(type, { [type]: first.total });

      const valid = clampPage(page, Math.min(totals.total_pages, first.total.total_pages || 1));

      if (valid !== page) {
        page = valid;
        first = await tmdbPage(type, page);
      }

      /*
       * O próprio TMDB às vezes repete um título entre páginas vizinhas (empates de
       * popularidade não têm ordem estável). A página anterior (em cache) é
       * consultada e o que já apareceu nela não aparece de novo aqui.
       */
      const previous = page > 1 ? await tmdbPage(type, page - 1).catch(() => null) : null;
      const shown = new Set((previous?.results ?? []).map((item) => item.id));

      pageItems = first.results.filter((item) => !shown.has(item.id)).slice(0, PAGE_SIZE);
      if (totals.depth_limited) depthScope = "tmdb";
    } else if (types.length === 1) {
      /*
       * Filmes/Séries COM filtros pessoais: universo = páginas 1–20 do TMDB nesta
       * aba, na ordem do TMDB (a mesma ordem neutra da aba), sem repetidos. Os
       * filtros pessoais rodam nesse universo ANTES da paginação.
       */
      const type = types[0];
      const first = await tmdbPage(type, 1);
      const more = await fetchPages(type, 2, poolPages(first.total));

      universe = [...new Map([...first.results, ...more].map((item) => [item.id, item])).values()];
      totals = totalsFor(type, { [type]: first.total });
      if (first.total.total_pages > ALL_MAX_PAGES) depthScope = "personal";
    } else if (types.length === 2) {
      /*
       * Todos: POOL FIXO (lib/discover/catalog) — páginas 1–20 de filmes e 1–20 de
       * séries (em cache), sem repetidos, ordenado pela chave real com desempate
       * total. Toda página é uma fatia desse mesmo pool: ordem global consistente.
       */
      const [m1, t1] = await Promise.all([tmdbPage("movie", 1), tmdbPage("tv", 1)]);
      const [moreMovies, moreTv] = await Promise.all([fetchPages("movie", 2, poolPages(m1.total)), fetchPages("tv", 2, poolPages(t1.total))]);

      universe = sortPool([...m1.results, ...moreMovies, ...t1.results, ...moreTv], q.sort);
      totals = totalsFor("all", { movie: m1.total, tv: t1.total });
      if (totals.depth_limited) depthScope = "all";
    }

    if (universe) {
      /*
       * Ordem: pool → dedup → ordenação neutra → filtros pessoais → paginação.
       * Os filtros pessoais só REMOVEM o que o usuário pediu para não ver; a ordem
       * relativa dos demais continua a neutra.
       */
      let excluded = (_item: CatalogItem) => false;

      if (personal) {
        const st = await loadState(universe);

        known = st;
        excluded = (item) => {
          const key = `${item.media_type}-${item.id}`;
          const s = st.state.get(key);

          return Boolean(
            (q.hideWatched && (["watched", "rewatched", "rewatching"].includes(s?.status || "") || st.watchedOutside.has(key))) ||
              (q.onlyNew && s)
          );
        };
      }

      const result = eligiblePage(universe, page, excluded);

      totals.total_pages = result.total_pages;
      page = result.page;
      pageItems = result.items;
      hidden = result.hidden;

      // diagnóstico só em desenvolvimento (?trace=1): universo neutro (e quem é elegível)
      if (process.env.NODE_ENV !== "production" && url.searchParams.get("trace") === "1") {

        poolTrace = universe.map((c) => ({
          key: `${c.media_type}-${c.id}`,
          popularity: c.popularity,
          vote_average: c.vote_average,
          vote_count: c.vote_count,
          date: c.release_date || c.first_air_date,
          ...(personal ? { eligible: !excluded(c) } : {}),
        }));
      }
    }

    // dedup defensivo
    pageItems = [...new Map(pageItems.map((item) => [`${item.media_type}-${item.id}`, item])).values()];

    // estado exibido nos cards: reaproveita o lote do universo; senão, um lote só da página
    const { state } = known ?? (await loadState(pageItems));
    const results = pageItems.map((item) => {
      const s = state.get(`${item.media_type}-${item.id}`);

      return { ...item, in_library: Boolean(s), library_id: s?.library_id ?? null, favorite: s?.favorite ?? false, library_status: s?.status ?? null, personal_rating: s?.personal_rating ?? null };
    });

    return NextResponse.json(
      {
        page,
        per_page: PAGE_SIZE,
        total_pages: totals.total_pages,
        total_results: totals.total_results,
        total_label: totals.total_label,
        total_capped: totals.total_capped,
        depth_limited: depthScope !== null,
        depth_scope: depthScope,
        unavailable_types: unavailable,
        hidden_by_personal_filters: hidden,
        personal_filters: personal,
        results,
        ...(poolTrace ? { pool: poolTrace } : {}),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("Erro em /api/discover:", error);

    return respostaDeErro(error, "GET /api/discover", 502);
  }
}
