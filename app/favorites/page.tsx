"use client";

import { useEffect, useState } from "react";
import { Search } from "@/components/Search";
import { PosterGrid } from "@/components/PosterGrid";
import type { LibraryItem } from "@/lib/types";

/*
 * SUBSTITUI app/favorites/page.tsx
 *
 * D1 — FILTRO AGORA É REAL NO SERVIDOR
 *   /api/library?favorite=true agora aplica `li.favorite = true`
 *   como WHERE de verdade (mesmo fora de paginated=true — o
 *   modo não-paginado passou a aceitar os mesmos filtros
 *   dinâmicos). Não é mais necessário buscar a biblioteca
 *   inteira e filtrar no cliente.
 *
 * O QUE MUDOU EM RELAÇÃO AO ARQUIVO ORIGINAL
 *
 * 1. TRÊS ESTADOS QUE FALTAVAM
 *    Antes o fetch não tinha .catch() nem checagem de r.ok. Se
 *    a API caísse, a tela ficava em branco para sempre —
 *    indistinguível de "você não tem favoritos".
 *    Agora: carregando / erro / vazio / conteúdo.
 *
 * 2. NÃO ATUALIZA ESTADO APÓS DESMONTAR
 *    O `vivo` evita o warning (e o vazamento) de quem sai da
 *    página no meio do carregamento.
 *
 * O QUE **NÃO** MUDOU
 *    A grade continua sendo o mesmo <PosterGrid items={...} />,
 *    com os mesmos dados no mesmo formato.
 */

type Estado = "carregando" | "erro" | "pronto";

export default function Favorites() {
  const [itens, setItens] = useState<LibraryItem[]>([]);
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    let vivo = true;

    fetch("/api/library?favorite=true")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((dados) => {
        if (!vivo) return;

        const lista: LibraryItem[] = Array.isArray(dados)
          ? dados.map((i: any) => ({
              ...i,
              library_id: i.id,
              ...i.media,
            }))
          : [];

        setItens(lista);

        setEstado("pronto");
      })
      .catch(() => {
        if (vivo) setEstado("erro");
      });

    return () => {
      vivo = false;
    };
  }, []);

  return (
    <>
      <Search />

      <div className="section">
        <div className="eyebrow">O que você mais gosta</div>
        <h1>Curtidos</h1>
      </div>

      {estado === "carregando" && (
        <div className="library-page-loading" role="status" aria-live="polite">
          Carregando seus curtidos…
        </div>
      )}

      {estado === "erro" && (
        <div className="empty" role="alert">
          <strong>Não foi possível carregar seus curtidos.</strong>
          <p className="muted">
            Verifique sua conexão e tente novamente.
          </p>
          <button
            className="btn primary"
            onClick={() => window.location.reload()}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {estado === "pronto" && itens.length === 0 && (
        <div className="empty">
          <strong>Você ainda não curtiu nenhum título.</strong>
          <p className="muted">
            Toque no coração de qualquer título para guardá-lo aqui.
          </p>
          <a className="btn primary" href="/discover">
            Explorar títulos
          </a>
        </div>
      )}

      {estado === "pronto" && itens.length > 0 && (
        <PosterGrid items={itens} />
      )}
    </>
  );
}
