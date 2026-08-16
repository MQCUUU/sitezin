"use client";

import { useEffect, useState } from "react";
import { Search } from "@/components/Search";
import { PosterGrid } from "@/components/PosterGrid";
import type { LibraryItem } from "@/lib/types";

/*
 * SUBSTITUI app/favorites/page.tsx
 *
 * CORREÇÃO DA PRIMEIRA VERSÃO DO LOTE 5
 *   A versão anterior chamava /api/library?favorite=true e
 *   confiava que a API filtraria. Ela NÃO filtra: o parâmetro
 *   `favorite` só é lido dentro do bloco `if (paginated)`, na
 *   linha ~495 de app/api/library/route.ts. Sem
 *   `paginated=true` todos os filtros são ignorados e a rota
 *   devolve a biblioteca inteira — por isso apareciam títulos
 *   que não são favoritos.
 *
 *   Não troquei para paginated=true porque não resolveria de
 *   verdade: nesse caminho a API também carrega todas as
 *   linhas e filtra em memória, no JavaScript do servidor. Não
 *   existe WHERE favorite = true no banco. Trocar de rota
 *   traria formato de resposta diferente e paginação, sem
 *   ganho real.
 *
 *   A correção de verdade, se a biblioteca crescer muito, é na
 *   API: aplicar .eq("favorite", true) na consulta ao Supabase,
 *   fora do bloco paginated. Aí sim o índice
 *   library_items_user_favorite_idx entra em ação.
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

    fetch("/api/library")
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

        /*
         * O filtro fica AQUI, como no arquivo original. Tem que
         * vir depois do map: `favorite` está no registro da
         * biblioteca, não no media espalhado por cima.
         */
        setItens(lista.filter((i) => i.favorite === true));

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
        <h1>Favoritos</h1>
      </div>

      {estado === "carregando" && (
        <div className="library-page-loading" role="status" aria-live="polite">
          Carregando seus favoritos…
        </div>
      )}

      {estado === "erro" && (
        <div className="empty" role="alert">
          <strong>Não foi possível carregar seus favoritos.</strong>
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
          <strong>Você ainda não marcou nenhum favorito.</strong>
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
