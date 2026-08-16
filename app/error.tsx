"use client";

import {
  useEffect,
} from "react";

import {
  ErrorState,
} from "@/components/AsyncState";

export default function Error({
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
    /*
     * Em produção você pode enviar isso
     * para Sentry/Logtail/etc.
     *
     * Não mostramos stack trace para o usuário.
     */
    console.error(
      "Erro capturado pelo MyCatalog:",
      error
    );
  }, [
    error,
  ]);

  return (
    <div className="mc-route-error">
      <ErrorState
        title="Essa página encontrou um problema"
        description="Seus dados não foram perdidos. Tente carregar novamente."
        onRetry={
          reset
        }
        showHome
      />
    </div>
  );
}