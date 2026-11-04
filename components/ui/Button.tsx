"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cx } from "./cx";
import { Spinner } from "./Spinner";

/*
 * Botão do design system MyCatalog. A API (variant/size/loading e os
 * demais atributos de <button>) é a mesma do HEAD; as classes vêm de
 * styles/primitives.css (.mc-btn e .mc-btn--*). `cva` só organiza o
 * mapeamento variante → classe, no mesmo padrão dos componentes shadcn.
 * Não usa classes utilitárias do Tailwind.
 */
const buttonVariants = cva("mc-btn mc-focusable", {
  variants: {
    variant: {
      primary: "mc-btn--primary",
      secondary: "mc-btn--secondary",
      ghost: "mc-btn--ghost",
      danger: "mc-btn--danger",
    },
    size: {
      sm: "mc-btn--sm",
      md: "",
      lg: "mc-btn--lg",
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
