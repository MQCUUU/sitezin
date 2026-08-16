"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";

export type ToastKind =
  | "success"
  | "error"
  | "info";

export type ToastInput = {
  title:
    string;

  description?:
    string;

  kind?:
    ToastKind;

  duration?:
    number;

  actionLabel?:
    string;

  onAction?:
    () =>
      void |
      Promise<void>;
};

type ToastItem =
  ToastInput & {
    id:
      string;

    createdAt:
      number;

    actionRunning?:
      boolean;
  };

type ToastContextValue = {
  show:
    (
      input:
        ToastInput
    ) =>
      string;

  success:
    (
      title:
        string,
      options?:
        Omit<
          ToastInput,
          "title" |
          "kind"
        >
    ) =>
      string;

  error:
    (
      title:
        string,
      options?:
        Omit<
          ToastInput,
          "title" |
          "kind"
        >
    ) =>
      string;

  info:
    (
      title:
        string,
      options?:
        Omit<
          ToastInput,
          "title" |
          "kind"
        >
    ) =>
      string;

  dismiss:
    (
      id:
        string
    ) =>
      void;

  clear:
    () =>
      void;
};

const ToastContext =
  createContext<
    ToastContextValue |
    null
  >(
    null
  );

function toastId() {
  return `toast-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

export function ToastProvider({
  children,
}: {
  children:
    ReactNode;
}) {
  const [
    toasts,
    setToasts,
  ] =
    useState<
      ToastItem[]
    >([]);

  const timers =
    useRef(
      new Map<
        string,
        ReturnType<
          typeof setTimeout
        >
      >()
    );

  const dismiss =
    useCallback(
      (
        id:
          string
      ) => {
        const timer =
          timers.current.get(
            id
          );

        if (
          timer
        ) {
          clearTimeout(
            timer
          );

          timers.current.delete(
            id
          );
        }

        setToasts(
          (
            current
          ) =>
            current.filter(
              (
                toast
              ) =>
                toast.id !==
                id
            )
        );
      },
      []
    );

  const show =
    useCallback(
      (
        input:
          ToastInput
      ) => {
        const id =
          toastId();

        const duration =
          Math.max(
            1800,
            input.duration ??
              (
                input.onAction
                  ? 7000
                  : input.kind ===
                      "error"
                    ? 5000
                    : 3500
              )
          );

        const item:
          ToastItem = {
            ...input,

            id,

            kind:
              input.kind ||
              "info",

            duration,

            createdAt:
              Date.now(),
          };

        setToasts(
          (
            current
          ) => {
            /*
             * Mantém no máximo 4 toasts.
             * O mais novo fica embaixo.
             */
            const next =
              [
                ...current,
                item,
              ];

            return next.slice(
              -4
            );
          }
        );

        const timer =
          setTimeout(
            () => {
              dismiss(
                id
              );
            },
            duration
          );

        timers.current.set(
          id,
          timer
        );

        return id;
      },
      [
        dismiss,
      ]
    );

  const success =
    useCallback(
      (
        title:
          string,
        options:
          Omit<
            ToastInput,
            "title" |
            "kind"
          > = {}
      ) =>
        show({
          ...options,
          title,
          kind:
            "success",
        }),
      [
        show,
      ]
    );

  const error =
    useCallback(
      (
        title:
          string,
        options:
          Omit<
            ToastInput,
            "title" |
            "kind"
          > = {}
      ) =>
        show({
          ...options,
          title,
          kind:
            "error",
        }),
      [
        show,
      ]
    );

  const info =
    useCallback(
      (
        title:
          string,
        options:
          Omit<
            ToastInput,
            "title" |
            "kind"
          > = {}
      ) =>
        show({
          ...options,
          title,
          kind:
            "info",
        }),
      [
        show,
      ]
    );

  const clear =
    useCallback(
      () => {
        for (
          const timer
          of timers.current.values()
        ) {
          clearTimeout(
            timer
          );
        }

        timers.current.clear();

        setToasts(
          []
        );
      },
      []
    );

  async function runAction(
    toast:
      ToastItem
  ) {
    if (
      !toast.onAction ||
      toast.actionRunning
    ) {
      return;
    }

    const timer =
      timers.current.get(
        toast.id
      );

    if (
      timer
    ) {
      clearTimeout(
        timer
      );

      timers.current.delete(
        toast.id
      );
    }

    setToasts(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            toast.id
              ? {
                  ...item,

                  actionRunning:
                    true,
                }
              : item
        )
    );

    try {
      await toast.onAction();

      dismiss(
        toast.id
      );
    } catch (
      error
    ) {
      console.error(
        "Erro na ação do toast:",
        error
      );

      dismiss(
        toast.id
      );

      show({
        title:
          "Não foi possível desfazer",

        description:
          error instanceof Error
            ? error.message
            : "Tente novamente.",

        kind:
          "error",
      });
    }
  }

  const value =
    useMemo<
      ToastContextValue
    >(
      () => ({
        show,
        success,
        error,
        info,
        dismiss,
        clear,
      }),
      [
        show,
        success,
        error,
        info,
        dismiss,
        clear,
      ]
    );

  return (
    <ToastContext.Provider
      value={
        value
      }
    >
      {
        children
      }

      <div
        className="mycatalog-toast-region"
        aria-live="polite"
        aria-label="Notificações"
      >
        {toasts.map(
          (
            toast
          ) => (
            <div
              key={
                toast.id
              }
              className={`mycatalog-toast mycatalog-toast-${toast.kind}`}
              role={
                toast.kind ===
                "error"
                  ? "alert"
                  : "status"
              }
            >
              <div className="mycatalog-toast-icon">
                {toast.kind ===
                "success" ? (
                  <CheckCircle2
                    size={18}
                  />
                ) : toast.kind ===
                  "error" ? (
                  <AlertCircle
                    size={18}
                  />
                ) : (
                  <Info
                    size={18}
                  />
                )}
              </div>

              <div className="mycatalog-toast-copy">
                <strong>
                  {
                    toast.title
                  }
                </strong>

                {toast.description && (
                  <span>
                    {
                      toast.description
                    }
                  </span>
                )}
              </div>

              {toast.onAction && (
                <button
                  type="button"
                  className="mycatalog-toast-action"
                  disabled={
                    toast.actionRunning
                  }
                  onClick={() =>
                    runAction(
                      toast
                    )
                  }
                >
                  {toast.actionRunning ? (
                    <Loader2
                      size={14}
                      className="spin"
                    />
                  ) : (
                    <RotateCcw
                      size={14}
                    />
                  )}

                  {toast.actionLabel ||
                    "Desfazer"}
                </button>
              )}

              <button
                type="button"
                className="mycatalog-toast-close"
                aria-label="Fechar notificação"
                onClick={() =>
                  dismiss(
                    toast.id
                  )
                }
              >
                <X
                  size={15}
                />
              </button>

              <span
                className="mycatalog-toast-progress"
                style={{
                  animationDuration:
                    `${toast.duration}ms`,
                }}
              />
            </div>
          )
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context =
    useContext(
      ToastContext
    );

  if (
    !context
  ) {
    throw new Error(
      "useToast precisa estar dentro de <ToastProvider>."
    );
  }

  return context;
}