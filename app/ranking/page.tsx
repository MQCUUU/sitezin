"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "@/components/Search";
import { img } from "@/lib/tmdb";
import type { LibraryItem } from "@/lib/types";

/*
 * SUBSTITUI app/ranking/page.tsx
 *
 * BUG CORRIGIDO (o usuário via isto)
 *   Os três botões de filtro nunca recebiam a classe `active`.
 *   Você clicava em "Filmes", a lista encolhia, e nada na tela
 *   indicava o porquê. Agora o botão selecionado fica marcado,
 *   e o aria-pressed comunica isso a leitores de tela.
 *
 * OUTRAS CORREÇÕES
 *   - fetch sem .catch() e sem checar r.ok -> tela branca
 *     eterna se a API falhasse. Agora tem erro e retry.
 *   - <img> sem alt e sem lazy. Como o título aparece ao lado,
 *     o correto é alt="" (decorativa) — assim o leitor de tela
 *     não anuncia a mesma coisa duas vezes.
 *   - width/height na imagem para o navegador reservar espaço
 *     e não haver salto de layout (CLS).
 *   - <ol> em vez de <div>: um ranking É uma lista ordenada, e
 *     leitores de tela anunciam a posição automaticamente.
 *
 * O QUE NÃO MUDOU
 *   Mesma regra de ranqueamento: itens com nota pessoal,
 *   excluindo "quero assistir", ordenados da maior para a
 *   menor.
 */

type Filtro = "all" | "movie" | "tv";
type Estado = "carregando" | "erro" | "pronto";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "movie", label: "Filmes" },
  { id: "tv", label: "Séries" },
];

export default function Ranking() {
  const [itens, setItens] = useState<LibraryItem[]>([]);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [filtro, setFiltro] = useState<Filtro>("all");

  useEffect(() => {
    let vivo = true;

    fetch("/api/library")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((dados) => {
        if (!vivo) return;

        setItens(
          Array.isArray(dados)
            ? dados.map((i: any) => ({
                ...i,
                library_id: i.id,
                ...i.media,
              }))
            : []
        );

        setEstado("pronto");
      })
      .catch(() => {
        if (vivo) setEstado("erro");
      });

    return () => {
      vivo = false;
    };
  }, []);

  /*
   * useMemo evita reordenar a lista inteira a cada render —
   * só recalcula quando os itens ou o filtro mudam.
   */
  const ranking = useMemo(
    () =>
      itens
        .filter(
          (i) =>
            i.personal_rating !== null &&
            i.status !== "want" &&
            (filtro === "all" || i.media_type === filtro)
        )
        .sort(
          (a, b) => (b.personal_rating || 0) - (a.personal_rating || 0)
        ),
    [itens, filtro]
  );

  return (
    <>
      <Search />

      <div className="section-head section">
        <div>
          <div className="eyebrow">Seu gosto, suas regras</div>
          <h1>Meu Ranking</h1>
        </div>

        <div className="filters" role="group" aria-label="Filtrar por tipo">
          {FILTROS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`chip${filtro === id ? " active" : ""}`}
              aria-pressed={filtro === id}
              onClick={() => setFiltro(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {estado === "carregando" && (
        <div className="library-page-loading" role="status" aria-live="polite">
          Montando seu ranking…
        </div>
      )}

      {estado === "erro" && (
        <div className="empty" role="alert">
          <strong>Não foi possível carregar seu ranking.</strong>
          <p className="muted">Verifique sua conexão e tente novamente.</p>
          <button
            className="btn primary"
            onClick={() => window.location.reload()}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {estado === "pronto" && ranking.length === 0 && (
        <div className="empty">
          <strong>Nenhum título com nota ainda.</strong>
          <p className="muted">
            Avalie o que já assistiu e seu ranking aparece aqui.
          </p>
          <a className="btn primary" href="/library">
            Ir para a biblioteca
          </a>
        </div>
      )}

      {estado === "pronto" && ranking.length > 0 && (
        <div className="panel">
          <ol className="ranking-list">
            {ranking.map((item, indice) => (
              <li key={item.library_id}>
                <Link
                  className="row"
                  href={`/title/${item.media_type}/${item.tmdb_id}`}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 13,
                      alignItems: "center",
                      minWidth: 0,
                    }}
                  >
                    <b style={{ fontSize: 22, width: 35, flexShrink: 0 }}>
                      #{indice + 1}
                    </b>

                    <img
                      src={img(item.poster_path, "w92")}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={42}
                      height={62}
                      style={{
                        width: 42,
                        height: 62,
                        objectFit: "cover",
                        borderRadius: 7,
                        flexShrink: 0,
                      }}
                    />

                    <div style={{ minWidth: 0 }}>
                      <b>{item.title}</b>
                      <div className="muted">
                        {item.media_type === "tv" ? "Série" : "Filme"}
                      </div>
                    </div>
                  </div>

                  <b className="rating">
                    ★ {item.personal_rating?.toFixed(1)}
                  </b>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
