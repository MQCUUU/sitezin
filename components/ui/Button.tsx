"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

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
        className={cx(
          "mc-btn",
          "mc-focusable",
          `mc-btn--${variant}`,
          size !== "md" && `mc-btn--${size}`,
          className
        )}
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
