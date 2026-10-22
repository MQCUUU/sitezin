"use client";

import "@/styles/insights.css";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";

import { Search } from "@/components/Search";
import { Poster } from "@/components/Poster";
import { MediaTypeTag } from "@/components/media/MediaBadges";
import { dec } from "@/components/insights/ui";

/*
 * Ranking completo (a página Insights mostra só o Top 10).
 * Mesma regra de sempre (GET /api/ranking, ordenado no banco): títulos com
 * nota pessoal, exceto "Quero assistir"; nota 0 conta. V2.3: visual do
 * Insights, pódio com pôsteres, filtro na URL (?type=movie|tv) e lista em
 * lotes de 50 para continuar rápida com centenas de títulos.
 */

type Filtro = "all" | "movie" | "tv";

type RankingItem = {
  library_id: string;
  personal_rating: number | null;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
};

const FILTROS: [Filtro, string][] = [
  ["all", "Todos"],
  ["movie", "Filmes"],
  ["tv", "Séries"],
];

const PAGE = 50;

function RankingContent() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filtro: Filtro = search.get("type") === "movie" || search.get("type") === "tv" ? (search.get("type") as Filtro) : "all";

  const [ranking, setRanking] = useState<RankingItem[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    const controller = new AbortController();

    setRanking(null);
    setError(false);
    setVisible(PAGE);

    fetch(`/api/ranking${filtro !== "all" ? `?type=${filtro}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows) => setRanking(Array.isArray(rows) ? rows : []))
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(true);
      });

    return () => controller.abort();
  }, [filtro, retry]);

  const setFiltro = (value: Filtro) => router.replace(value === "all" ? pathname : `${pathname}?type=${value}`, { scroll: false });
  const podium = (ranking ?? []).slice(0, 3);
  const rest = (ranking ?? []).slice(3, visible);

  return (
    <>
      <Search />

      <header className="ins-header ins-header--sub">
        <div>
          <Link href="/insights#favoritos" className="ins-back">
            <ArrowLeft size={15} aria-hidden="true" /> Insights
          </Link>
          <span className="ins-eyebrow">Ranking</span>
          <h1>Suas maiores notas</h1>
          {ranking && ranking.length ? (
            <p className="ins-muted">
              {ranking.length} {ranking.length === 1 ? "título avaliado" : "títulos avaliados"}, da maior para a menor nota.
            </p>
          ) : null}
        </div>
        <div className="ins-seg" role="radiogroup" aria-label="Filtrar por tipo">
          {FILTROS.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={filtro === value} className={filtro === value ? "is-active" : ""} onClick={() => setFiltro(value)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="empty" role="alert">
          <strong>Não foi possível carregar seu ranking.</strong>
          <button type="button" className="btn primary" onClick={() => setRetry((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {!error && ranking === null ? (
        <div className="ins-skeleton" role="status" aria-label="Montando seu ranking">
          <div className="ins-skel-duo">
            <div className="mc-skeleton ins-skel-card" />
            <div className="mc-skeleton ins-skel-card" />
          </div>
        </div>
      ) : null}

      {ranking && ranking.length === 0 ? (
        <div className="empty">
          <strong>Nenhum título com nota ainda.</strong>
          <p className="muted">Avalie o que já assistiu e seu ranking aparece aqui.</p>
          <Link className="btn primary" href="/library?status=watched">
            Avaliar o que já assisti
          </Link>
        </div>
      ) : null}

      {ranking && ranking.length > 0 ? (
        <div className="ins-story">
          <ol className="ins-podium" aria-label="Top 3">
            {podium.map((item, i) => (
              <li key={item.library_id} className={`is-${i + 1}`}>
                <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="mc-focusable">
                  <span className="ins-podium-poster">
                    <Poster path={item.poster_path} alt="" sizes="(max-width: 700px) 30vw, 220px" />
                    <span className="mc-tag-slot mc-tag-slot--top">
                      <MediaTypeTag type={item.media_type} />
                    </span>
                    <span className="ins-podium-rank">{i + 1}</span>
                  </span>
                  <strong>{item.title}</strong>
                  <span className="ins-top-rating">
                    <Star size={13} fill="currentColor" aria-hidden="true" /> {item.personal_rating !== null ? dec(Number(item.personal_rating)) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          {rest.length ? (
            <ol className="ins-top ins-top--list" start={4}>
              {rest.map((item, i) => (
                <li key={item.library_id}>
                  <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="mc-focusable">
                    <span className="ins-top-rank">{i + 4}</span>
                    <span className="ins-top-poster">
                      <Poster path={item.poster_path} alt="" sizes="60px" />
                    </span>
                    <span className="ins-top-text">
                      <strong>{item.title}</strong>
                      <small>{item.media_type === "tv" ? "Série" : "Filme"}</small>
                    </span>
                    <span className="ins-top-rating">
                      <Star size={13} fill="currentColor" aria-hidden="true" /> {item.personal_rating !== null ? dec(Number(item.personal_rating)) : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : null}

          {ranking.length > visible ? (
            <button type="button" className="ins-more ins-more--center" onClick={() => setVisible((v) => v + PAGE)}>
              Mostrar mais ({ranking.length - visible} restantes)
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default function RankingPage() {
  return (
    <Suspense fallback={null}>
      <RankingContent />
    </Suspense>
  );
}
