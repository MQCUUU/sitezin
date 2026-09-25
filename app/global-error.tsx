"use client";

import "./globals.css";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/primitives.css";
import "@/styles/overlays.css";
import "@/styles/shell.css";

import {
  useEffect,
} from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error:
    Error & {
      digest?:
        string;
    };

  reset:
    () =>
      void;
}) {
  useEffect(() => {
    console.error(
      "Erro global do MyCatalog:",
      error
    );
  }, [
    error,
  ]);

  return (
    <html lang="pt-BR">
      <body>
        <main className="mc-global-error">
          <div className="mc-global-error-card">
            <div className="mc-global-error-eyebrow">
              MYCATALOG
            </div>

            <h1>
              Algo saiu do lugar.
            </h1>

            <p>
              O aplicativo encontrou um erro inesperado. Tente carregar novamente.
            </p>

            <button
              type="button"
              className="mc-btn mc-btn--primary mc-focusable"
              onClick={
                reset
              }
            >
              Tentar novamente
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
