"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cx } from "./cx";

export type InputSize = "sm" | "md" | "lg";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  size?: InputSize;
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", invalid, className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cx(
        "mc-field",
        "mc-input",
        "mc-focusable",
        size !== "md" && `mc-input--${size}`,
        className
      )}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});
