"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cx } from "./cx";

export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: IconButtonSize;
  ghost?: boolean;
  /** Required: an icon-only button must always have an accessible name. */
  "aria-label": string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { size = "md", ghost = false, className, children, ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={cx(
          "mc-icon-btn",
          "mc-focusable",
          size !== "md" && `mc-icon-btn--${size}`,
          ghost && "mc-icon-btn--ghost",
          className
        )}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
