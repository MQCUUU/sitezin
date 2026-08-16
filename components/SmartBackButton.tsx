"use client";

import {
  ArrowLeft,
} from "lucide-react";

import {
  RETURN_POSITION_KEY,
} from "@/components/ScrollMemory";

type ReturnPosition = {
  url: string;
  windowY: number;
  mainY: number;
  restoreRequested: boolean;
  savedAt: number;
};

export function SmartBackButton() {
  function goBack() {
    try {
      const raw =
        sessionStorage.getItem(
          RETURN_POSITION_KEY
        );

      if (raw) {
        const saved =
          JSON.parse(
            raw
          ) as ReturnPosition;

        if (
          saved?.url &&
          !saved.url.startsWith(
            "/title/"
          )
        ) {
          /*
           * Diz ao ScrollMemory que a próxima
           * abertura da página de origem deve
           * restaurar a posição salva.
           */
          sessionStorage.setItem(
            RETURN_POSITION_KEY,
            JSON.stringify({
              ...saved,

              restoreRequested:
                true,
            })
          );

          /*
           * Faz uma navegação completa para
           * a página de origem. No seu caso
           * isso é útil porque páginas como
           * /calendar montam o conteúdo via
           * fetch depois de abrir.
           *
           * replace evita deixar o /title/
           * como uma página extra no histórico.
           */
          window.location.replace(
            saved.url
          );

          return;
        }
      }
    } catch {
      // Cai no fallback abaixo.
    }

    /*
     * Se não houver origem salva,
     * volta normalmente.
     */
    window.history.back();
  }

  return (
    <button
      type="button"
      className="btn title-back-btn"
      onClick={goBack}
    >
      <ArrowLeft
        size={17}
      />

      Voltar
    </button>
  );
}