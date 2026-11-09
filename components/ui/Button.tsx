"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cx } from "./cx";
import { Spinner } from "./Spinner";

/*
 * O botão do MyCatalog — um só. Monta as classes de `.btn` (app/globals.css,
 * styles/controls.css): `.btn` + `primary` | `ghost` | `danger`, e
 * `btn--sm` | `btn--lg`. Assim as regras de contexto (".x .btn") valem para
 * todos. Links com cara de botão usam as mesmas classes direto no <a>/<Link>.
 * `cva` só organiza o mapeamento variante → classe. Sem Tailwind.
 */
const buttonVariants = cva("btn mc-focusable", {
  variants: {
    variant: {
      primary: "primary",
      secondary: "",
      ghost: "ghost",
      danger: "danger",
    },
    size: {
      sm: "btn--sm",
      md: "",
      lg: "btn--lg",
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "md",
  },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={cx(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        data-loading={loading || undefined}
        aria-busy={loading || undefined}
        {...rest}
      >
        {children}
        {loading ? <Spinner /> : null}
      </button>
    );
  }
);
