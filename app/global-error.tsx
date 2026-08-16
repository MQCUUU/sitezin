"use client";

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
        <main
          style={{
            minHeight:
              "100vh",

            display:
              "grid",

            placeItems:
              "center",

            padding:
              24,

            background:
              "#090b10",

            color:
              "#f5f7fb",

            fontFamily:
              "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              width:
                "min(520px, 100%)",

              padding:
                28,

              border:
                "1px solid rgba(255,255,255,.1)",

              borderRadius:
                18,

              background:
                "#11141b",

              textAlign:
                "center",
            }}
          >
            <div
              style={{
                fontSize:
                  12,

                opacity:
                  .6,

                fontWeight:
                  800,

                letterSpacing:
                  ".08em",
              }}
            >
              MYCATALOG
            </div>

            <h1
              style={{
                margin:
                  "8px 0 8px",

                fontSize:
                  24,
              }}
            >
              Algo saiu do lugar.
            </h1>

            <p
              style={{
                margin:
                  "0 auto",

                maxWidth:
                  420,

                opacity:
                  .68,

                fontSize:
                  13,

                lineHeight:
                  1.55,
              }}
            >
              O aplicativo encontrou um erro inesperado. Tente carregar novamente.
            </p>

            <button
              type="button"
              onClick={
                reset
              }
              style={{
                marginTop:
                  18,

                minHeight:
                  40,

                padding:
                  "0 16px",

                border:
                  0,

                borderRadius:
                  10,

                background:
                  "#7c5cff",

                color:
                  "white",

                fontWeight:
                  800,

                cursor:
                  "pointer",
              }}
            >
              Tentar novamente
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}